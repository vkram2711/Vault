import random
import secrets
import string


def generate_secure_password(length: int) -> str:
    """
    Generates a secure password with a minimum length of 8.
    Guarantees at least one uppercase, lowercase, digit, and symbol.
    """
    if length < 8:
        raise ValueError("Password should be at least 8 characters")

    # Define constants
    # We use string constants for letters/digits, but define symbols
    # explicitly to match the specific Rust byte string exactly.
    uppercase = string.ascii_uppercase
    lowercase = string.ascii_lowercase
    digits = string.digits
    symbols = "!@#$%^&*()-_=+[]{}<>?/"

    password_chars = []

    # Ensure at least one of each category using a cryptographically secure RNG
    password_chars.append(secrets.choice(uppercase))
    password_chars.append(secrets.choice(lowercase))
    password_chars.append(secrets.choice(digits))
    password_chars.append(secrets.choice(symbols))

    # Fill the rest from all categories
    all_chars = uppercase + lowercase + digits + symbols
    remaining_length = length - 4

    for _ in range(remaining_length):
        password_chars.append(secrets.choice(all_chars))

    # Shuffle to avoid predictable category order.
    # We use SystemRandom to ensure the shuffle itself is cryptographically secure.
    random.SystemRandom().shuffle(password_chars)

    return "".join(password_chars)
