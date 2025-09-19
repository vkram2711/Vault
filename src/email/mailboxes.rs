use reqwest::Client;
use serde::Deserialize;
use std::error::Error;

#[derive(Clone)]
pub struct MailboxClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct Mailbox {
    pub id: u32,
    pub email: String,
    pub default: bool,
    pub creation_timestamp: u64,
    pub nb_alias: u32,
    pub verified: bool,
}

#[derive(Deserialize, Debug)]
pub struct MailboxesResponse {
    pub mailboxes: Vec<Mailbox>,
}

impl MailboxClient {
    pub fn new(client: Client, base_url: String, api_key: Option<String>) -> Self {
        Self {
            client,
            base_url,
            api_key,
        }
    }

    pub async fn list_mailboxes(&self) -> Result<MailboxesResponse, Box<dyn Error>> {
        let api_key = self.api_key.as_ref().ok_or("API Key not set")?;
        let res = self
            .client
            .get(format!("{}/api/v2/mailboxes", self.base_url))
            .header("Authentication", api_key)
            .send()
            .await?;

        if res.status().is_success() {
            Ok(res.json::<MailboxesResponse>().await?)
        } else {
            Err(format!("Failed to list mailboxes: {}", res.text().await?).into())
        }
    }
}
