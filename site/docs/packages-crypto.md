---
title: "@zudojs/crypto — Cryptographic Primitives Documentation"
description: "@zudojs/crypto docs: hashing, encryption, password hashing, tokens, signatures, key derivation and secure random generation for ZudoJS apps."
source: https://zudojs.oyinlola.site/docs/packages-crypto
---

v1.3.0

# @zudojs/crypto

Safe defaults for hashing, AES-256-GCM encryption, scrypt password storage, Ed25519 signatures, opaque tokens and secure random values, all backed by `node:crypto`.

CRYPTOGRAPHY ENCRYPTION HASHING PASSWORDS TOKENS SIGNATURES

## OVERVIEW

Node.js already ships a crypto module, but it lets you pick weak algorithms, short keys and bad parameters without complaint. `@zudojs/crypto` wraps it with one good choice per job and rejects the rest at runtime. You call `hashPassword` and get scrypt with OWASP parameters; you call `encrypt` and get AES-256-GCM with a fresh random IV.

Three words come up constantly on this page. *Hashing* turns data into a fixed-size fingerprint that cannot be turned back into the data. *Encryption* scrambles data with a key so that only someone holding the same key can read it again. *Signing* proves that a message came from the holder of a private key and was not changed on the way.

Every function is `async` and talks to `node:crypto` through a *provider*. A provider is just an object that implements the raw operations; the default one is created for you, and you can swap it in tests.

When you need it

- Storing user passwords and checking them at login
- Issuing API keys, session or reset tokens and storing only their hash
- Encrypting a secret before it goes into a database
- Signing a payload so another service can verify it
- Random codes, IDs or bytes that must be unpredictable

When you don't

- You need JWTs or a login flow: use [@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md), which builds on this package
- You need bcrypt, Argon2, ChaCha20 or AES-CBC: they are deliberately not implemented
- You need `Math.random()`-style values for a game or a shuffle: plain JavaScript is fine

## INSTALLATION

Install the package. Its two dependencies, `@zudojs/constants` and `@zudojs/errors`, come along automatically. Node.js 24 or newer is required.

```bash
$ npm install @zudojs/crypto
```

> **Note:** These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

This is the package's own smoke test: hash a string, store and check a password, encrypt and decrypt a secret, then mint a session token. Save it as `quick.ts` and run it.

```ts
import {
  hash,
  hashPassword, verifyPassword,
  randomBytesSecure, encryptEnvelope, decryptEnvelope,
  generateToken,
} from "@zudojs/crypto";

// 1. Hash: same input always gives the same fingerprint.
const digest = await hash("hello", { algorithm: "sha256", encoding: "hex" });
console.log(digest.encoded);
// 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824

// 2. Password: store `encoded`, never the password itself.
const stored = await hashPassword("correct horse battery staple");
const ok = await verifyPassword("correct horse battery staple", stored.encoded);
console.log(ok);                          // true

// 3. Encrypt: a 32-byte key, a portable string in, the bytes back out.
const key = await randomBytesSecure(32);
const envelope = await encryptEnvelope(new TextEncoder().encode("secret"), key);
const plaintext = await decryptEnvelope(envelope, key);
console.log(new TextDecoder().decode(plaintext)); // secret

// 4. Token: 32 random bytes, base64url, with a prefix.
const sessionToken = await generateToken({ bytes: 32, prefix: "sess_" });
console.log(sessionToken);                // sess_ followed by 43 random characters
```

The hex digest is always the same for `"hello"`. Everything else (the password hash, the envelope, the token) is different on every run because each one starts from fresh random bytes.

> **Danger:** Three things this package will not let you do, on purpose.
>
> - **Do not invent your own scheme.** Only SHA-2, SHA-3, HMAC, AES-256-GCM, scrypt, PBKDF2 and Ed25519/RSA/ECDSA signatures exist here. Ask `hash` for `"md5"` or `"sha1"` and it throws `TypeError: Unsupported hash algorithm`.
> - **Do not reuse an IV.** An *IV* (also called a nonce) is the random 12-byte value that makes each encryption unique. Leave it out and `encrypt` draws a fresh one every call. Reusing one under the same key leaks your plaintexts; a wrong-sized one is rejected with `ERR_CRYPTO_CIPHER`.
> - **Do not store plain passwords.** Store the `encoded` string that `hashPassword` returns and check with `verifyPassword`. A plain `sha256` of a password is *not* a password hash: it is fast enough to brute-force.

## HASHING AND HMAC

A *hash* is a fixed-size fingerprint of some data. The same input always produces the same output, and you cannot recover the input from it. Use it to fingerprint files, deduplicate content, or store a lookup key for a token.

