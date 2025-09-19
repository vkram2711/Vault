use crate::email::api::{SimpleLoginClient};
use crate::config::Config;
use dotenvy::dotenv;
use std::env;


mod config;
mod utils;
mod email;
mod profile;
mod secrets;

//fn main() {
//    println!("Hello, world!");
//    println!("{}", profile::generator::generate_username());
//    println!("{}", secrets::generator::generate_secure_password(20));
//}



#[tokio::main]
async fn main() {
    // 1️⃣ Initialize client
    let client = SimpleLoginClient::new(None); // None because we don’t have API key yet
    dotenv().ok();
    // 2️⃣ Login
    let email = env::var("SL_EMAIL").expect("SL_EMAIL must be set in .env"); 
    let password = env::var("SL_PASSWORD").expect("SL_PASSWORD must be set in .env");  
    let device = env::var("SL_DEVICE").expect("SL_DEVICE must be set in .env"); 

    let login_resp = client.auth.login(&*email, &*password, &*device).await;
    let login_resp = match login_resp {
        Ok(resp) => resp,
        Err(err) => {
            eprintln!("Login failed: {}", err);
            return;
        }
    };

    // 3️⃣ Handle MFA or get API Key
    let api_key = if login_resp.mfa_enabled {
        println!("MFA is enabled. Use MFA key: {}", login_resp.mfa_key.unwrap_or_default());
        return; // For simplicity, stop here. You'd handle OTP in a real app.
    } else {
        login_resp.api_key.unwrap()
    };

    println!("Logged in! API Key: {}", api_key);

    // 4️⃣ Re-initialize client with API Key
    let client = SimpleLoginClient::new(Some(api_key.clone()));

    // 5️⃣ Get alias options (example: generate new custom alias)
    let alias_options = client.aliases.list_aliases(0).await;
    match alias_options {
        Ok(aliases) => {
            println!("Existing aliases: {:?}", aliases.aliases);
        }
        Err(err) => {
            eprintln!("Failed to list aliases: {}", err);
            return;
        }
    }

    // Create a random alias
    let random_alias = client.aliases.create_random_alias(
        Some("example.com"), // optional hostname
        Some("word"),        // optional mode: "uuid" or "word"
        Some("My random alias note") // optional note
    ).await.unwrap();

    println!("Random alias created: {:?}", random_alias);
}
