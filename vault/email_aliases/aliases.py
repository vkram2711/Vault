import httpx
from pydantic import BaseModel
from typing import Optional, List


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class Mailbox(BaseModel):
    id: int
    email: str


class Alias(BaseModel):
    id: int
    email: str
    enabled: bool
    mailboxes: List[Mailbox]
    name: Optional[str] = None


class AliasesResponse(BaseModel):
    aliases: List[Alias]


class CreateAliasRequest(BaseModel):
    alias_prefix: str
    signed_suffix: str
    mailbox_ids: List[int]
    note: Optional[str] = None
    name: Optional[str] = None


class CreateRandomAliasRequest(BaseModel):
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# Client Implementation
# ---------------------------------------------------------------------------

class AliasClient:
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

    async def list_aliases(self, page_id: int) -> AliasesResponse:
        """
        Fetches a list of aliases (paginated).
        """
        if not self.api_key:
            raise ValueError("API Key not set")

        url = f"{self.base_url}/api/v2/aliases"
        params = {"page_id": page_id}
        headers = {"Authentication": self.api_key}

        try:
            response = await self.client.get(url, params=params, headers=headers)

            if response.status_code == 200:
                return AliasesResponse(**response.json())
            else:
                raise Exception(f"Failed to list aliases: {response.text}")

        except httpx.RequestError as e:
            raise Exception(f"Network error occurred: {e}")

    async def create_alias(
            self,
            alias_prefix: str,
            signed_suffix: str,
            mailbox_ids: List[int],
            note: Optional[str] = None,
            name: Optional[str] = None,
    ) -> Alias:
        """
        Creates a new custom alias.
        """
        if not self.api_key:
            raise ValueError("API Key not set")

        url = f"{self.base_url}/api/v3/alias/custom/new"
        headers = {"Authentication": self.api_key}

        payload = CreateAliasRequest(
            alias_prefix=alias_prefix,
            signed_suffix=signed_suffix,
            mailbox_ids=mailbox_ids,
            note=note,
            name=name
        )

        # use exclude_none=True to mimic Rust's skip_serializing_if = "Option::is_none"
        json_body = payload.model_dump(exclude_none=True)

        try:
            response = await self.client.post(url, headers=headers, json=json_body)

            if response.status_code == 201:
                return Alias(**response.json())
            else:
                raise Exception(f"Failed to create alias: {response.text}")

        except httpx.RequestError as e:
            raise Exception(f"Network error occurred: {e}")

    async def create_random_alias(
            self,
            hostname: Optional[str] = None,
            mode: Optional[str] = None,  # "uuid" or "word"
            note: Optional[str] = None,
    ) -> Alias:
        """
        Creates a new random alias.
        """
        if not self.api_key:
            raise ValueError("API Key not set")

        url = f"{self.base_url}/api/alias/random/new"
        headers = {"Authentication": self.api_key}

        # Build query parameters
        params = {}
        if hostname:
            params["hostname"] = hostname
        if mode:
            params["mode"] = mode

        payload = CreateRandomAliasRequest(note=note)
        json_body = payload.model_dump(exclude_none=True)

        try:
            response = await self.client.post(url, headers=headers, params=params, json=json_body)

            if response.status_code == 201:
                return Alias(**response.json())
            else:
                raise Exception(f"Failed to create random alias: {response.text}")

        except httpx.RequestError as e:
            raise Exception(f"Network error occurred: {e}")

    async def delete_alias(self, alias_id: int) -> bool:
        """
        Deletes an alias by ID.
        """
        if not self.api_key:
            raise ValueError("API Key not set")

        url = f"{self.base_url}/api/aliases/{alias_id}"
        headers = {"Authentication": self.api_key}

        try:
            response = await self.client.delete(url, headers=headers)

            if response.status_code == 200:
                return True
            else:
                raise Exception(f"Failed to delete alias: {response.text}")

        except httpx.RequestError as e:
            raise Exception(f"Network error occurred: {e}")

    async def close(self):
        """Closes the underlying HTTP client."""
        await self.client.aclose()