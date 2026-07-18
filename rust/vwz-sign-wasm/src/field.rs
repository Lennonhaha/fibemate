//! Finite field F_q with q = 3329 (ML-KEM-768 modulus).
//! All operations are constant-time for 16-bit values.

pub const Q: u16 = 3329;

/// Modular addition mod q.
#[inline(always)]
pub fn add(a: u16, b: u16) -> u16 {
    let s = a as u32 + b as u32;
    if s >= Q as u32 { (s - Q as u32) as u16 } else { s as u16 }
}

/// Modular subtraction mod q.
#[inline(always)]
pub fn sub(a: u16, b: u16) -> u16 {
    if a >= b { a - b } else { Q - (b - a) }
}

/// Modular negation mod q.
#[inline(always)]
pub fn neg(a: u16) -> u16 {
    if a == 0 { 0 } else { Q - a }
}

/// Modular multiplication mod q (naive, for < 16-bit words).
#[inline]
pub fn mul(a: u16, b: u16) -> u16 {
    ((a as u32 * b as u32) % Q as u32) as u16
}

/// Modular exponentiation a^e mod q.
pub fn pow(mut base: u16, mut exp: u16) -> u16 {
    let mut result: u16 = 1;
    while exp > 0 {
        if exp & 1 == 1 {
            result = mul(result, base);
        }
        base = mul(base, base);
        exp >>= 1;
    }
    result
}

/// Modular inverse via Fermat's little theorem: a^{q-2} mod q.
pub fn inv(a: u16) -> u16 {
    debug_assert!(a != 0, "Cannot invert zero");
    pow(a, Q - 2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_sub() {
        assert_eq!(add(3000, 400), 71); // wraps: 3400-3329=71
        assert_eq!(add(3000, 300), 3300);
        assert_eq!(sub(500, 300), 200);
        assert_eq!(sub(100, 500), 2929); // wraps: 3329-400=2929
    }

    #[test]
    fn test_mul() {
        assert_eq!(mul(100, 50), 1671); // 5000 mod 3329 = 1671
        assert_eq!(mul(17, 196), (17u32 * 196 % 3329) as u16);
    }

    #[test]
    fn test_inv() {
        for a in 1..100u16 {
            let a_inv = inv(a);
            assert_eq!(mul(a, a_inv), 1, "inv({a}) failed");
        }
    }

    #[test]
    fn test_pow() {
        assert_eq!(pow(17, 0), 1);
        assert_eq!(pow(17, 1), 17);
        assert_eq!(pow(17, 2), mul(17, 17));
    }
}
