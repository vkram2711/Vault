import asyncio
import os

from dotenv import load_dotenv

from email_aliases.api import SimpleLoginClient


async def main():
    # Load environment variables from .env file
    load_dotenv()

    async with SimpleLoginClient(api_key=None) as client:
        #email = os.getenv("SL_EMAIL")
        #password = os.getenv("SL_PASSWORD")
        #device = os.getenv("SL_DEVICE")
#
        #if not all([email, password, device]):
        #    print("Error: SL_EMAIL, SL_PASSWORD, and SL_DEVICE must be set in .env")
        #    return
#
        #print(f"Attempting login for {email}...")
#
        #try:
        #    login_resp = await client.auth.login(email, password, device)
        #except Exception as e:
        #    print(f"Login failed: {e}")
        #    return
#
        #if login_resp.mfa_enabled:
        #    print(f"MFA is enabled. Use MFA key: {login_resp.mfa_key or 'None'}")
        #    return  # Stop here as per original Rust logic
#
        #if not login_resp.api_key:
        #    print("Error: Login successful but no API key returned.")
        #    return

        #api_key = login_resp.api_key
        api_key = os.getenv("SL_API_KEY")
        print(f"Logged in! API Key: {api_key}")

    # We start a new session now that we have the key
    async with SimpleLoginClient(api_key=api_key) as client:

        # 5️⃣ Get alias options
        try:
            alias_options = await client.aliases.list_aliases(page_id=0)
            print(f"Existing aliases: {alias_options.aliases}")
        except Exception as e:
            print(f"Failed to list aliases: {e}")
            return

        # Create a random alias
        try:
            random_alias = await client.aliases.create_random_alias(
                hostname="example.com",  # optional
                mode="word",  # optional: "uuid" or "word"
                note="My random alias note"
            )
            print(f"Random alias created: {random_alias}")
        except Exception as e:
            print(f"Failed to create random alias: {e}")


if __name__ == "__main__":
    asyncio.run(main())
