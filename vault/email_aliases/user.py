from typing import Optional

import httpx
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class UserInfo(BaseModel):
    name: str
    is_premium: bool
    email: str
    in_trial: bool
    profile_picture_url: Optional[str] = None
    max_alias_free_plan: Optional[int] = None


class ApiKeyRequest(BaseModel):
    device: str


class ApiKeyResponse(BaseModel):
    api_key: str


# ---------------------------------------------------------------------------
# Client Implementation
# ---------------------------------------------------------------------------

class UserClient:
    def __init__(self, base_url: str, api_key: Optional[str] = None, client: Optional[httpx.AsyncClient] = None):
        """
        :param base_url: The API base URL.
        :param api_key: Optional API key for authentication.
        :param client: Optional existing httpx.AsyncClient.
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.client = client if client else httpx.AsyncClient()

    async def get_user_info(self) -> UserInfo:
        """
        Fetches the current user's information.
        """
        if not self.api_key:
            raise ValueError("API Key not set")

        url = f"{self.base_url}/api/user_info"
        headers = {"Authentication": self.api_key}

        try:
            response = await self.client.get(url, headers=headers)

            if response.status_code == 200:
                return UserInfo(**response.json())
            elif response.status_code == 401:
                raise Exception("Invalid API Key")
            else:
                raise Exception(f"Failed to fetch user info: {response.text}")

        except httpx.RequestError as e:
            raise Exception(f"Network error occurred: {e}")

    async def create_api_key(self, login_api_key: str, device: str) -> ApiKeyResponse:
        """
        Creates a new API key using a temporary login token/key.
        """
        url = f"{self.base_url}/api/api_key"
        # Note: Uses the passed `login_api_key`, not the stored `self.api_key`
        headers = {"Authentication": login_api_key}
        payload = ApiKeyRequest(device=device)

        try:
            response = await self.client.post(url, headers=headers, json=payload.model_dump())

            if response.status_code == 201:  # Matches reqwest::StatusCode::CREATED
                return ApiKeyResponse(**response.json())
            elif response.status_code == 401:
                raise Exception("Unauthorized")
            else:
                raise Exception(f"Failed to create API Key: {response.text}")

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
            user_client = UserClient(
                base_url="https://api.simplelogin.io",
                api_key="my_stored_api_key",
                client=client
            )

            try:
                # 1. Get User Info
                info = await user_client.get_user_info()
                print(f"User: {info.name}, Premium: {info.is_premium}")

                # 2. Create new API Key (e.g. during a login flow)
                # Note: 'temp_token' usually comes from the AuthClient login response
                new_key = await user_client.create_api_key("temp_token", "My Python Script")
                print(f"New Key Created: {new_key.api_key}")

            except Exception as e:
                print(f"Error: {e}")


    asyncio.run(main())