Call `hash` for the full result, or a shorthand such as `sha256` when you only want the encoded string. Both accept a string, a `Uint8Array` or an `ArrayBuffer`.

```ts
import { hash, sha256, sha512 } from "@zudojs/crypto";

const result = await hash("hello world", { algorithm: "sha256", encoding: "hex" });
console.log(result.algorithm);      // sha256
console.log(result.digest.length);  // 32  (raw bytes)
console.log(result.encoded);
// b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9

const short = await sha256("hello world");           // same hex string as above
const b64   = await sha512("hello world", "base64"); // 88-character base64 string
```

Supported algorithms are `sha256`, `sha384`, `sha512`, `sha3-256`, `sha3-384` and `sha3-512`. Encodings are `hex` (default), `base64` and `base64url`.

### HMAC: a hash with a secret

An *HMAC* is a hash mixed with a secret key. Anyone can compute a plain hash, but only someone holding the key can compute the matching HMAC, so it proves a message was not tampered with. The key must be at least 16 bytes.

```ts
import { hmacSha256, randomBytesSecure, timingSafeEqualString } from "@zudojs/crypto";

const key = await randomBytesSecure(32);   // keep this secret; 16 bytes minimum
const tag = await hmacSha256("order:42:paid", key);
console.log(tag.length);                   // 64 (hex)

// Later, on the receiving side, recompute and compare in constant time.
const again = await hmacSha256("order:42:paid", key);
console.log(timingSafeEqualString(tag, again)); // true
```

> **Watch out:** Compare hashes and tags with `timingSafeEqualString` (strings) or `timingSafeEqual` (bytes), never with `===`. A normal comparison stops at the first different character, and that timing difference can be measured by an attacker.

## ENCRYPTION

*Encryption* scrambles data with a key so it can be unscrambled later by anyone holding the same key. This package uses AES-256-GCM, which also detects tampering: if one byte of the ciphertext is changed, decryption fails instead of returning garbage.

The key must be exactly 32 bytes. Generate one with `randomBytesSecure(32)` and keep it outside your code, for example in an environment variable encoded as hex.

### Envelopes: the easy path

An *envelope* is one string that bundles the IV, the authentication tag and the ciphertext, so you can store it in a single database column. This example encrypts a string and gets it back.

```ts
import { encryptEnvelope, decryptEnvelope, randomBytesSecure } from "@zudojs/crypto";

const key = await randomBytesSecure(32);
const bytes = new TextEncoder().encode("secret");

const envelope = await encryptEnvelope(bytes, key);
console.log(envelope);
// v1.aes-256-gcm.nd6CpdgPlb62b7gQ.YvsWCo8Wh5N5O63sAO00dg.KfQcUkfn

const plaintext = await decryptEnvelope(envelope, key);
console.log(new TextDecoder().decode(plaintext)); // secret
```

The envelope format is `v1.aes-256-gcm.iv.authTag.ciphertext`, each binary part in base64url. Your envelope will differ from the one shown because the IV is random every time.

### Pieces: when you store fields separately

`encryptString` returns the three parts as bytes so you can store them in separate columns. `decryptString` takes them back in the same order.

```ts
import { encryptString, decryptString, randomBytesSecure } from "@zudojs/crypto";

const key = await randomBytesSecure(32);
const result = await encryptString("hello world", key);
console.log(result.algorithm, result.iv.length, result.authTag.length);
// aes-256-gcm 12 16

const plain = await decryptString(result.ciphertext, key, result.iv, result.authTag);
console.log(plain); // hello world
```

Use `encrypt` and `decrypt` for raw `Uint8Array` data; they have the same shape. The optional `aad` option binds extra unencrypted context (such as a user ID) to the ciphertext, so it will not decrypt under a different context.

> **Common mistake:** decrypting with the wrong key, a wrong IV or a tampered envelope all throw a `CryptoError` with code `ERR_CRYPTO_CIPHER` and message `Decryption failed`. Catch it and treat it as "this data is not for this key", not as a bug.

## PASSWORD HASHING

A *password hash* is a deliberately slow hash with a random *salt* mixed in. Slow means an attacker who steals your database can only try a few guesses per second. The salt means two users with the same password get different hashes.

This package uses scrypt with OWASP defaults (cost 16384, block size 8, parallelization 5, 16-byte salt, 32-byte output; new hashes must use cost ≥ 16384 (`PASSWORD_HASH.SCRYPT.MIN_COST`, checked by `assertNewHashCost`), older stored hashes still verify). The result is one self-describing string that starts with `v1$scrypt$`, so you can raise the cost later and old hashes still verify.

