import httpx
from pydantic import BaseModel
from typing import List, Optional


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class Mailbox(BaseModel):
    id: int
    email: str
    default: bool
    creation_timestamp: int
    nb_alias: int
    verified: bool


class MailboxesResponse(BaseModel):
    mailboxes: List[Mailbox]


# ---------------------------------------------------------------------------
# Client Implementation
# ---------------------------------------------------------------------------

class MailboxClient:
    def __init__(self, base_url: str, api_key: Optional[str] = None, client: Optional[httpx.AsyncClient] = None):
        """
        :param base_url: The API base URL.
        :param api_key: Optional API key for authentication.
        :param client: Optional existing httpx.AsyncClient.
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        # Use provided client or create a new one
        self.client = client if client else httpx.AsyncClient()

    async def list_mailboxes(self) -> MailboxesResponse:
        """
        Fetches the list of mailboxes.
        Raises an exception if the API key is missing or the request fails.
        """
        if not self.api_key:
            raise ValueError("API Key not set")

        url = f"{self.base_url}/api/v2/mailboxes"

        # Matches Rust's .header("Authentication", api_key)
        headers = {
            "Authentication": self.api_key
        }

        try:
            response = await self.client.get(url, headers=headers)

            if response.is_success:
                return MailboxesResponse(**response.json())
            else:
                raise Exception(f"Failed to list mailboxes: {response.text}")

        except httpx.RequestError as e:
            raise Exception(f"Network error occurred: {e}")

    async def close(self):
        """Closes the underlying HTTP client."""
        await self.client.aclose()


# ---------------------------------------------------------------------------
# Example Usage
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio


    async def main():
        async with httpx.AsyncClient() as client:
            # Initialize client
            mb_client = MailboxClient(
                base_url="https://api.simplelogin.io",
                api_key="my-secret-key",
                client=client
            )

            try:
                # Fetch mailboxes
                response = await mb_client.list_mailboxes()
                for box in response.mailboxes:
                    print(f"Mailbox: {box.email} (Verified: {box.verified})")
            except Exception as e:
                print(f"Error: {e}")

    # asyncio.run(main())