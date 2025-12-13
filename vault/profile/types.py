from enum import Enum


class SiteType(str, Enum):
    """
    Corresponds to the Rust SiteType enum.
    Inheriting from str makes it serialize to JSON strings automatically.
    Values are snake_case to match #[serde(rename_all = "snake_case")].
    """
    BANK = "bank"
    GOVERNMENT = "government"
    UNIVERSITY = "university"
    HEALTHCARE = "healthcare"
    INSURANCE = "insurance"
    AIRLINE = "airline"
    PROFESSIONAL = "professional"
    TRAVEL = "travel"
    ECOMMERCE = "ecommerce"
    SOCIAL_MEDIA = "social_media"
    ENTERTAINMENT = "entertainment"
    GAMING = "gaming"
    UTILITIES = "utilities"  # gas, electricity, water
    TELECOM = "telecom"  # mobile carriers, ISPs
    CLOUD_STORAGE = "cloud_storage"
    EMAIL_PROVIDER = "email_provider"
    NEWS = "news"
    FORUM = "forum"
    DEVELOPER_TOOLS = "developer_tools"
    CRYPTOCURRENCY = "cryptocurrency"
    OTHER = "other"  # fallback


class TrustLevel(str, Enum):
    """
    Corresponds to the Rust TrustLevel enum.
    """
    REAL = "real"  # e.g., banks, government
    PROMPT = "prompt"  # e.g., social media, ecommerce
    ALIAS = "alias"  # e.g., forums, entertainment