```ts
import { hashPassword, verifyPassword } from "@zudojs/crypto";

// At sign-up: hash and store `encoded`.
const result = await hashPassword("correct horse battery staple");
console.log(result.encoded);
// v1$scrypt$16384$8$5$4P7WMta8PUwwfejUzMN_6w.SL0oONhRA2hbSwz4nKfcb1i4MbDy6mYyKy4KaDAbni0
console.log(result.cost, result.blockSize, result.parallelization);
// 16384 8 5

// At login: verify against the stored string.
console.log(await verifyPassword("correct horse battery staple", result.encoded)); // true
console.log(await verifyPassword("wrong password", result.encoded));               // false
console.log(await verifyPassword("anything", "not-a-hash"));                      // false
```

`verifyPassword` never throws over its inputs. A wrong password, a malformed stored string, or a hash with out-of-range parameters all return `false`. The one exception is configuration: since 1.3.0 it throws a `CryptoError` if the provider does not declare the `passwordHashing` capability, rather than reporting a provider that cannot hash as a wrong password. Passwords longer than 1024 characters are also rejected so an attacker cannot make your server grind on huge input.

To make hashing slower, pass options. `cost` must be a power of two.

```ts
const stronger = await hashPassword("correct horse battery staple", { cost: 32768 });
console.log(stronger.encoded.startsWith("v1$scrypt$32768$")); // true
```

> **Watch out:** `isValidPassword(password)` only checks length (8 characters by default). It is a convenience for form validation, not a strength meter.

## DIGITAL SIGNATURES

A *signature* proves that a message came from whoever holds a *private key* and was not altered. Anyone with the matching *public key* can check it, but nobody can forge it. Use it for webhooks, signed URLs, or any payload that crosses a trust boundary.

The default algorithm is Ed25519. Generate a key pair once, export both halves as PEM text, and keep the private one secret. PEM is the familiar `-----BEGIN PRIVATE KEY-----` text format.

```ts
import {
  generateEd25519KeyPair, exportPrivateKeyPem, exportPublicKeyPem,
  signString, verifyString,
} from "@zudojs/crypto";

// One-time setup. Store privatePem somewhere secret; publish publicPem.
const { privateKey, publicKey } = generateEd25519KeyPair();
const privatePem = exportPrivateKeyPem(privateKey);
const publicPem  = exportPublicKeyPem(publicKey);
console.log(publicPem);
// -----BEGIN PUBLIC KEY-----
// MCowBQYDK2VwAyEAXEBPyK/UOMLZ9MJfwuCVQ5ZRtx5UMJUqG728xdCKXS8=
// -----END PUBLIC KEY-----

// Sender: sign the message.
const signature = await signString("hello", privatePem);
console.log(signature.length);                                   // 64

// Receiver: verify with the public key.
console.log(await verifyString("hello", signature, publicPem));   // true
console.log(await verifyString("hell0", signature, publicPem));   // false
```

`sign` and `verify` do the same for `Uint8Array` data. Keys may be PEM text, DER bytes, or a Node `KeyObject`. RSA (`rsa-sha256/384/512`) and ECDSA (`ecdsa-sha256/384/512`) are available through the `algorithm` option when you already hold such keys; random bytes are never a valid signing key.

> **Watch out:** the algorithm must match the key type. Passing an Ed25519 key with `algorithm: "rsa-sha256"` throws. A malformed key or signature makes `verify` return `false` rather than throw.

## OPAQUE TOKENS

An *opaque token* is a long random string that means nothing by itself; your database maps it to a user or session. API keys, session cookies, password-reset links and CSRF tokens are all opaque tokens. The minimum is 16 random bytes (128 bits); the default is 32.

The typed generators add a recognisable prefix so tokens are easy to spot in logs and secret scanners. Store only the SHA-256 hash of a token; if the database leaks, the attacker still cannot use it.

```ts
import {
  generateApiKey, generateSessionToken, generateOtp,
  hashToken, verifyTokenHash,
} from "@zudojs/crypto";

const apiKey = await generateApiKey();
console.log(apiKey);
// lat_n8bvekncI8qxzm4iOavHpMzdp5QC2OKJ9uzNcKu5048

// Give the raw key to the user once; store only its hash.
const storedHash = await hashToken(apiKey);
console.log(storedHash.length);                           // 64 (hex SHA-256)

// On each request, look up by hash and compare in constant time.
console.log(await verifyTokenHash(apiKey, storedHash));      // true
console.log(await verifyTokenHash("lat_wrong", storedHash)); // false

console.log(await generateSessionToken());   // sess_ followed by 43 random characters
console.log(await generateOtp());            // 114575  (6 digits, leading zeros kept)
```

