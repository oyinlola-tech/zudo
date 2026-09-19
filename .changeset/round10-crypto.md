---
"@zudojs/crypto": minor
---

Round 10 security fixes:

- CRYPTO-01: new scrypt password hashes default to N=2^14, r=8, p=5 (the OWASP row for N=2^14; p=1 is only adequate at N=2^17). `hashPassword` and the node provider's `hashPassword` refuse a cost below the new `PASSWORD_HASH.SCRYPT.MIN_COST` (16 384) and throw `RangeError`. Previously `cost: 2` was accepted. Stored hashes with a smaller cost still verify. The new constant `PASSWORD_HASH.SCRYPT.PASSWORD_PARALLELIZATION` (5) is the password default. `PASSWORD_HASH.SCRYPT.PARALLELIZATION` stays 1, so keys from `deriveScrypt` do not change. The comment that claimed p=1 was OWASP-compliant has been corrected.
- New helper `assertNewHashCost`.
