import httpx
from typing import Optional

from email_aliases.aliases import AliasClient
from email_aliases.mailboxes import MailboxClient
from email_aliases.user import UserClient
from email_aliases.auth import AuthClient


class SimpleLoginClient:
    def __init__(self, api_key: Optional[str] = None, base_url: str = "https://api.simplelogin.io"):
        """
        Initializes the main client which acts as a wrapper for all sub-clients.

        :param api_key: The API key for authenticated endpoints.
        :param base_url: The API base URL (defaults to official SimpleLogin API).
        """
        self.base_url = base_url.rstrip("/")

        # We create a single shared httpx Client for connection pooling
        self.client = httpx.AsyncClient()

        # Initialize sub-clients with the shared http client
        self.auth = AuthClient(base_url=self.base_url, client=self.client)

        self.user = UserClient(
            base_url=self.base_url,
            api_key=api_key,
            client=self.client
        )

        self.aliases = AliasClient(
            base_url=self.base_url,
            api_key=api_key,
            client=self.client
        )

        self.mailboxes = MailboxClient(
            base_url=self.base_url,
            api_key=api_key,
            client=self.client
        )

    async def close(self):
        """Closes the underlying shared HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


# ---------------------------------------------------------------------------
# Example Usage
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio


    # Assume these classes are defined from previous translations
    # ... (AuthClient, UserClient, MailboxClient definitions) ...

    async def main():
        # Usage with context manager (auto-closes connection)
        async with SimpleLoginClient(api_key="my-secret-key") as sl:

            # 1. Use the User sub-client
            try:
                user_info = await sl.user.get_user_info()
                print(f"User: {user_info.name}")
            except Exception as e:
                print(f"User fetch failed: {e}")

            # 2. Use the Mailbox sub-client
            try:
                boxes = await sl.mailboxes.list_mailboxes()
                print(f"Found {len(boxes.mailboxes)} mailboxes.")
            except Exception as e:
                print(f"Mailbox fetch failed: {e}")

    # asyncio.run(main())