Other generators follow the same pattern: `generateRefreshToken` (`ref_`), `generateVerificationToken` (`verify_`), `generatePasswordResetToken` (`reset_`) and `generateCsrfToken` (`csrf_`). `generateToken({ bytes, encoding, prefix })` is the general form.

> **Tip:** `TOKEN_TTL` exports sensible lifetimes in milliseconds (for example `TOKEN_TTL.PASSWORD_RESET_MS` is 15 minutes). The package does not track expiry for you; store an `expiresAt` column next to the hash.

## SECURE RANDOM

`Math.random()` is predictable and must never be used for anything secret. These helpers draw from the operating system's cryptographic random source and are safe for keys, salts, codes and IDs.

```ts
import {
  randomBytesSecure, randomHex, randomInteger, randomUuid,
  randomNumericCode, randomAlphanumeric, randomChoice,
} from "@zudojs/crypto";

const bytes = await randomBytesSecure(32);
console.log(bytes.length);                        // 32
console.log(await randomHex(16));               // 16 hex characters
console.log(await randomInteger(1, 7));         // 1, 2, 3, 4, 5 or 6 (max is excluded)
console.log(await randomUuid());                 // a UUID v4 such as 550e8400-e29b-41d4-a716-446655440000
console.log(await randomNumericCode(6));         // 6 digits, leading zeros kept
console.log(await randomAlphanumeric(8));        // 8 letters or digits
console.log(await randomChoice(["red", "green", "blue"])); // one of the three
```

`randomInteger(min, max)` is uniform (no bias toward low numbers) for ranges up to 248. Character helpers draw each character independently, so leading zeros in numeric codes are kept.

## KEY DERIVATION

*Key derivation* stretches a human-typed passphrase into a fixed-length key you can use for encryption. It is the same slow-hash idea as password hashing, but the output is the key bytes rather than a stored string. If you only need to check a password, use `hashPassword` instead.

This derives a 32-byte AES key from a passphrase with PBKDF2-SHA256 (600 000 iterations by default). Keep the returned `salt`: you need the same salt to derive the same key again.

```ts
import { derivePbkdf2, encryptEnvelope, timingSafeEqual } from "@zudojs/crypto";

const first = await derivePbkdf2("my passphrase", { keyLength: 32 });
console.log(first.algorithm, first.key.length, first.salt.length);
// pbkdf2-sha256 32 16

const envelope = await encryptEnvelope(new TextEncoder().encode("secret"), first.key);

// Later: same passphrase + same salt = same key.
const again = await derivePbkdf2("my passphrase", { keyLength: 32, salt: first.salt });
console.log(timingSafeEqual(first.key, again.key)); // true
```

`deriveScrypt(password, options)` does the same with scrypt, and `deriveKey(password, CryptoAlgorithm.SCRYPT, options)` picks by enum. Salts must be at least 16 bytes; `generateSalt()` makes one. Cost, block size, parallelization, iterations and `keyLength` are capped by `PASSWORD_HASH.LIMITS`; out-of-range values throw before any derivation runs.

## SERVICE AND PROVIDER

The loose functions above are all you need most of the time. Two wrappers exist for apps that prefer one object to pass around.

`CryptoService` bundles the common operations as methods and turns every failure into a `CryptoError`. `CryptoFactory` adds app-wide defaults (password cost, token encoding) on top of a service.

```ts
import { createCryptoService, createCryptoFactory, CryptoAlgorithm } from "@zudojs/crypto";

const service = createCryptoService();
const key = await service.generateKey(CryptoAlgorithm.AES_256_GCM);
console.log(key.keyId, key.length);      // key_ plus 32 hex characters, then 256
console.log(await service.hashHex("hello world"));
// b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9

const factory = createCryptoFactory({ password: { cost: 32768 }, encoding: "hex" });
const stored = await factory.createPasswordHash("correct horse battery staple");
console.log(stored.cost);                // 32768
console.log(await factory.createToken(16, "tmp_")); // tmp_ + 32 hex characters
```

### Swapping the provider in tests

A *provider* is the object that actually does the work; the default is `createNodeCryptoProvider()`. Every function accepts a `provider` option, or you can replace the process-wide default. This subclasses the real provider to count hash calls, then restores the default.

