"""
vault_core.py

Simple hybrid vault demo:
- SQLite index (stores metadata & wrapped DEKs)
- Content-addressed encrypted blobs (AES-GCM per-blob with per-blob DEK)
- Master Key derived from password via Argon2 (preferred) or PBKDF2 (fallback)
- DEK wrapping/unwrapping via HKDF-derived wrapping key + AES-GCM
- Example: create_identity, create_secret, create_file, load_item

This is a foundation — productionization must tune Argon2 parameters,
ensure secure memory wiping (not shown), use SQLCipher for DB-level
encryption if you want, add code signing, and run security audits.
"""

import os
import json
import hashlib
import base64
import time
import secrets
from dataclasses import dataclass, asdict
from typing import Optional, Tuple

# Crypto primitives (requires `cryptography`)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Argon2 (optional, preferred)
try:
    from argon2.low_level import hash_secret_raw, Type as Argon2Type
    HAVE_ARGON2 = True
except Exception:
    HAVE_ARGON2 = False

# SQLAlchemy ORM
from sqlalchemy import Column, Integer, LargeBinary, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


# ------------------------
# Config / Constants
# ------------------------
BLOBS_DIR = "blobs/sha256"
DB_PATH = "index.sqlite"
SALT_LEN = 16
MK_LEN = 32  # 256-bit master key
DEK_LEN = 32  # 256-bit data encryption key
WRAP_INFO = b"vault-dek-wrap-v1"  # AAD for DEK wrapping
ITERATIONS_PBKDF2 = 480_000  # fallback (tune for device). Argon2 preferred.

Base = declarative_base()


# ------------------------
# Utilities
# ------------------------
def ensure_dirs():
    os.makedirs(BLOBS_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)


def now_ms() -> int:
    return int(time.time() * 1000)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def b64u(x: bytes) -> str:
    return base64.urlsafe_b64encode(x).decode('utf-8')


def b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s.encode('utf-8'))


# ------------------------
# Key derivation: Master Key (MK)
# ------------------------
def derive_master_key(password: str, salt: bytes, use_argon2: bool = True) -> bytes:
    """
    Derive a 32-byte master key from password+salt.
    Try Argon2 if available; else fall back to PBKDF2-HMAC-SHA256.
    """
    password_bytes = password.encode('utf-8')
    if use_argon2 and HAVE_ARGON2:
        # Argon2id with moderate params (tune these for each platform)
        # NOTE: Argon2 params must be tuned: time_cost, memory_cost_kib, parallelism
        time_cost = 2
        memory_cost_kib = 64 * 1024  # 64 MB -- tune lower on low-end devices
        parallelism = 1
        mk = hash_secret_raw(
            secret=password_bytes,
            salt=salt,
            time_cost=time_cost,
            memory_cost=memory_cost_kib,
            parallelism=parallelism,
            hash_len=MK_LEN,
            type=Argon2Type.ID
        )
        return mk
    else:
        # PBKDF2 fallback
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=MK_LEN,
            salt=salt,
            iterations=ITERATIONS_PBKDF2,
        )
        return kdf.derive(password_bytes)


# ------------------------
# AEAD wrappers: encrypt/decrypt with AES-GCM
# ------------------------
def aead_encrypt(key: bytes, plaintext: bytes, aad: Optional[bytes] = None) -> Tuple[bytes, bytes]:
    """
    Returns (nonce || ciphertext || tag, nonce) with AESGCM default 12-byte nonce.
    We'll store the combined ciphertext blob.
    """
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)
    ct = aesgcm.encrypt(nonce, plaintext, aad)
    return nonce + ct, nonce


def aead_decrypt(key: bytes, blob: bytes, aad: Optional[bytes] = None) -> bytes:
    """
    blob = nonce || ciphertext
    """
    nonce = blob[:12]
    ct = blob[12:]
    aesgcm = AESGCM(key)
    pt = aesgcm.decrypt(nonce, ct, aad)
    return pt


# ------------------------
# DEK wrap/unwrap via MK -> wrapping key (HKDF)
# ------------------------
def derive_wrap_key(mk: bytes, context: bytes = b"vault-wrap-key") -> bytes:
    hk = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=context
    )
    return hk.derive(mk)


def wrap_dek(mk: bytes, dek: bytes, aad: Optional[bytes] = None) -> bytes:
    wrap_key = derive_wrap_key(mk)
    wrapped_blob, nonce = aead_encrypt(wrap_key, dek, aad=aad or WRAP_INFO)
    # store as nonce || ciphertext
    return wrapped_blob


def unwrap_dek(mk: bytes, wrapped_blob: bytes, aad: Optional[bytes] = None) -> bytes:
    wrap_key = derive_wrap_key(mk)
    dek = aead_decrypt(wrap_key, wrapped_blob, aad=aad or WRAP_INFO)
    return dek


