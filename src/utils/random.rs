use rand::prelude::IndexedRandom;
use rand::Rng;

#[inline]
pub fn pick<R: Rng + ?Sized, T: Copy>(rng: &mut R, set: &[T]) -> T {
    set.choose(rng).copied().expect("character set must be non-empty")
}