```ts
import {
  NodeCryptoProvider, setDefaultCryptoProvider, resetDefaultCryptoProvider, sha256,
} from "@zudojs/crypto";
import type { HashAlgorithm, CryptoInput } from "@zudojs/crypto";

let hashCalls = 0;

class CountingProvider extends NodeCryptoProvider {
  override async hash(algorithm: HashAlgorithm, data: CryptoInput): Promise<Uint8Array> {
    hashCalls += 1;
    return super.hash(algorithm, data);
  }
}

setDefaultCryptoProvider(new CountingProvider());

await sha256("a");
await sha256("b");
console.log(hashCalls);   // 2

resetDefaultCryptoProvider();
```

### Capabilities, and what a provider must implement

Every provider declares a `capabilities` object with seven boolean flags: `hash`, `hmac`, `encryption`, `signing`, `random`, `keyDerivation` and `passwordHashing`. Before 1.3.0 nothing read them — a provider declaring `signing: false` still had its `sign` called. Each flag is now checked at the operation that needs it, and an operation the configured provider does not declare is refused with a `CryptoError` naming both the capability and the operation. A `capabilities` object that is missing or malformed fails the same way a `false` flag does. A provider that declares every capability it implements is unaffected.

`verifyPassword` is part of this: it throws rather than reporting an undeclared `passwordHashing` capability as a wrong password, which would otherwise read as a failed login forever.

`setDefaultCryptoProvider` now validates the provider before installing it. All twelve methods listed in `CRYPTO_PROVIDER_METHODS` — `randomBytes`, `randomInt`, `randomUUID`, `hash`, `hmac`, `encrypt`, `decrypt`, `sign`, `verify`, `deriveKey`, `hashPassword`, `verifyPassword` — must be functions, and each of the seven capability flags must be a boolean. Anything else throws a `CryptoError` from that call and the provider is *not* installed; a non-object argument throws a `TypeError`. Previously a partial object such as `{}` installed cleanly and failed much later, as a bare `TypeError` from inside whichever operation reached the missing method first.

```ts
import { setDefaultCryptoProvider, isCryptoError } from "@zudojs/crypto";
import type { CryptoProvider } from "@zudojs/crypto";

try {
  setDefaultCryptoProvider({} as CryptoProvider);
} catch (error) {
  if (isCryptoError(error)) {
    console.log(error.message);
    // Crypto provider is missing the "randomBytes" method: a provider
    // must implement all 12 operations.
  }
}
```

The checks are exported for anyone writing their own provider or wrapper: `assertCryptoProvider`, `assertProviderCapability`, and the fixed-operation shorthands `assertRandomCapability`, `assertHashCapability`, `assertHmacCapability` and `assertPasswordHashingCapability`.

## ERRORS

Cryptographic failures throw `CryptoError` from `@zudojs/errors`, re-exported here. It carries a stable `code` such as `ERR_CRYPTO_CIPHER`, an `operation`, and the original Node error as `cause`. Bad arguments (wrong algorithm name, short HMAC key) throw plain `TypeError` or `RangeError` instead.

```ts
import { decryptEnvelope, isCryptoError } from "@zudojs/crypto";

const wrongKey = new Uint8Array(32);
const envelope = "v1.aes-256-gcm.nd6CpdgPlb62b7gQ.YvsWCo8Wh5N5O63sAO00dg.KfQcUkfn";

try {
  await decryptEnvelope(envelope, wrongKey);
} catch (error) {
  if (isCryptoError(error)) {
    console.log(error.code, error.operation); // ERR_CRYPTO_CIPHER decrypt
  }
}
```

The verify-style helpers are the exception: `verifyPassword`, `verifyTokenHash` and `verify` return `false` for bad input instead of throwing, so login code stays simple. That covers the input only — since 1.3.0 a provider that does not declare the capability an operation needs makes that operation throw a `CryptoError`, `verifyPassword` included, so a misconfigured provider is not mistaken for a wrong password.

## API REFERENCE

Everything below is exported from `@zudojs/crypto`. All functions that touch `node:crypto` return a `Promise`.

### Hashing

| Name | What it does | Notes |
| --- | --- | --- |
| hash(input, { algorithm?, encoding?, provider? }) | Hashes data; returns { algorithm, digest, encoded } | Default sha256 / hex. md5 and sha1 throw. |
| sha256 / sha384 / sha512 / sha3_256 / sha3_384 / sha3_512(input, encoding?) | Returns the encoded digest string | Encoding defaults to hex. |
| hmac(input, key, algorithm?, encoding?) | Keyed hash | Key is a Uint8Array of 16+ bytes. |
| hmacSha256 / hmacSha384 / hmacSha512(input, key, encoding?) | HMAC shorthands | Same key rule. |
| timingSafeEqual(a, b), timingSafeEqualString(a, b) | Constant-time comparison of bytes or strings | Use instead of ===. |

### Encryption

