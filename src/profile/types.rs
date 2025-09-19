use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum SiteType {
    Bank,
    Government,
    University,
    Healthcare,
    Insurance,
    Airline,
    Professional,
    Travel,
    Ecommerce,
    SocialMedia,
    Entertainment,
    Gaming,
    Utilities,      // gas, electricity, water
    Telecom,        // mobile carriers, ISPs
    CloudStorage,
    EmailProvider,
    News,
    Forum,
    DeveloperTools,
    Cryptocurrency,
    Other,          // fallback
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TrustLevel {
    Real,           // e.g., banks, government
    Prompt,         // e.g., social media, ecommerce
    Alias,          // e.g., forums, entertainment
}