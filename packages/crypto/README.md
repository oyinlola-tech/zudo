# @zudojs/crypto

Cryptographic primitives for hashing, authenticated encryption, password hashing, digital signatures, key derivation, opaque tokens, and secure random generation. Everything is backed by `node:crypto` through a swappable provider.

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

- Hashing: SHA-256/384/512 and SHA3-256/384/512, HMAC (keys of at least 16 bytes)
- Authenticated encryption: AES-256-GCM with strict IV (12 bytes) and tag (16 bytes) validation, plus a versioned string envelope
- Password hashing: scrypt (default, OWASP parameters) and PBKDF2-HMAC (provider level), versioned self-describing encoding, bounded parameters on verification
- Key derivation: PBKDF2 (sha256/384/512, 600 000 iterations by default) and scrypt (cost, block size, parallelization, memory bound)
- Digital signatures: Ed25519, RSA-SHA256/384/512, ECDSA-SHA256/384/512; the algorithm label is bound to the key type
- Secure random: unbiased integers up to 2^48, UUID v4, bytes, alphabets, numeric codes
- Opaque tokens (API keys, sessions, refresh, CSRF, OTP) with SHA-256 storage hashes
- Encoding helpers (hex, base64, base64url, strict UTF-8) with canonical-form validation and constant-time comparison
- Provider injection: `setDefaultCryptoProvider`, `createCryptoService({ provider })`, `createCryptoFactory({ provider })`, or a `provider` option on any helper

Not implemented (and not advertised by the types): bcrypt, Argon2, ChaCha20-Poly1305, AES-CBC, X25519.

## Errors

Failures throw `CryptoError` from `@zudojs/errors` with a stable `code` (`ERR_CRYPTO_CIPHER`, `ERR_CRYPTO_HASH`, ...) and the underlying Node error as `cause`. `verifyPassword` and `verifyTokenHash` return `false` (never throw) for wrong or malformed inputs.

## Use Cases

- Password storage and login verification
- API token generation and storage
- Data encryption at rest
- Secure random values and one-time codes