# ------------------------
# Blob storage: write/read content-addressed encrypted blobs
# ------------------------
def write_blob(ciphertext: bytes) -> str:
    """
    Content-addressed store: compute SHA-256 over ciphertext and save under blobs/sha256/<hash>.enc
    Returns the hex hash.
    """
    h = sha256_hex(ciphertext)
    path = os.path.join(BLOBS_DIR, h[:2], h[2:] + ".enc")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(ciphertext)
    return h


def read_blob_by_hash(h: str) -> bytes:
    path = os.path.join(BLOBS_DIR, h[:2], h[2:] + ".enc")
    with open(path, "rb") as f:
        return f.read()


# ------------------------
# ORM models (non-sensitive meta + wrapped DEKs)
# ------------------------
class Item(Base):
    __tablename__ = "items"

    item_id = Column(String, primary_key=True)
    domain = Column(String)
    title = Column(String)
    detail_blob_hash = Column(String)
    detail_dek_wrap = Column(LargeBinary)
    has_attachments = Column(Integer)
    site_type = Column(String)
    trust_level = Column(Integer)
    created_at = Column(Integer)
    updated_at = Column(Integer)
    version = Column(Integer)
    tombstoned = Column(Integer, default=0)


class Secret(Base):
    __tablename__ = "secrets"

    secret_id = Column(String, primary_key=True)
    item_id = Column(String)
    blob_hash = Column(String)
    dek_wrap = Column(LargeBinary)
    secret_type = Column(String)
    created_at = Column(Integer)
    updated_at = Column(Integer)


class File(Base):
    __tablename__ = "files"

    file_id = Column(String, primary_key=True)
    item_id = Column(String)
    blob_hash = Column(String)
    dek_wrap = Column(LargeBinary)
    filename = Column(String)
    mime_type = Column(String)
    size_bytes = Column(Integer)
    created_at = Column(Integer)
    updated_at = Column(Integer)


class Meta(Base):
    __tablename__ = "meta"

    key = Column(String, primary_key=True)
    value = Column(Text)


# ------------------------
# High-level blob creation helpers
# ------------------------
def make_dek() -> bytes:
    return secrets.token_bytes(DEK_LEN)


def encrypt_and_store_blob(mk: bytes, plaintext_bytes: bytes, aad: Optional[bytes] = None) -> Tuple[str, bytes]:
    """
    - Generate DEK
    - Encrypt plaintext with DEK (AES-GCM)
    - Wrap DEK with MK (AEAD)
    - store ciphertext in blobs/sha256/<hash>.enc
    - Return (blob_hash_hex, wrapped_dek_blob)
    """
    dek = make_dek()
    ciphertext, _nonce = aead_encrypt(dek, plaintext_bytes, aad=aad)
    blob_hash = write_blob(ciphertext)
    wrapped_dek = wrap_dek(mk, dek, aad=aad)
    return blob_hash, wrapped_dek


def decrypt_blob_with_wrapped_dek(mk: bytes, blob_hash: str, wrapped_dek: bytes, aad: Optional[bytes] = None) -> bytes:
    ciphertext = read_blob_by_hash(blob_hash)
    dek = unwrap_dek(mk, wrapped_dek, aad=aad)
    plaintext = aead_decrypt(dek, ciphertext, aad=aad)
    return plaintext


# ------------------------
# Data classes for JSON blobs
# ------------------------
@dataclass
class IdentityBlob:
    schema: str
    item_id: str
    name: str
    dob: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    national_id: Optional[str] = None
    tags: Optional[list] = None
    notes: Optional[str] = None
    site_specific: Optional[dict] = None
    audit: Optional[dict] = None


@dataclass
class SecretBlob:
    schema: str
    secret_id: str
    type: str  # 'password', 'totp', 'note'
    username: Optional[str]
    password: Optional[str]
    totp_uri: Optional[str] = None
    notes: Optional[str] = None
    history: Optional[list] = None
    audit: Optional[dict] = None


@dataclass
class FileBlobMeta:
    schema: str
    file_id: str
    filename: str
    mime_type: str
    description: Optional[str] = None
    audit: Optional[dict] = None
    # The actual file bytes are encrypted and stored as a separate blob; this JSON contains metadata and pointers if needed.


