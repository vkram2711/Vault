use std::env;
use std::error::Error;
use std::fmt;

#[derive(Debug)]
pub struct ConfigError {
    pub message: String,
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Configuration Error: {}", self.message)
    }
}

impl Error for ConfigError {}

pub struct Config {
    pub forward_email_api_key: String,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let forward_email_api_key = env::var("FORWARD_EMAIL_API_KEY")
            .map_err(|_| ConfigError {
                message: "FORWARD_EMAIL_API_KEY environment variable is not set. Please set it in your .env file or environment.".to_string(),
            })?;

        if forward_email_api_key.trim().is_empty() || forward_email_api_key == "your_api_key_here" {
            return Err(ConfigError {
                message: "FORWARD_EMAIL_API_KEY is empty or contains placeholder value. Please set a valid API key.".to_string(),
            });
        }

        Ok(Config {
            forward_email_api_key,
        })
    }
}