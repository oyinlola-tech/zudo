# @zudojs/crypto

## 1.2.0

### Minor Changes

- Round 10 security fixes:

  - CRYPTO-01: new scrypt password hashes default to N=2^14, r=8, p=5 (the OWASP row for N=2^14; p=1 is only adequate at N=2^17). `hashPassword` and the node provider's `hashPassword` refuse a cost below the new `PASSWORD_HASH.SCRYPT.MIN_COST` (16 384) and throw `RangeError`. Previously `cost: 2` was accepted. Stored hashes with a smaller cost still verify. The new constant `PASSWORD_HASH.SCRYPT.PASSWORD_PARALLELIZATION` (5) is the password default. `PASSWORD_HASH.SCRYPT.PARALLELIZATION` stays 1, so keys from `deriveScrypt` do not change. The comment that claimed p=1 was OWASP-compliant has been corrected.
  - New helper `assertNewHashCost`.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- - `derivePbkdf2`, `deriveScrypt`, `validatePbkdf2Options`, `validateScryptOptions` and the Node provider's `deriveKey` now enforce the upper bounds in `PASSWORD_HASH.LIMITS` (scrypt cost ≤ 2^20, block size ≤ 32, parallelization ≤ 16, `128 * cost * blockSize` ≤ 1 GiB, PBKDF2 iterations ≤ 10 000 000). Previously the scrypt memory "bound" was computed from the requested cost, so a cost read from configuration could allocate gigabytes or run for minutes.
  - New `PASSWORD_HASH.LIMITS.MAX_DERIVED_KEY_BYTES` (1024) caps `keyLength` for key derivation; password hashes keep their separate 64-byte bound.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/constants@1.0.1

> Note: this changelog was corrected. An earlier revision opened with a
> `1.0.0` entry (describing a package rename) that never shipped; the
> package is published at `0.1.0`. The `0.1.1`/`0.1.2` entries below
> predate the monorepo-wide realignment to `0.1.0` and are kept for history.

## Unreleased

### Security hardening (audit round 5)

Breaking: unimplemented members were removed from `CryptoAlgorithm`
(`AES_256_CBC`, `CHACHA20_POLY1305`, `ARGON2ID`, `X25519`); `EncryptionAlgorithm`
and `KeyDerivationAlgorithm` no longer list them either.

- AES-256-GCM: enforce 16-byte authentication tags and 12-byte IVs at the provider, `decrypt` and `decryptEnvelope`; reject foreign algorithm labels; all cipher failures are `CryptoError` (`ERR_CRYPTO_CIPHER`) with the Node error as `cause`.
- Random: `randomInt` now delegates to `node:crypto.randomInt` (unbiased up to 2^48, single-value ranges return `min`); string helpers validate lengths and count code points.
- Key derivation: PBKDF2 honours `digest` (`pbkdf2-sha384` label added) and defaults to 600 000 iterations; scrypt forwards `blockSize`/`maxMemory` with a derived memory bound so work factors above 2^14 work; `DerivedKeyResult.algorithm` matches runtime values.
- Passwords: `hashPassword` honours `saltBytes`/`keyBytes` and returns the salt/hash that are inside `encoded`; `verifyPassword` decodes and bounds-checks stored parameters (including a combined `128 * N * r` memory bound) before deriving and never throws; passwords are capped at `PASSWORD_POLICY.MAX_LENGTH`; PBKDF2 password hashes (`v1$pbkdf2-<digest>$<iterations>$salt.hash`) are supported at the provider level.
- Signatures: ECDSA algorithms work; the algorithm binds the key type; `verify` returns false for malformed keys/signatures; keys may be PEM text, PEM bytes or DER.
- Hash/HMAC: runtime allowlist (md5/sha1 rejected), HMAC keys must be at least 16 bytes.
- Keys: `createCryptoKey` validates length per algorithm, fingerprints are domain-separated HMACs, random key generation is restricted to symmetric algorithms.
- Encoding: single Buffer-based implementation with canonical-form validation (non-canonical base64/base64url rejected), strict UTF-8 decoding, token encodings allowlisted, `timingSafeEqualEncoded` returns false on malformed input; constant-time compares use `node:crypto.timingSafeEqual`.
- Service/factory: every wrapper preserves `cause`; factory merges password defaults and copies option objects; provider injection via `setDefaultCryptoProvider`, `createCryptoService({ provider })`, `createCryptoFactory({ provider })` and per-call `provider` options.
- `CRYPTO_ALGORITHM` mirrors `CryptoAlgorithm` exactly (compile-time checked).
- Packaging: source maps and build info no longer ship; LICENSE included; tests are typechecked.

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