| Name | What it does | Notes |
| --- | --- | --- |
| encrypt(plaintext, key, { iv?, aad?, provider? }) | AES-256-GCM; returns { algorithm, ciphertext, iv, authTag } | Key 32 bytes. IV 12 bytes, random if omitted. |
| decrypt(ciphertext, key, iv, authTag, aad?) | Reverses encrypt | Throws ERR_CRYPTO_CIPHER on tampering. |
| encryptString / decryptString | Same, for UTF-8 strings |  |
| encryptEnvelope(plaintext, key, options?) | Returns one v1.aes-256-gcm.iv.tag.ct string | Best choice for storage. |
| decryptEnvelope(envelope, key, aad?) | Returns plaintext bytes | Validates every field first. |

### Passwords and key derivation

| Name | What it does | Notes |
| --- | --- | --- |
| hashPassword(password, options?) | scrypt hash; returns { encoded, salt, hash, cost, blockSize, parallelization } | Options: saltBytes, keyBytes, cost, blockSize, parallelization. |
| verifyPassword(password, encoded) | Checks a password | Never throws; returns false. |
| isPasswordHash(value), isValidPassword(value, min?) | Shape checks | isValidPassword is length only. |
| derivePbkdf2(password, options?), deriveScrypt(password, options?) | Turn a passphrase into key bytes; returns { key, salt, algorithm } | Pass salt to reproduce a key. |
| deriveKey(password, CryptoAlgorithm, options?) | Picks PBKDF2 or scrypt by enum |  |
| generateSalt(length?) | Random salt bytes | Minimum 16. |

### Signatures and keys

| Name | What it does | Notes |
| --- | --- | --- |
| sign(data, privateKey, { algorithm? }) | Returns a signature Uint8Array | Default ed25519; also rsa-* and ecdsa-*. |
| verify(data, signature, publicKey, { algorithm? }) | Returns boolean | Malformed input gives false. |
| signString / verifyString | Same for UTF-8 strings |  |
| generateEd25519KeyPair() | Returns { privateKey, publicKey } KeyObjects | Synchronous. |
| exportPrivateKeyPem(key), exportPublicKeyPem(key), derivePublicKey(privateKey) | PEM export and public-key recovery |  |
| generateCryptoKey(length, { algorithm, usages?, extractable? }) | Random symmetric key as a CryptoKey object | Symmetric algorithms only. |
| createCryptoKey(bytes, options), exportCryptoKey(key) | Wrap existing bytes; read them back | Export requires extractable: true. |

### Tokens and random

| Name | What it does | Notes |
| --- | --- | --- |
| generateToken({ bytes?, encoding?, prefix? }) | Random opaque token string | Default 32 bytes base64url; minimum 16. |
| generateApiKey / generateSessionToken / generateRefreshToken / generateVerificationToken / generatePasswordResetToken / generateCsrfToken() | Prefixed tokens | Prefixes in TOKEN_PREFIX. |
| generateOtp(digits?) | Numeric one-time code | 4 to 12 digits, default 6. |
| hashToken(token), verifyTokenHash(token, storedHash) | SHA-256 hex for storage and constant-time check | hashTokenForStorage is an alias. |
| hasTokenPrefix / removeTokenPrefix(token, prefix), isValidToken(token, min?) | String helpers |  |
| randomBytesSecure(n), randomHex(chars), randomBase64Url(bytes) | Random bytes and strings |  |
| randomInteger(min, max), randomIntegerBelow(max), randomUuid() | Uniform integers and UUID v4 | max is excluded. |
| randomNumericCode(len?), randomAlphanumeric(len), randomFromAlphabet(len, alphabet), randomChoice(array), randomBoolean() | Random characters and picks |  |

### Encoding, service, provider, errors, constants

