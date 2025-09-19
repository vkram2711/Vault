use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Clone)]
pub struct UserClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct UserInfo {
    pub name: String,
    pub is_premium: bool,
    pub email: String,
    pub in_trial: bool,
    pub profile_picture_url: Option<String>,
    pub max_alias_free_plan: Option<u32>,
}


#[derive(Serialize)]
struct ApiKeyRequest<'a> {
    device: &'a str,
}

#[derive(Deserialize, Debug)]
pub struct ApiKeyResponse {
    pub api_key: String,
}


impl UserClient {
    pub fn new(client: Client, base_url: String, api_key: Option<String>) -> Self {
        Self {
            client,
            base_url,
            api_key,
        }
    }

    pub async fn get_user_info(&self) -> Result<UserInfo, Box<dyn Error>> {
        let api_key = self.api_key.as_ref().ok_or("API Key not set")?;
        let res = self
            .client
            .get(format!("{}/api/user_info", self.base_url))
            .header("Authentication", api_key)
            .send()
            .await?;

        match res.status() {
            reqwest::StatusCode::OK => Ok(res.json::<UserInfo>().await?),
            reqwest::StatusCode::UNAUTHORIZED => Err("Invalid API Key".into()),
            _ => Err(format!("Failed to fetch user info: {}", res.text().await?).into()),
        }
    }

    pub async fn create_api_key(&self, login_api_key: &str, device: &str) -> Result<ApiKeyResponse, Box<dyn std::error::Error>> {
        let res = self.client
            .post(format!("{}/api/api_key", self.base_url))
            .header("Authentication", login_api_key)
            .json(&ApiKeyRequest { device })
            .send()
            .await?;

        match res.status() {
            reqwest::StatusCode::CREATED => Ok(res.json::<ApiKeyResponse>().await?),
            reqwest::StatusCode::UNAUTHORIZED => Err("Unauthorized".into()),
            _ => Err(format!("Failed to create API Key: {}", res.text().await?).into()),
        }
    }
}
