import httpx
from pydantic import BaseModel
from typing import Optional


# ---------------------------------------------------------------------------
# Data Models (Serde equivalents)
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str
    device: str


class LoginResponse(BaseModel):
    name: str
    email: str
    mfa_enabled: bool
    mfa_key: Optional[str] = None
    api_key: Optional[str] = None


class ActivateRequest(BaseModel):
    email: str
    code: str


class RegisterRequest(BaseModel):
    email: str
    password: str


# ---------------------------------------------------------------------------
# Client Implementation
# ---------------------------------------------------------------------------

class AuthClient:
    def __init__(self, base_url: str, client: Optional[httpx.AsyncClient] = None):
        """
        :param base_url: The API base URL.
        :param client: Optional existing httpx.AsyncClient. If None, one is created per request
                       (or you can manage the lifecycle externally).
        """
        self.base_url = base_url.rstrip("/")
        # In Python, we usually pass the client in or manage it via a context manager.
        # Here we store it to match the Rust struct structure.
        self.client = client if client else httpx.AsyncClient()

    async def login(self, email: str, password: str, device: str) -> LoginResponse:
        url = f"{self.base_url}/api/auth/login"
        payload = LoginRequest(email=email, password=password, device=device)

        try:
            response = await self.client.post(url, json=payload.model_dump())

            if response.status_code == 200:
                # Parse JSON into Pydantic model
                return LoginResponse(**response.json())

            elif response.status_code == 403:
                raise Exception("FIDO enabled, use API Key instead")

            else:
                # Capture text from error response
                raise Exception(f"Login failed: {response.text}")

        except httpx.RequestError as e:
            raise Exception(f"Network error occurred: {e}")

    async def register(self, email: str, password: str) -> None:
        url = f"{self.base_url}/api/auth/register"
        payload = RegisterRequest(email=email, password=password)

        try:
            response = await self.client.post(url, json=payload.model_dump())

            if response.is_success:
                return None
            else:
                raise Exception(f"Registration failed: {response.text}")

        except httpx.RequestError as e:
            raise Exception(f"Network error occurred: {e}")

    async def activate(self, email: str, code: str) -> None:
        url = f"{self.base_url}/api/auth/activate"
        payload = ActivateRequest(email=email, code=code)

        try:
            response = await self.client.post(url, json=payload.model_dump())

            if response.status_code == 200:
                return None

            elif response.status_code == 400:
                raise Exception("Wrong email or code")

            elif response.status_code == 410:  # HTTP 410 Gone
                raise Exception("Too many failed attempts. Request reactivation")

            else:
                raise Exception(f"Activation failed: {response.text}")

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
        # Context manager usage is best practice in Python to ensure cleanup
        async with httpx.AsyncClient() as client:
            auth = AuthClient(base_url="https://api.example.com", client=client)

            # Example: Login
            try:
                user = await auth.login("user@example.com", "password123", "macbook")
                print(f"Logged in as: {user.name}")
            except Exception as e:
                print(f"Error: {e}")

    asyncio.run(main())