| Name | What it does | Notes |
| --- | --- | --- |
| encode(bytes, encoding), decode(string, encoding) | Convert between bytes and hex / base64 / base64url / utf8 | Also toHex, fromHex, toBase64Url, fromBase64Url, utf8Encode, utf8Decode. |
| createCryptoService({ provider? }), cryptoService | Method-style facade; wraps failures in CryptoError | Methods: generateKey, randomBytes, encrypt, decrypt, hash, hashHex, hashPassword, verifyPassword, deriveKey, generateToken, generateOtp, hashToken, verifyToken, encode, decode. |
| createCryptoFactory({ defaultKeyAlgorithm?, password?, encoding?, provider? }), cryptoFactory | Service with app-wide defaults | Methods: createKey, createToken, createApiKey, createSessionToken, createRefreshToken, createVerificationToken, createPasswordResetToken, createCsrfToken, createOtp, createPasswordHash, verifyPassword, encode, decode. |
| createNodeCryptoProvider(), getDefaultCryptoProvider(), setDefaultCryptoProvider(p), resetDefaultCryptoProvider() | Create or swap the backing provider | Implement CryptoProvider for a custom one. setDefaultCryptoProvider rejects one missing any of the twelve methods or the seven capability flags. |
| CryptoError, isCryptoError(value), CryptoOperation | Error class, guard and operation enum | Re-exported from @zudojs/errors. |
| CryptoAlgorithm, CryptoKeyUsage | Enums for algorithm and key-usage names | Use these, not string literals, where an enum is expected. |
| AES_GCM, PASSWORD_HASH, PASSWORD_POLICY, TOKEN, TOKEN_PREFIX, TOKEN_TTL | Frozen default parameters | e.g. PASSWORD_HASH.SCRYPT.COST is 16384. |

## COMMON MISTAKES

- **Hashing a password with `sha256`.** It runs millions of times per second, so a leaked table is cracked in minutes. Fix: `hashPassword` and `verifyPassword`.
- **Using `new Uint8Array(32)` as a real key.** That is 32 zero bytes; everyone has that key. Fix: `await randomBytesSecure(32)` once, then load it from configuration.
- **Passing a 4-byte HMAC key.** `hmac` throws `RangeError: HMAC key must be at least 16 bytes`. Fix: use 16 to 64 random bytes.
- **Storing the raw API key.** A database leak then hands out working credentials. Fix: store `hashToken(key)` and look up with `verifyTokenHash`.
- **Passing `"aes-256-gcm"` where an enum is expected.** `generateCryptoKey`, `deriveKey` and `createCryptoFactory` take `CryptoAlgorithm`; TypeScript rejects the string. Fix: `CryptoAlgorithm.AES_256_GCM`.
- **Feeding raw 32 bytes to `sign`.** Signing keys are PEM, DER or `KeyObject`, not random bytes. Fix: `generateEd25519KeyPair()` and `exportPrivateKeyPem`.

## RELATED PACKAGES

