use rand::prelude::*;
use rand::seq::SliceRandom;
use crate::utils::random::pick;

const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
const DIGITS: &[u8] = b"0123456789";
const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{}<>?/";




pub fn generate_secure_password(length: usize) -> String {
    assert!(length >= 8, "Password should be at least 8 characters");

    let mut rng = rand::rng();
    let mut password = Vec::with_capacity(length);

    // Ensure at least one of each category
    password.push(pick(&mut rng, UPPERCASE));
    password.push(pick(&mut rng, LOWERCASE));
    password.push(pick(&mut rng, DIGITS));
    password.push(pick(&mut rng, SYMBOLS));

    // Fill the rest from all categories
    let all_chars: Vec<u8> = [UPPERCASE, LOWERCASE, DIGITS, SYMBOLS].concat();
    for _ in 4..length {
        password.push(*all_chars.choose(&mut rng).unwrap());
    }

    // Shuffle to avoid predictable category order
    password.shuffle(&mut rng);

    String::from_utf8(password).unwrap()
}