use crate::email::aliases::AliasClient;
use crate::email::auth::AuthClient;
use crate::email::mailboxes::MailboxClient;
use crate::email::user::UserClient;
use reqwest::Client;

pub struct SimpleLoginClient {
    base_url: String,
    client: Client,
    pub auth: AuthClient,
    pub user: UserClient,
    pub aliases: AliasClient,
    pub mailboxes: MailboxClient,
}

impl SimpleLoginClient {
    pub fn new(api_key: Option<String>) -> Self {
        let client = Client::new();
        let base_url = "https://api.simplelogin.io".to_string();
        let auth = AuthClient::new(client.clone(), base_url.clone());
        let user = UserClient::new(client.clone(), base_url.clone(), api_key.clone());
        let aliases = AliasClient::new(client.clone(), base_url.clone(), api_key.clone());
        let mailboxes = MailboxClient::new(client.clone(), base_url.clone(), api_key.clone());

        Self {
            base_url,
            client,
            auth,
            user,
            aliases,
            mailboxes,
        }
    }
}
