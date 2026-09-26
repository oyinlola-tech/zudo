# @zudojs/crypto

Cryptographic primitives for hashing, authenticated encryption, password hashing, digital signatures, key derivation, opaque tokens, and secure random generation. Everything is backed by `node:crypto` through a swappable provider.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-crypto](https://zudojs.oyinlola.site/docs/packages-crypto) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-crypto.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/crypto
```

## Quick Start

```typescript
import {
  randomBytesSecure,
  hash,
  hashPassword,
  verifyPassword,
  encryptEnvelope,
  decryptEnvelope,
  generateToken,
} from "@zudojs/crypto";

// Hashing (SHA-2 / SHA-3 only; md5 and sha1 are rejected)
const digest = await hash("hello", { algorithm: "sha256", encoding: "hex" });
console.log(digest.encoded);

// Password hashing (scrypt, self-describing "v1$scrypt$..." string)
const stored = await hashPassword("correct horse battery staple");
const ok = await verifyPassword("correct horse battery staple", stored.encoded);

// Authenticated encryption (AES-256-GCM, 12-byte IV, 16-byte tag)
const key = await randomBytesSecure(32);
const envelope = await encryptEnvelope(new TextEncoder().encode("secret"), key);
const plaintext = await decryptEnvelope(envelope, key);

// Opaque tokens
const sessionToken = await generateToken({ bytes: 32, prefix: "sess_" });
```

## Features

- Hashing: SHA-256/384/512 and SHA3-256/384/512, HMAC (the key is a `Uint8Array` of at least 16 bytes — encode a string secret with `new TextEncoder().encode(secret)` first)
- Authenticated encryption: AES-256-GCM with strict IV (12 bytes) and tag (16 bytes) validation, plus a versioned string envelope. Omit `iv` to get a fresh random one per call; a caller-supplied `iv` is refused if this process already encrypted with it under the same key (`unsafeAllowIvReuse` opts out, for test vectors only)
- Password hashing: scrypt (default N=2^14, r=8, p=5 — the OWASP row for that N) and PBKDF2-HMAC (provider level), versioned self-describing encoding, bounded parameters on verification. New hashes must use a cost of at least `PASSWORD_HASH.SCRYPT.MIN_COST` (16 384); older stored hashes with a smaller cost still verify. Key derivation (`deriveScrypt`) keeps p=1 by default, so derived keys do not change. `hashPassword(password, { minLength: PASSWORD_POLICY.MIN_LENGTH })` opts into the 8-character minimum; the default stays permissive so existing credentials can be re-hashed
- Key derivation: PBKDF2 (sha256/384/512, 600 000 iterations by default) and scrypt (cost, block size, parallelization, memory bound); every work factor and the output length are capped by `PASSWORD_HASH.LIMITS`, so a value read from configuration cannot request unbounded CPU or memory
- Digital signatures: Ed25519, RSA-SHA256/384/512, ECDSA-SHA256/384/512; the algorithm label is bound to the key type
- Secure random: unbiased integers up to 2^48, UUID v4, bytes, alphabets, numeric codes. Units: `randomHex(n)` is `n` characters, `randomBase64Url(n)` is `n` bytes, `generateCryptoKey(n)` is `n` bytes and the resulting `CryptoKey` reports `length` in bits and `byteLength` in bytes
- Opaque tokens (API keys, sessions, refresh, CSRF, OTP) with SHA-256 storage hashes
- Encoding helpers (hex, base64, base64url, strict UTF-8) with canonical-form validation and constant-time comparison
- Provider injection: `setDefaultCryptoProvider`, `createCryptoService({ provider })`, `createCryptoFactory({ provider })`, or a `provider` option on any helper

Not implemented (and not advertised by the types): bcrypt, Argon2, ChaCha20-Poly1305, AES-CBC, X25519.

## Errors

Failures throw `CryptoError` from `@zudojs/errors` with a stable `code` (`ERR_CRYPTO_CIPHER`, `ERR_CRYPTO_HASH`, ...) and the underlying Node error as `cause`. Cryptographic parameter violations are `CryptoError`s too: a short HMAC key (`ERR_CRYPTO_HASH`), an out-of-range scrypt/PBKDF2 work factor (`ERR_CRYPTO_DERIVATION` for `derive*`, `ERR_CRYPTO_HASH` for `hashPassword`), a bad key length (`ERR_CRYPTO_KEY`), and a password outside the length bounds (`ERR_CRYPTO_HASH` with `statusCode: 400` and `expose: true`, since the end user can act on it). Plain argument-shape mistakes — a non-`Uint8Array` key, an unknown algorithm name, a non-integer random length — stay `TypeError`/`RangeError`. `verifyPassword` and `verifyTokenHash` return `false` (never throw) for wrong or malformed inputs.

## Use Cases

- Password storage and login verification
- API token generation and storage
- Data encryption at rest
- Secure random values and one-time codes