# ------------------------
# High-level APIs
# ------------------------
class Vault:
    def __init__(self, db_path: str = DB_PATH):
        ensure_dirs()
        self.db_path = db_path
        self.engine = create_engine(f"sqlite:///{self.db_path}", connect_args={"check_same_thread": False})
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        Base.metadata.create_all(self.engine)
        self.mk: Optional[bytes] = None
        self.salt: Optional[bytes] = None
        self._ensure_salt()

    def _ensure_salt(self):
        # salt stored in meta table; if not present, will be created
        with self.Session() as session:
            meta_row = session.get(Meta, "salt")
            if meta_row:
                self.salt = base64.b64decode(meta_row.value)
                return

            salt = secrets.token_bytes(SALT_LEN)
            session.merge(Meta(key="salt", value=base64.b64encode(salt).decode()))
            session.commit()
            self.salt = salt

    def unlock(self, password: str, use_argon2: bool = True):
        """
        Derive MK and hold in memory. In production, wrap MK with OS keystore for biometric unlocking.
        """
        self.mk = derive_master_key(password, self.salt, use_argon2=use_argon2)

    def lock(self):
        # Zero out mk if possible (best effort in Python)
        self.mk = None

    # ---- Identity operations ----
    def create_identity(self, item_id: str, domain: str, name: str, pii: dict, site_type: str = "generic", trust_level: int = 0):
        assert self.mk is not None, "Vault locked"
        blob = IdentityBlob(
            schema="vault.identity@1",
            item_id=item_id,
            name=name,
            dob=pii.get("dob"),
            email=pii.get("email"),
            phone=pii.get("phone"),
            address=pii.get("address"),
            national_id=pii.get("national_id"),
            tags=pii.get("tags", []),
            notes=pii.get("notes"),
            site_specific=pii.get("site_specific", {}),
            audit={"created_at": now_ms(), "updated_at": now_ms()}
        )
        plaintext = json.dumps(asdict(blob)).encode("utf-8")
        blob_hash, wrapped_dek = encrypt_and_store_blob(self.mk, plaintext, aad=item_id.encode())
        ts = now_ms()
        with self.Session() as session:
            session.add(Item(
                item_id=item_id,
                domain=domain,
                title=name,
                detail_blob_hash=blob_hash,
                detail_dek_wrap=wrapped_dek,
                has_attachments=0,
                site_type=site_type,
                trust_level=trust_level,
                created_at=ts,
                updated_at=ts,
                version=1,
                tombstoned=0
            ))
            session.commit()
        return blob_hash

    def load_identity(self, item_id: str) -> IdentityBlob:
        assert self.mk is not None, "Vault locked"
        with self.Session() as session:
            item = session.get(Item, item_id)
            if not item:
                raise KeyError("Item not found")
            plaintext = decrypt_blob_with_wrapped_dek(self.mk, item.detail_blob_hash, item.detail_dek_wrap, aad=item_id.encode())
            obj = json.loads(plaintext.decode("utf-8"))
            return IdentityBlob(**obj)

    def update_identity(self, item_id: str, updates: dict) -> IdentityBlob:
        """
        Merge provided fields into the stored identity, re-encrypt, and bump version/update timestamps.
        """
        assert self.mk is not None, "Vault locked"
        with self.Session() as session:
            item = session.get(Item, item_id)
            if not item:
                raise KeyError("Item not found")

            plaintext = decrypt_blob_with_wrapped_dek(self.mk, item.detail_blob_hash, item.detail_dek_wrap, aad=item_id.encode())
            obj = json.loads(plaintext.decode("utf-8"))

            # merge updates shallowly
            obj.update({k: v for k, v in updates.items() if v is not None})
            obj.setdefault("audit", {})
            obj["audit"]["updated_at"] = now_ms()

            # keep title/domain in sync when provided
            if "name" in updates and updates["name"] is not None:
                item.title = updates["name"]
            if "domain" in updates and updates["domain"] is not None:
                item.domain = updates["domain"]

            ts = now_ms()
            new_blob = json.dumps(obj).encode("utf-8")
            blob_hash, wrapped_dek = encrypt_and_store_blob(self.mk, new_blob, aad=item_id.encode())

            item.detail_blob_hash = blob_hash
            item.detail_dek_wrap = wrapped_dek
            item.updated_at = ts
            item.version = (item.version or 1) + 1
            session.commit()
            return IdentityBlob(**obj)

    # ---- Secret operations ----
    def create_secret(self, secret_id: str, item_id: str, secret_type: str, username: Optional[str], password: Optional[str], totp_uri: Optional[str] = None, notes: Optional[str] = None):
        assert self.mk is not None, "Vault locked"
        blob = SecretBlob(
            schema="vault.secret@1",
            secret_id=secret_id,
            type=secret_type,
            username=username,
            password=password,
            totp_uri=totp_uri,
            notes=notes,
            history=[],
            audit={"created_at": now_ms(), "updated_at": now_ms()}
        )
        plaintext = json.dumps(asdict(blob)).encode("utf-8")
        blob_hash, wrapped_dek = encrypt_and_store_blob(self.mk, plaintext, aad=secret_id.encode())
        ts = now_ms()
        with self.Session() as session:
            session.add(Secret(
                secret_id=secret_id,
                item_id=item_id,
                blob_hash=blob_hash,
                dek_wrap=wrapped_dek,
                secret_type=secret_type,
                created_at=ts,
                updated_at=ts
            ))
            session.commit()
        return blob_hash

    def load_secret(self, secret_id: str) -> SecretBlob:
        assert self.mk is not None, "Vault locked"
        with self.Session() as session:
            secret = session.get(Secret, secret_id)
            if not secret:
                raise KeyError("Secret not found")
            plaintext = decrypt_blob_with_wrapped_dek(self.mk, secret.blob_hash, secret.dek_wrap, aad=secret_id.encode())
            obj = json.loads(plaintext.decode("utf-8"))
            return SecretBlob(**obj)

    def update_secret(self, secret_id: str, updates: dict) -> SecretBlob:
        """
        Merge provided fields into the stored secret, re-encrypt, and update timestamps.
        """
        assert self.mk is not None, "Vault locked"
        with self.Session() as session:
            secret = session.get(Secret, secret_id)
            if not secret:
                raise KeyError("Secret not found")

            plaintext = decrypt_blob_with_wrapped_dek(self.mk, secret.blob_hash, secret.dek_wrap, aad=secret_id.encode())
            obj = json.loads(plaintext.decode("utf-8"))

            obj.update({k: v for k, v in updates.items() if v is not None})
            obj.setdefault("audit", {})
            obj["audit"]["updated_at"] = now_ms()

            ts = now_ms()
            new_blob = json.dumps(obj).encode("utf-8")
            blob_hash, wrapped_dek = encrypt_and_store_blob(self.mk, new_blob, aad=secret_id.encode())

            secret.blob_hash = blob_hash
            secret.dek_wrap = wrapped_dek
            secret.updated_at = ts
            session.commit()
            return SecretBlob(**obj)

    # ---- File operations ----
    def add_file(self, file_id: str, item_id: str, filename: str, mime_type: str, file_bytes: bytes, description: Optional[str] = None):
        assert self.mk is not None, "Vault locked"
        # store file bytes as a blob (separate from JSON metadata)
        file_blob_hash, file_wrapped_dek = encrypt_and_store_blob(self.mk, file_bytes, aad=file_id.encode())
        # metadata blob (small JSON) - could be inline in DB; we use files table meta only
        ts = now_ms()
        with self.Session() as session:
            session.add(File(
                file_id=file_id,
                item_id=item_id,
                blob_hash=file_blob_hash,
                dek_wrap=file_wrapped_dek,
                filename=filename,
                mime_type=mime_type,
                size_bytes=len(file_bytes),
                created_at=ts,
                updated_at=ts
            ))
            # mark item has_attachments
            session.query(Item).filter(Item.item_id == item_id).update({"has_attachments": 1, "updated_at": ts})
            session.commit()
        return file_blob_hash

    def load_file(self, file_id: str) -> bytes:
        assert self.mk is not None, "Vault locked"
        with self.Session() as session:
            file_row = session.get(File, file_id)
            if not file_row:
                raise KeyError("File not found")
            plaintext = decrypt_blob_with_wrapped_dek(self.mk, file_row.blob_hash, file_row.dek_wrap, aad=file_id.encode())
            return plaintext

    # ---- Utility: list items ----
    def list_items(self):
        with self.Session() as session:
            items = session.query(Item).order_by(Item.updated_at.desc()).all()
            return [
                {
                    "item_id": i.item_id,
                    "domain": i.domain,
                    "title": i.title,
                    "created_at": i.created_at,
                    "updated_at": i.updated_at,
                }
                for i in items
            ]

    def list_secrets_for_item(self, item_id: str):
        """
        Return lightweight secret metadata for a given item_id.
        """
        with self.Session() as session:
            secrets_rows = session.query(Secret.secret_id, Secret.secret_type).filter(Secret.item_id == item_id).all()
            return [{"secret_id": sid, "secret_type": stype} for sid, stype in secrets_rows]


# ------------------------
# Quick demo (non-executed here)
# ------------------------
if __name__ == "__main__":
    # This section is a quick usage example. Uncomment to run locally after installing dependencies.

    vault = Vault()
    vault.unlock("my very strong password")
    item_id = "item-" + secrets.token_hex(8)
    vault.create_identity(item_id, "example.com", "Example Alias", {
        "email": "alias+ex@example.com",
        "phone": "+15550001111",
        "dob": "1990-01-01",
        "address": "1 Example St"
    }, site_type="shop", trust_level=0)
    secret_id = "sec-" + secrets.token_hex(8)
    vault.create_secret(secret_id, item_id, "password", "alias+ex@example.com", "p4$$word123")
    # Add a file
    file_id = "file-" + secrets.token_hex(8)
    vault.add_file(file_id, item_id, "passport.jpeg", "image/jpeg", open("passport.jpeg", "rb").read())
    print("Items:", vault.list_items())

    #pass
