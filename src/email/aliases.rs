use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Clone)]
pub struct AliasClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct Mailbox {
    pub id: u32,
    pub email: String,
}

#[derive(Deserialize, Debug)]
pub struct Alias {
    pub id: u32,
    pub email: String,
    pub enabled: bool,
    pub mailboxes: Vec<Mailbox>,
    pub name: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct AliasesResponse {
    pub aliases: Vec<Alias>,
}

#[derive(Serialize)]
struct CreateAliasRequest<'a> {
    alias_prefix: &'a str,
    signed_suffix: &'a str,
    mailbox_ids: Vec<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'a str>,
}


#[derive(Serialize)]
struct CreateRandomAliasRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<&'a str>,
}

impl AliasClient {
    pub fn new(client: Client, base_url: String, api_key: Option<String>) -> Self {
        Self {
            client,
            base_url,
            api_key,
        }
    }

    pub async fn list_aliases(&self, page_id: u32) -> Result<AliasesResponse, Box<dyn Error>> {
        let api_key = self.api_key.as_ref().ok_or("API Key not set")?;
        let res = self
            .client
            .get(format!(
                "{}/api/v2/aliases?page_id={}",
                self.base_url, page_id
            ))
            .header("Authentication", api_key)
            .send()
            .await?;

        if res.status().is_success() {
            Ok(res.json::<AliasesResponse>().await?)
        } else {
            Err(format!("Failed to list aliases: {}", res.text().await?).into())
        }
    }

    pub async fn create_alias(
        &self,
        alias_prefix: &str,
        signed_suffix: &str,
        mailbox_ids: Vec<u32>,
        note: Option<&str>,
        name: Option<&str>,
    ) -> Result<Alias, Box<dyn Error>> {
        let api_key = self.api_key.as_ref().ok_or("API Key not set")?;
        let req_body = CreateAliasRequest { alias_prefix, signed_suffix, mailbox_ids, note, name };
        let res = self.client
            .post(format!("{}/api/v3/alias/custom/new", self.base_url))
            .header("Authentication",  api_key)
            .json(&req_body)
            .send()
            .await?;

        match res.status() {
            reqwest::StatusCode::CREATED => Ok(res.json::<Alias>().await?),
            _ => Err(format!("Failed to create alias: {}", res.text().await?).into()),
        }
    }

    /// Create a new random alias
    pub async fn create_random_alias(
        &self,
        hostname: Option<&str>,
        mode: Option<&str>,  // "uuid" or "word"
        note: Option<&str>,
    ) -> Result<Alias, Box<dyn Error>> {
        let api_key = self.api_key.as_ref().ok_or("API Key not set")?;

        let mut url = format!("{}/api/alias/random/new", self.base_url);
        let mut query_params = vec![];
        if let Some(host) = hostname {
            query_params.push(format!("hostname={}", host));
        }
        if let Some(m) = mode {
            query_params.push(format!("mode={}", m));
        }
        if !query_params.is_empty() {
            url.push('?');
            url.push_str(&query_params.join("&"));
        }

        let req_body = CreateRandomAliasRequest { note };

        let res = self.client
            .post(url)
            .header("Authentication", api_key)
            .json(&req_body)
            .send()
            .await?;

        match res.status() {
            reqwest::StatusCode::CREATED => Ok(res.json::<Alias>().await?),
            _ => Err(format!("Failed to create random alias: {}", res.text().await?).into()),
        }
    }

    /// Delete an alias
    pub async fn delete_alias(&self, alias_id: u32) -> Result<bool, Box<dyn Error>> {
        let api_key = self.api_key.as_ref().ok_or("API Key not set")?;
        let res = self.client
            .delete(format!("{}/api/aliases/{}", self.base_url, alias_id))
            .header("Authentication", api_key)
            .send()
            .await?;

        match res.status() {
            reqwest::StatusCode::OK => Ok(true),
            _ => Err(format!("Failed to delete alias: {}", res.text().await?).into()),
        }
    }
}
