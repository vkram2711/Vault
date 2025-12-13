from enum import Enum
from typing import Optional
from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

# ---------------------------------------------------------------------------
# Mocks for types imported from crate::profile::types
# In a real project, these would be imported from another module.
# ---------------------------------------------------------------------------
class SiteType(str, Enum):
    # Example placeholder values
    BLOG = "BLOG"
    ECOMMERCE = "ECOMMERCE"

class TrustLevel(str, Enum):
    # Example placeholder values
    LOW = "LOW"
    HIGH = "HIGH"

# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class Audit(BaseModel):
    """
    Corresponds to the Rust Audit struct.
    Note: Rust uses `ts_seconds` (Unix timestamp integer).
    Pydantic defaults to ISO8601 strings for JSON.
    To strictly match Rust's JSON output (int), custom serializers would be needed.
    """
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime

class Credentials(BaseModel):
    username: Optional[str] = None
    email: str
    password_ref: Optional[str] = None

class Address(BaseModel):
    apartment: Optional[str] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None

class Passport(BaseModel):
    number: str
    country: str
    expiration_date: Optional[date] = None
    issued_date: Optional[date] = None
    place_of_issue: Optional[str] = None
    authority: Optional[str] = None

class LegalDocuments(BaseModel):
    passport: Optional[Passport] = None
    ssn: Optional[str] = None

class PII(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    full_name: Optional[str] = None
    dob: Optional[str] = None  # Rust string, though often a date in logic
    phone_number: Optional[str] = None
    address: Optional[Address] = None
    gender: Optional[str] = None
    race: Optional[str] = None
    nationality: Optional[str] = None
    legal_documents: Optional[LegalDocuments] = None

class Profile(BaseModel):
    id: UUID
    domain: str
    title: str
    credentials: Optional[Credentials] = None
    pii: Optional[PII] = None
    audit: Audit

class ProfileIndex(BaseModel):
    id: UUID
    domain: str
    title: str
    site_type: SiteType
    trust_level: TrustLevel
    version: int

# ---------------------------------------------------------------------------
# Example Usage (Demonstrating Serialization)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Create an example Audit
    audit_log = Audit(
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        last_used_at=datetime.utcnow()
    )

    # Create an example Profile
    # Note: We omit optional fields to show how they behave like Option::None
    profile = Profile(
        id="550e8400-e29b-41d4-a716-446655440000",
        domain="example.com",
        title="User Profile",
        audit=audit_log
    )

    # Print object
    print(f"Loaded Profile ID: {profile.id}")

    # Serialize to JSON (replicating `skip_serializing_none`)
    # In Pydantic, we use exclude_none=True to mimic that Rust behavior.
    print("\nJSON Output:")
    print(profile.model_dump_json(indent=2, exclude_none=True))