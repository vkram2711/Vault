import random


def generate_username() -> str:
    """
    Generates a random username using various formats (CamelCase, snake_case, etc.).
    """
    adjectives = [
        "Ancient", "Bright", "Curious", "Dizzy", "Electric", "Fuzzy",
        "Gentle", "Hidden", "Jolly", "Kind", "Lucky", "Mighty", "Noisy",
        "Odd", "Proud", "Quick", "Rare", "Silly", "Tiny", "Vivid", "Witty"
    ]

    nouns = [
        "Falcon", "Wanderer", "Otter", "Nebula", "Shadow", "Wizard",
        "Phoenix", "Koala", "Comet", "Knight", "Golem", "Tiger", "Cloud",
        "Blizzard", "Cricket", "Raven", "Puma", "Cobra", "Breeze", "Flame"
    ]

    suffixes = ["x", "v2", "alpha", "42", "99", "zero", "nova", "2025"]

    # Define formatting patterns using lambdas (equivalent to Rust closures).
    # All lambdas accept (adj, noun, num, suf) even if they don't use all of them.
    formats = [
        # Format: AdjectiveNounNumber (e.g., AncientFalcon123)
        lambda adj, noun, num, suf: f"{adj}{noun}{num}",

        # Format: adj_noun_num (e.g., ancient_falcon_123)
        lambda adj, noun, num, suf: f"{adj.lower()}_{noun.lower()}_{num}",

        # Format: AdjectiveNounSuffix (e.g., AncientFalconAlpha)
        lambda adj, noun, num, suf: f"{adj}{noun}{suf}",

        # Format: NounNumberAdjective (e.g., Falcon123Ancient)
        lambda adj, noun, num, suf: f"{noun}{num}{adj}",

        # Format: SuffixAdjectiveNounNumber (e.g., xAncientFalcon123)
        lambda adj, noun, num, suf: f"{suf}{adj}{noun}{num}",
    ]

    # Select random components
    adj = random.choice(adjectives)
    noun = random.choice(nouns)
    # Rust 10..9999 is exclusive of the upper bound.
    # Python randint is inclusive, so we use 9998.
    number = random.randint(10, 9998)
    suffix = random.choice(suffixes)

    # Select a random format function and execute it
    formatter = random.choice(formats)
    return formatter(adj, noun, number, suffix)


def generate_first_name() -> str:
    first_names = [
        "Lena", "Kai", "Nova", "Arlo", "Sasha", "Ezra", "Rhea", "Juno", "Milo", "Niko",
        "Lyra", "Theo", "Astra", "Orin", "Zara", "Calix", "Nia", "Elio", "Tova", "Kian"
    ]
    return random.choice(first_names)


def generate_last_name() -> str:
    last_names = [
        "Moon", "Wraith", "Redwood", "Stone", "Nightwalker", "Flameborn", "Storm",
        "Dusk", "Ironwood", "Ashcroft", "Winter", "Blackthorn", "Starling",
        "Brightwind", "Frost", "Hollow", "Raven", "Skydancer", "Thorne", "Wolfhart"
    ]
    return random.choice(last_names)


def generate_full_name() -> str:
    return f"{generate_first_name()} {generate_last_name()}"