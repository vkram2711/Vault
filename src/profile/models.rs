use crate::profile::types::{SiteType, TrustLevel};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use time::Date;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct Audit {
    #[serde(with = "chrono::serde::ts_seconds")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub updated_at: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub last_used_at: DateTime<Utc>,
}

#[skip_serializing_none]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct Credentials {
    pub username: Option<String>,
    pub email: String,
    pub password_ref: Option<String>,
}

#[skip_serializing_none]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct Address {
    pub apartment: Option<String>,
    pub street: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
}

#[skip_serializing_none]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct Passport {
    pub number: String,
    pub country: String,
    pub expiration_date: Option<Date>,
    pub issued_date: Option<Date>,
    pub place_of_issue: Option<String>,
    pub authority: Option<String>,
}

#[skip_serializing_none]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct LegalDocuments {
    pub passport: Option<Passport>,
    pub ssn: Option<String>,
}

#[skip_serializing_none]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct PII {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub middle_name: Option<String>,
    pub full_name: Option<String>,
    pub dob: Option<String>,
    pub phone_number: Option<String>,
    pub address: Option<Address>,
    pub gender: Option<String>,
    pub race: Option<String>,
    pub nationality: Option<String>,
    pub legal_documents: Option<LegalDocuments>,
}

#[skip_serializing_none]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct Profile {
    pub id: Uuid,
    pub domain: String,
    pub title: String,
    pub credentials: Option<Credentials>,
    pub pii: Option<PII>,
    pub audit: Audit,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct ProfileIndex {
    pub id: Uuid,
    pub domain: String,
    pub title: String,
    pub site_type: SiteType,
    pub trust_level: TrustLevel,
    pub version: i32,
}
