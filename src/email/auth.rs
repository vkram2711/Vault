use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Clone)]
pub struct AuthClient {
    client: Client,
    base_url: String,
}

#[derive(Serialize)]
struct LoginRequest<'a> {
    email: &'a str,
    password: &'a str,
    device: &'a str,
}

#[derive(Deserialize, Debug)]
pub struct LoginResponse {
    pub name: String,
    pub email: String,
    pub mfa_enabled: bool,
    pub mfa_key: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Serialize)]
struct ActivateRequest<'a> {
    email: &'a str,
    code: &'a str,
}

#[derive(Serialize)]
struct RegisterRequest<'a> {
    email: &'a str,
    password: &'a str,
}

impl AuthClient {
    pub fn new(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }

    pub async fn login(
        &self,
        email: &str,
        password: &str,
        device: &str,
    ) -> Result<LoginResponse, Box<dyn Error>> {
        let res = self
            .client
            .post(format!("{}/api/auth/login", self.base_url))
            .json(&LoginRequest {
                email,
                password,
                device,
            })
            .send()
            .await?;

        match res.status() {
            reqwest::StatusCode::OK => Ok(res.json::<LoginResponse>().await?),
            reqwest::StatusCode::FORBIDDEN => Err("FIDO enabled, use API Key instead".into()),
            _ => Err(format!("Login failed: {}", res.text().await?).into()),
        }
    }

    pub async fn register(&self, email: &str, password: &str) -> Result<(), Box<dyn Error>> {
        let res = self
            .client
            .post(format!("{}/api/auth/register", self.base_url))
            .json(&RegisterRequest { email, password })
            .send()
            .await?;

        if res.status().is_success() {
            Ok(())
        } else {
            Err(format!("Registration failed: {}", res.text().await?).into())
        }
    }

    pub async fn activate(&self, email: &str, code: &str) -> Result<(), Box<dyn Error>> {
        let res = self
            .client
            .post(format!("{}/api/auth/activate", self.base_url))
            .json(&ActivateRequest { email, code })
            .send()
            .await?;

        match res.status() {
            reqwest::StatusCode::OK => Ok(()),
            reqwest::StatusCode::BAD_REQUEST => Err("Wrong email or code".into()),
            reqwest::StatusCode::GONE => {
                Err("Too many failed attempts. Request reactivation".into())
            }
            _ => Err(format!("Activation failed: {}", res.text().await?).into()),
        }
    }
}
