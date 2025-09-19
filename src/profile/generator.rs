use rand::seq::SliceRandom;
use rand::{rng, Rng};
use std::collections::HashSet;
use crate::utils::random::pick;

pub fn generate_username() -> String {
    let adjectives = [
        "Ancient", "Bright", "Curious", "Dizzy", "Electric", "Fuzzy",
        "Gentle", "Hidden", "Jolly", "Kind", "Lucky", "Mighty", "Noisy",
        "Odd", "Proud", "Quick", "Rare", "Silly", "Tiny", "Vivid", "Witty"
    ];

    let nouns = [
        "Falcon", "Wanderer", "Otter", "Nebula", "Shadow", "Wizard",
        "Phoenix", "Koala", "Comet", "Knight", "Golem", "Tiger", "Cloud",
        "Blizzard", "Cricket", "Raven", "Puma", "Cobra", "Breeze", "Flame"
    ];

    let suffixes = ["x", "v2", "alpha", "42", "99", "zero", "nova", "2025"];

    let formats = [
        // Format patterns using closures
        |adj: &str, noun: &str, num: u16, suf: &str| format!("{}{}{}", adj, noun, num),
        |adj: &str, noun: &str, num: u16, _: &str| format!("{}_{}_{}", adj.to_lowercase(), noun
            .to_lowercase(), num),
        |adj: &str, noun: &str, _:u16, suf: &str| format!("{}{}{}", adj, noun, suf),
        |adj: &str, noun: &str, num: u16, _: &str| format!("{}{}{}", noun, num, adj),
        |adj: &str, noun: &str, num: u16, suf: &str| format!("{}{}{}{}", suf, adj, noun, num),
    ];

    let mut rng = rand::rng();
    loop {
        let adj = pick(&mut rng, &adjectives);
        let noun = pick(&mut rng, &nouns);
        let number: u16 = rng.random_range(10..9999);
        let suffix = pick(&mut rng, &suffixes);
        let format = pick(&mut rng, &formats);

        let username = format(adj, noun, number, suffix);
        return username
    }
}


fn generate_first_name() -> String {
    let first_names = [
        "Lena", "Kai", "Nova", "Arlo", "Sasha", "Ezra", "Rhea", "Juno", "Milo", "Niko",
        "Lyra", "Theo", "Astra", "Orin", "Zara", "Calix", "Nia", "Elio", "Tova", "Kian"
    ];

    let mut rng = rand::rng();
    pick(&mut rng, &first_names).to_string()
}

fn generate_last_name() -> String {
    let last_names = [
        "Moon", "Wraith", "Redwood", "Stone", "Nightwalker", "Flameborn", "Storm",
        "Dusk", "Ironwood", "Ashcroft", "Winter", "Blackthorn", "Starling",
        "Brightwind", "Frost", "Hollow", "Raven", "Skydancer", "Thorne", "Wolfhart"
    ];

    let mut rng = rand::rng();
    pick(&mut rng, &last_names).to_string()
}

fn generate_full_name() -> String {
    generate_first_name() + " " + &generate_last_name()
}