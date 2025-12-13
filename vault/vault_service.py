import asyncio
import os
import secrets
from typing import Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from email_aliases.api import SimpleLoginClient
from profile.generator import generate_username, generate_full_name
from profile_secrets.generator import generate_secure_password
from vault.vault import Vault


def _stringify_domain(value):
    """
    Accepts string or alias-like dict, returns string domain/email.
    """
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("email") or value.get("domain") or value.get("name") or str(value.get("id") or value)
    return str(value)


def _stringify_title(value):
    """
    Accepts string or alias-like dict, returns a displayable title.
    """
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("name") or value.get("email") or value.get("domain") or str(value.get("id") or value)
    return str(value)


class VaultService:
    """
    Orchestrates vault CRUD plus helper generators (passwords, aliases, usernames).
    """

    def __init__(self, vault: Optional[Vault] = None):
        self.vault = vault or Vault()

    # ---- Vault lifecycle ----
    def unlock(self, password: str, use_argon2: bool = True):
        self.vault.unlock(password, use_argon2=use_argon2)

    def lock(self):
        self.vault.lock()

    def _require_unlocked(self):
        if self.vault.mk is None:
            raise RuntimeError("Vault locked. Call /unlock first.")

    # ---- Generators ----
    def generate_password(self, length: int = 16) -> str:
        return generate_secure_password(length)

    def generate_username(self) -> str:
        return generate_username()

    def generate_full_name(self) -> str:
        return generate_full_name()

    # ---- Email alias (SimpleLogin) ----
    async def _create_alias_async(self, api_key: str, hostname: Optional[str], mode: str, note: Optional[str]):
        async with SimpleLoginClient(api_key=api_key) as client:
            return await client.aliases.create_random_alias(hostname=hostname, mode=mode, note=note)

    def create_alias(self, api_key: str, hostname: Optional[str] = None, mode: str = "word", note: Optional[str] = None):
        alias_obj = asyncio.run(self._create_alias_async(api_key, hostname, mode, note))
        # ensure JSON-serializable
        if hasattr(alias_obj, "model_dump"):
            return alias_obj.model_dump()
        return alias_obj

    # ---- Vault operations ----
    def create_identity(self, domain: str, name: str, pii: dict, site_type: str = "generic", trust_level: int = 0, item_id: Optional[str] = None):
        self._require_unlocked()
        iid = item_id or f"item-{secrets.token_hex(8)}"
        domain_str = _stringify_domain(domain)
        title_str = _stringify_title(name)
        blob_hash = self.vault.create_identity(iid, domain_str, title_str, pii, site_type=site_type, trust_level=trust_level)
        return {"item_id": iid, "blob_hash": blob_hash}

    def update_identity(self, item_id: str, updates: dict):
        self._require_unlocked()
        blob = self.vault.update_identity(item_id, updates)
        return blob

    def load_identity(self, item_id: str):
        self._require_unlocked()
        return self.vault.load_identity(item_id)

    def create_secret(self, item_id: str, secret_type: str, username: Optional[str], password: Optional[str], totp_uri: Optional[str] = None, notes: Optional[str] = None, secret_id: Optional[str] = None):
        self._require_unlocked()
        sid = secret_id or f"sec-{secrets.token_hex(8)}"
        blob_hash = self.vault.create_secret(sid, item_id, secret_type, username, password, totp_uri=totp_uri, notes=notes)
        return {"secret_id": sid, "blob_hash": blob_hash}

    def update_secret(self, secret_id: str, updates: dict):
        self._require_unlocked()
        blob = self.vault.update_secret(secret_id, updates)
        return blob

    def load_secret(self, secret_id: str):
        self._require_unlocked()
        return self.vault.load_secret(secret_id)

    def list_items(self):
        self._require_unlocked()
        return self.vault.list_items()

    def list_secrets_for_item(self, item_id: str):
        self._require_unlocked()
        return self.vault.list_secrets_for_item(item_id)


def create_app(service: Optional[VaultService] = None) -> Flask:
    load_dotenv()
    svc = service or VaultService()
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": ["chrome-extension://*", "http://localhost:*", "http://127.0.0.1:*"]}})

    @app.errorhandler(Exception)
    def handle_error(err):
        return jsonify({"error": str(err)}), 400

    @app.post("/unlock")
    def unlock():
        data = request.get_json(force=True)
        svc.unlock(data.get("password"), use_argon2=data.get("use_argon2", True))
        return jsonify({"status": "unlocked"})

    @app.post("/lock")
    def lock():
        svc.lock()
        return jsonify({"status": "locked"})

    @app.post("/password")
    def password():
        data = request.get_json(force=True) if request.data else {}
        length = int(data.get("length", 16))
        pwd = svc.generate_password(length)
        return jsonify({"password": pwd})

    @app.post("/alias")
    def alias():
        data = request.get_json(force=True)
        api_key = os.getenv("SL_API_KEY")
        hostname = data.get("hostname")
        mode = data.get("mode", "word")
        note = data.get("note")
        alias_resp = svc.create_alias(api_key, hostname=hostname, mode=mode, note=note)
        return jsonify({"alias": alias_resp})

    @app.post("/identity")
    def create_identity():
        data = request.get_json(force=True) if request.data else {}

        domain_val = data.get("domain")
        domain = _stringify_domain(domain_val)
        name_val = data.get("name")
        title = _stringify_title(name_val)
        res = svc.create_identity(
            domain=domain,
            name=title,
            pii=data.get("pii", {}),
            site_type=data.get("site_type", "generic"),
            trust_level=int(data.get("trust_level", 0)),
            item_id=data.get("item_id"),
        )
        return jsonify(res)

    @app.put("/identity/<item_id>")
    def update_identity(item_id: str):
        data = request.get_json(force=True)
        blob = svc.update_identity(item_id, data)
        return jsonify(blob.__dict__)

    @app.get("/identity/<item_id>")
    def load_identity(item_id: str):
        blob = svc.load_identity(item_id)
        return jsonify(blob.__dict__)

    @app.post("/secret")
    def create_secret():
        data = request.get_json(force=True)
        password = data.get("password")
        if not password and data.get("generate_length"):
            password = svc.generate_password(int(data["generate_length"]))
        res = svc.create_secret(
            item_id=data["item_id"],
            secret_type=data.get("secret_type", "password"),
            username=data.get("username"),
            password=password,
            totp_uri=data.get("totp_uri"),
            notes=data.get("notes"),
            secret_id=data.get("secret_id"),
        )
        return jsonify(res)

    @app.put("/secret/<secret_id>")
    def update_secret(secret_id: str):
        data = request.get_json(force=True)
        blob = svc.update_secret(secret_id, data)
        return jsonify(blob.__dict__)

    @app.get("/secret/<secret_id>")
    def load_secret(secret_id: str):
        blob = svc.load_secret(secret_id)
        return jsonify(blob.__dict__)

    @app.get("/items")
    def list_items():
        return jsonify(svc.list_items())

    @app.get("/items/<item_id>/secrets")
    def secrets_for_item(item_id):
        rows = svc.list_secrets_for_item(item_id)
        return jsonify(rows)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)