- [@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md) — sessions, JWTs and login flows built on these primitives; start here if you are building sign-in.
- [@zudojs/security](https://zudojs.oyinlola.site/docs/packages-security.md) — CSRF protection, rate limiting and security headers for HTTP apps.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the `CryptoError` class and error codes this package throws.
- [@zudojs/constants](https://zudojs.oyinlola.site/docs/packages-constants.md) — `TimeMs` and other shared values used by `TOKEN_TTL`.

## COMPLETE EXPORT INDEX

Every name `@zudojs/crypto` exports from its package root at v1.3.3 — **257** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 257 exports**

Classes (4)

`CryptoError` `CryptoFactory` `CryptoService` `NodeCryptoProvider`

Functions (165)

`arrayBufferToBytes` `assertBinaryEncoding` `assertCryptoProvider` `assertHashCapability` `assertHmacCapability` `assertKeyObject` `assertNewHashCost` `assertPassword` `assertPasswordHashingCapability` `assertProviderCapability` `assertRandomCapability` `bytesToArrayBuffer` `bytesToNumber` `cloneBytes` `concatBytes` `createCryptoError` `createCryptoFactory` `createCryptoKey` `createCryptoService` `createNodeCryptoProvider` `cryptoCipherError` `cryptoHashError` `cryptoKeyDerivationError` `cryptoKeyError` `cryptoKeysEqual` `cryptoKeyToPrivateKey` `cryptoSignatureError` `decode` `decodeBase64Url` `decodeDigest` `decodePasswordHash` `decrypt` `decryptEnvelope` `decryptString` `defaultKeyLength` `deriveKey` `derivePbkdf2` `derivePublicKey` `deriveScrypt` `encode` `encodeDigest` `encodePasswordHash` `encrypt` `encryptEnvelope` `encryptString` `equalDigests` `expectedAsymmetricKeyType` `expectedKeyLength` `exportCryptoKey` `exportPrivateKeyPem` `exportPublicKeyPem` `fillRandomBytes` `fromBase64` `fromBase64Url` `fromHex` `generateApiKey` `generateCryptoKey` `generateCsrfToken` `generateEd25519KeyPair` `generateEmailVerificationCode` `generateLoginCode` `generateOtp` `generatePasswordResetToken` `generateRefreshToken` `generateSalt` `generateSessionToken` `generateToken` `generateVerificationToken` `getCryptoFactory` `getCryptoKeyFingerprint` `getCryptoService` `getDefaultAesGcmConfig` `getDefaultCryptoProvider` `getDefaultPasswordHashConfig` `getDefaultPasswordHashOptions` `hash` `hashPassword` `hashToken` `hashTokenBase64Url` `hashTokenForStorage` `hasTokenPrefix` `hmac` `hmacSha256` `hmacSha384` `hmacSha512` `isAeadAlgorithm` `isArrayBuffer` `isBase64` `isBase64Url` `isBase64UrlString` `isBinaryEncoding` `isBytes` `isCryptoAlgorithm` `isCryptoEncoding` `isCryptoError` `isCryptoKey` `isHashAlgorithm` `isHashAlgorithmName` `isHex` `isHexString` `isHmacAlgorithmName` `isKeyDerivationAlgorithm` `isKeyObject` `isMacAlgorithm` `isPasswordHash` `isPbkdf2Digest` `isSignatureAlgorithm` `isSignatureAlgorithmName` `isSymmetricKeyAlgorithm` `isValidPassword` `isValidToken` `nodeSignatureAlgorithm` `normalizeText` `numberToBytes` `parseCryptoAlgorithm` `parsePositiveInteger` `pbkdf2PasswordAlgorithm` `randomAlphanumeric` `randomBase64` `randomBase64Url` `randomBoolean` `randomBytesSecure` `randomChoice` `randomFromAlphabet` `randomHex` `randomInteger` `randomIntegerBelow` `randomNumericCode` `randomToken` `randomUuid` `removeTokenPrefix` `resetDefaultCryptoProvider` `secureEqual` `secureStringEqual` `setDefaultCryptoProvider` `sha256` `sha3_256` `sha3_384` `sha3_512` `sha384` `sha512` `sign` `signString` `sliceBytes` `timingSafeEqual` `timingSafeEqualEncoded` `timingSafeEqualString` `toBase64` `toBase64Url` `toBytes` `toHex` `toPrivateKey` `toPublicKey` `utf8ByteLength` `utf8Decode` `utf8Encode` `validateParameters` `validatePbkdf2Options` `validatePbkdf2Parameters` `validateScryptOptions` `verify` `verifyPassword` `verifyString` `verifyTokenHash` `wipe`

Interfaces (35)

`CipherOptions` `CipherResult` `CryptoCapabilities` `CryptoErrorOptions` `CryptoFactoryOptions` `CryptoKey` `CryptoKeyOptions` `CryptoProvider` `CryptoServiceOptions` `DecryptOptions` `DerivedKeyResult` `DeriveKeyOptions` `EncryptedData` `EncryptionProvider` `EncryptOptions` `HashOptions` `HashPasswordOptions` `HashProvider` `HashResult` `HmacProvider` `KeyDerivationProvider` `PasswordHashOptions` `PasswordHashProviderOptions` `PasswordHashResult` `PasswordProvider` `Pbkdf2Options` `Pbkdf2PasswordHashParameters` `RandomProvider` `RandomTokenOptions` `ScryptOptions` `ScryptPasswordHashParameters` `SigningProvider` `SignOptions` `TokenOptions` `VerifyOptions`

Type aliases (22)

`BinaryEncoding` `BinaryInput` `CryptoAlgorithmName` `CryptoEncoding` `CryptoEncodingName` `CryptoInput` `DerivedKeyAlgorithm` `EncodingFormat` `EncryptionAlgorithm` `HashAlgorithm` `HashEncoding` `HashInput` `HmacAlgorithm` `KeyDerivationAlgorithm` `KeyMaterial` `PasswordHashParameters` `Pbkdf2Digest` `Pbkdf2PasswordAlgorithm` `SignatureAlgorithm` `SignatureOptions` `TokenEncoding` `TokenPrefix`

Constants (28)

`AEAD_ALGORITHMS` `AES_GCM` `base64ToBytes` `base64UrlToBytes` `bytesToBase64` `bytesToBase64Url` `bytesToHex` `CRYPTO_ALGORITHM` `CRYPTO_KEY_FINGERPRINT_LABEL` `CRYPTO_PROVIDER_METHODS` `CRYPTO_VERSION` `cryptoFactory` `cryptoService` `ENCODING` `HASH` `HASH_ALGORITHMS` `hexToBytes` `KEY_DERIVATION_ALGORITHMS` `KEY_SIZE` `MAC_ALGORITHMS` `PASSWORD_FORMAT_VERSION` `PASSWORD_HASH` `PASSWORD_POLICY` `RANDOM` `SIGNATURE_ALGORITHMS` `TOKEN` `TOKEN_PREFIX` `TOKEN_TTL`

Enums (3)

`CryptoAlgorithm` `CryptoKeyUsage` `CryptoOperation`
