---
title: "Cryptography with @zudojs/crypto — ZudoJS Academy"
description: "Use @zudojs/crypto for random ids, tokens, hashes, HMAC, password hashing, AES-GCM encryption with key ids and constant-time checks, building reset tokens."
source: https://zudojs.oyinlola.site/learn/zudo-crypto
---

LEVEL 13 · LESSON 6 OF 12

Security and identity Core

# Cryptography with @zudojs/crypto

Use @zudojs/crypto for random ids, tokens, hashes, HMAC, password hashing, AES-GCM encryption with key ids and constant-time checks, building reset tokens.

- **55 min** to read and try
- **You need:** Cryptography with node:crypto, and the Data part of this course
- **You build:** A password-reset flow that stores only token hashes, signed expiring download links for attachments, a key-ring vault for bank details, and unguessable public ids

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Pick the @zudojs/crypto function for a job: random value, token, hash, HMAC, password hash, encryption or signature
- Issue and redeem password-reset tokens that are single-use, expire, and are stored only as hashes
- Sign and verify expiring values bound to a purpose, with key ids for rotation
- Encrypt data bound to its owner with AES-256-GCM, load keys safely and rotate them
- Compare secrets in constant time, and test cryptographic code with known answers and every rejection path

## Four shortcuts in one pull request

The Task API is about to get user accounts. A teammate opens a pull request with the first pieces: a "forgot password" link, links to download task attachments, and public ids for tasks. It works in every manual test. Here are the essential lines, and what an attacker does with each:

shortcuts.tsNode.js only

```ts
// 1. A reset token made from the user id and the time.
const issuedAt = Date.UTC(2026, 8, 24, 9, 15, 0, 412);
const resetToken = `u42-${issuedAt.toString(36)}`;

// The attacker asked for Ada's reset at 09:15:00 and tries every millisecond of that second.
const start = Date.UTC(2026, 8, 24, 9, 15, 0);
let tries = 0;
for (let ms = start; ms < start + 1000; ms++) {
  tries++;
  if (`u42-${ms.toString(36)}` === resetToken) break;
}
console.log(`reset token guessed in ${tries} tries`);

// 2. A download link that "signs" its data with base64.
const link = Buffer.from(JSON.stringify({ attachment: 7, user: "ada" })).toString("base64url");
const forged = Buffer.from(JSON.stringify({ attachment: 8, user: "ada" })).toString("base64url");
console.log("real link: /download?t=" + link);
console.log("forged:    /download?t=" + forged, "(accepted: nothing to check it against)");

// 3. Public ids that count.
const myInvoice = 1042;
console.log("my invoice:", myInvoice, "- so try", myInvoice - 1, "and", myInvoice + 1);

// 4. An API key compared with ===.
const apiKey = "7f3a9c2e";
const steps = (guess: string) => [...guess].findIndex((ch, i) => ch !== apiKey[i]) + 1 || guess.length;
console.log("steps for 0000…, 7f00…, 7f3a…:", steps("00000000"), steps("7f000000"), steps("7f3a0000"));
```

Output of `npx tsx shortcuts.ts`

```ts
reset token guessed in 413 tries
real link: /download?t=eyJhdHRhY2htZW50Ijo3LCJ1c2VyIjoiYWRhIn0
forged:    /download?t=eyJhdHRhY2htZW50Ijo4LCJ1c2VyIjoiYWRhIn0 (accepted: nothing to check it against)
my invoice: 1042 - so try 1041 and 1043
steps for 0000…, 7f00…, 7f3a…: 1 3 5
```

- The reset token has no secret in it: a user id and a time the attacker roughly knows. 413 guesses take over Ada's account.
- Base64 is an encoding, not a signature. Anyone can decode the link, change the attachment id, and encode it again.
- Sequential ids tell a customer how many invoices you issue a day, and invite them to try the neighbours. If an authorization check is ever missing, the neighbours are one request away.
- `===` stops at the first wrong character, so a longer comparison means a better guess. Over many requests an attacker can measure that (a **timing attack**, which you met in [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#timing)).

That lesson taught the building blocks in `node:crypto`. `@zudojs/crypto` packages them with safe defaults and refusals built in: tokens with the right length and a prefix, token hashing for storage, password hashing with a cost floor, AES-GCM with a self-describing envelope, keys with ids and fingerprints, and constant-time comparisons. In this lesson you replace all four shortcuts, and build the three things the Task API needs next: password-reset tokens, signed download links, and encrypted bank details for paying out freelancers.

Terminal on your computer

```bash
$ npm install @zudojs/crypto

added 1 package, and audited 22 packages in 2s

found 0 vulnerabilities
```

Every function here needs Node.js, so run the examples on your computer with `npx tsx file.ts`. Almost all of them return a `Promise`: the package calls a **crypto provider** (by default `NodeCryptoProvider`) behind one interface, which keeps the same API possible over the browser's asynchronous Web Crypto.

## Before you design a reset flow

REASON IT OUT

### What must a password-reset token survive?

A user who forgot their password asks for a reset link by e-mail. Think about these before reading the code:

- What must be true of the token so nobody can guess it? How long should it be?
- Your database leaks next year. Can the attacker use the reset tokens in it?
- The e-mail sits in an inbox for a week, or is forwarded. When should the link stop working?
- The link is clicked twice, or an attacker replays it after the user used it. What happens?
- Someone requests a reset for `ceo@yourcompany.com`. What does your API answer if that address has no account?

**Show the reasoning**

The token must be **random**, from a cryptographically secure generator, with enough bits that guessing is hopeless: 32 random bytes (256 bits). Nothing about the user or the time may go into it.

Store only a **hash** of the token. The link holds the token; the database holds `sha256(token)`. A leaked table then contains nothing usable. A fast hash is fine here because the token has 256 random bits: unlike a password, there is nothing to guess.

It must **expire**, 15 minutes is common, and be **single-use**: delete it when it is redeemed, even if the redeem fails later. Issuing a new one should cancel older ones for the same user.

The answer must be **the same whether or not the account exists** ("if that address has an account, we sent a link"), or the reset form tells attackers which e-mails are registered. Rate-limit the endpoint too.

## The map of @zudojs/crypto

Each job has one right tool. This table is the one to keep open while you work:

| You need to… | Use |
| --- | --- |
| make random bytes, numbers, codes or UUIDs | `randomBytesSecure`, `randomInteger`, `randomNumericCode`, `randomFromAlphabet`, `randomUuid` |
| make a token for a link, session or API key | `generateToken`, `generatePasswordResetToken`, `generateApiKey`, `generateOtp` |
| store a token so a leak is harmless | `hashToken`, `verifyTokenHash` |
| fingerprint data | `sha256`, `hash` |
| prove a value came from you and was not changed | `hmacSha256` + `timingSafeEqualEncoded` |
| store a password | `hashPassword`, `verifyPassword` (scrypt) |
| store data you must read back | `encryptEnvelope`, `decryptEnvelope` (AES-256-GCM) |
| let others verify without being able to sign | `generateEd25519KeyPair`, `signString`, `verifyString` |
| compare two secrets | `timingSafeEqualString`, `timingSafeEqualEncoded`, `timingSafeEqual` |

## Random values and secure ids

How hard a random value is to guess is measured in **bits of entropy**: a value with *n* bits is one of 2n equally likely possibilities. Each character from an alphabet of *A* symbols adds log2(*A*) bits. The generators in `@zudojs/crypto` all use the operating system's secure random source:

random.tsNode.js only

```ts
import {
  generateApiKey, generateOtp, generatePasswordResetToken, generateToken,
  randomBytesSecure, randomFromAlphabet, randomInteger, randomUuid,
} from "@zudojs/crypto";

const bits = (length: number, alphabet: number) => Math.floor(length * Math.log2(alphabet));

const reset = await generatePasswordResetToken();
const apiKey = await generateApiKey();
const invoiceId = await generateToken({ bytes: 16, encoding: "hex", prefix: "inv_" });
const code = await generateOtp();
const invite = await randomFromAlphabet(10, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
const uuid = await randomUuid();

console.log("reset token:", reset.slice(0, 6) + "…", reset.length, "chars,", 32 * 8, "bits");
console.log("API key:    ", apiKey.slice(0, 4) + "…", apiKey.length, "chars");
console.log("invoice id: ", /^inv_[0-9a-f]{32}$/.test(invoiceId), bits(32, 16), "bits");
console.log("login code: ", /^\d{6}$/.test(code), bits(6, 10), "bits");
console.log("invite code:", /^[A-HJ-NP-Z2-9]{10}$/.test(invite), bits(10, 32), "bits");
console.log("uuid v4:    ", /^[0-9a-f]{8}-[0-9a-f]{4}-4/.test(uuid), 122, "bits");
console.log("32 bytes:   ", (await randomBytesSecure(32)).length, "- a die roll:", [1, 2, 3, 4, 5, 6].includes(await randomInteger(1, 6)));
```

Output of `npx tsx random.ts`

```ts
reset token: reset_… 49 chars, 256 bits
API key:     lat_… 47 chars
invoice id:  true 128 bits
login code:  true 19 bits
invite code: true 50 bits
uuid v4:     true 122 bits
32 bytes:    32 - a die roll: true
```

What to use each for:

- **Tokens that grant access** (reset links, sessions, API keys): 32 bytes. The prefix (`reset_`, `lat_`) is not secret; it tells you and your secret scanners what a leaked string is. `generatePasswordResetToken`, `generateSessionToken`, `generateApiKey` and friends pick the size and prefix for you.
- **Codes a person types**: short, so only safe with an expiry and a limit on attempts. Six digits are 19 bits: an attacker with unlimited tries needs about 500,000 guesses on average; with 5 tries per code they have a 1 in 200,000 chance. `randomFromAlphabet` with no `0/O` or `1/I` avoids typing mistakes.
- **Public ids** such as `inv_…`: 128 random bits make them unguessable, so a missing authorization check does not hand out neighbours. They are still not secrets, because ids appear in logs and URLs. Keep your `serial` primary key for joins and indexes, and add the random id as a unique column for everything outside the server.

> NEVER MATH.RANDOM
>
> A value made with `Math.random()`, `Date.now()`, a counter or a user id is not a secret, however it is mixed or hashed. If an attacker can work out the inputs, they can work out the token.

## Hashes and HMACs

A hash fingerprints data; anyone can compute it. An **HMAC** is a fingerprint made with a secret key; only key holders can compute it, so a matching HMAC proves the data came from one of them and was not changed. Cryptographic code is checked against published **test vectors**, inputs with known correct outputs. Here are the standard vector for SHA-256 and test case 1 of RFC 4231 for HMAC-SHA256:

hashing.tsNode.js only

```ts
import { hash, hmacSha256, sha256 } from "@zudojs/crypto";

console.log(await sha256("abc"));
const result = await hash("abc", { algorithm: "sha512", encoding: "base64url" });
console.log(result.algorithm, result.digest.length, "bytes,", result.encoded.length, "chars");

const key = new Uint8Array(20).fill(0x0b);
const mac = await hmacSha256("Hi There", key);
console.log(mac === "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");

try {
  await hmacSha256("Hi There", new TextEncoder().encode("secret"));
} catch (error) {
  console.log((error as Error).name, "-", (error as Error).message);
}
```

Output of `npx tsx hashing.ts`

```ts
ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
sha512 64 bytes, 86 chars
true
CryptoError - HMAC key must be at least 16 bytes, received 6.
```

The last call shows a safety rule in the package: an HMAC key shorter than 16 bytes is refused. A six-letter "secret" can be guessed offline from one signed value. Use 32 random bytes, stored as base64 in an environment variable, as below.

## Comparing secrets

Every comparison of a secret-dependent value that an attacker can repeat (signatures, API keys, HMACs) must take the same time whatever the input. The package has three constant-time helpers:

compare.tsNode.js only

```ts
import { timingSafeEqual, timingSafeEqualEncoded, timingSafeEqualString } from "@zudojs/crypto";

console.log(timingSafeEqualString("lat_7f3a9c", "lat_7f3a9c"), timingSafeEqualString("lat_7f3a9c", "lat_7f3a9d"));
console.log("different lengths:", timingSafeEqualString("lat_7f3a9c", "lat_7f"));
console.log("hex, any case:", timingSafeEqualEncoded("7F3A9C", "7f3a9c", "hex"));
console.log("not valid base64url:", timingSafeEqualEncoded("a*c", "abc", "base64url"));
console.log("bytes:", timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])));
```

Output of `npx tsx compare.ts`

```ts
true false
different lengths: false
hex, any case: true
not valid base64url: false
bytes: true
```

Unlike Node's own `timingSafeEqual`, these never throw on different lengths or broken input; they return `false`. `timingSafeEqualEncoded` decodes both sides first, so two spellings of the same bytes (upper- and lower-case hex) are equal. You do not need them to look up a token's *hash* in a database: the attacker cannot choose what the hash of their guess starts with, so the lookup's timing tells them nothing.

## Build: password-reset tokens

Now the reset flow from the [questions above](#reason). The store keeps rows by token hash, as a database table with a unique `token_hash` column would. The clock is passed in, so tests can move time:

password-resets.ts

```ts
import { generatePasswordResetToken, hashToken, TOKEN_PREFIX, TOKEN_TTL } from "@zudojs/crypto";

export interface Clock {
  now(): number;
}

interface ResetRow {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: number;
}

export class PasswordResets {
  private readonly rows = new Map<string, ResetRow>();

  constructor(
    private readonly clock: Clock,
    private readonly ttlMs: number = TOKEN_TTL.PASSWORD_RESET_MS,
  ) {}

  /** Returns the token for the e-mail link. Only its hash is kept. */
  async issue(userId: string): Promise<string> {
    for (const [tokenHash, row] of this.rows) {
      if (row.userId === userId) this.rows.delete(tokenHash);
    }
    const token = await generatePasswordResetToken();
    const tokenHash = await hashToken(token);
    this.rows.set(tokenHash, { userId, tokenHash, expiresAt: this.clock.now() + this.ttlMs });
    return token;
  }

  /** The user id for a valid token, or null. A token works at most once. */
  async redeem(token: string): Promise<string | null> {
    if (!token.startsWith(TOKEN_PREFIX.PASSWORD_RESET) || token.length > 128) return null;
    const tokenHash = await hashToken(token);
    const row = this.rows.get(tokenHash);
    if (!row) return null;
    this.rows.delete(tokenHash);
    return row.expiresAt > this.clock.now() ? row.userId : null;
  }

  storedRows(): readonly ResetRow[] {
    return [...this.rows.values()];
  }
}
```

- `issue` deletes the user's older tokens first: only the newest e-mail works.
- `redeem` refuses anything that does not look like a reset token before hashing it, and caps the length, so garbage never costs a hash.
- The row is deleted *before* the expiry check. An expired token cannot be tried again, and a valid one works once.
- `TOKEN_TTL.PASSWORD_RESET_MS` is 15 minutes.

reset-flow.tsNode.js only

```ts
import { PasswordResets } from "./password-resets.js";

let now = Date.UTC(2026, 8, 24, 9, 0);
const resets = new PasswordResets({ now: () => now });

const users = new Map([["ada@example.com", "u-ada"]]);
async function requestReset(email: string): Promise<string> {
  const userId = users.get(email.trim().toLowerCase());
  if (userId) {
    const token = await resets.issue(userId);
    console.log(`  (e-mail to ${email}: https://tasks.example.com/reset?token=${token.slice(0, 6)}…)`);
  }
  return "If that address has an account, we sent a reset link.";
}

console.log(await requestReset("ada@example.com"));
console.log(await requestReset("ceo@example.com"));

const first = await resets.issue("u-ada");
const second = await resets.issue("u-ada");
console.log("stored:", resets.storedRows().map((r) => ({ user: r.userId, hashLength: r.tokenHash.length })));
console.log("the table contains the token?", resets.storedRows().some((r) => r.tokenHash.includes(second)));

console.log("older token:", await resets.redeem(first));
console.log("newest token:", await resets.redeem(second));
console.log("used again:", await resets.redeem(second));

const late = await resets.issue("u-ada");
now += 16 * 60 * 1000;
console.log("after 16 minutes:", await resets.redeem(late));
console.log("garbage:", await resets.redeem("'; DROP TABLE users; --"));
```

Output of `npx tsx reset-flow.ts`

```ts
  (e-mail to ada@example.com: https://tasks.example.com/reset?token=reset_…)
If that address has an account, we sent a reset link.
If that address has an account, we sent a reset link.
stored: [ { user: 'u-ada', hashLength: 64 } ]
the table contains the token? false
older token: null
newest token: u-ada
used again: null
after 16 minutes: null
garbage: null
```

Both requests got the same answer; only the one with an account produced an e-mail. After two issues there is one row, holding a 64-character hash and no trace of the token. The older link was dead, the newest worked once, and the late one expired. After a successful reset, also call `auth.logoutAll(userId)` (from [the next lesson](https://zudojs.oyinlola.site/learn/zudo-auth)): anyone who knew the old password loses their sessions.

## Password hashing

Passwords are the opposite of tokens: people choose them, so they are guessable, and the hash must be slow. `hashPassword` uses scrypt and returns an object whose `encoded` string records the algorithm and its cost settings. [Authentication](https://zudojs.oyinlola.site/learn/zudo-auth#passwords) wraps it for logins; here is what it does underneath:

passwords.tsNode.js only

```ts
import { decodePasswordHash, hashPassword, isValidPassword, PASSWORD_POLICY, verifyPassword } from "@zudojs/crypto";

const result = await hashPassword("correct horse battery staple");
console.log(result.encoded.split("$").slice(0, 5).join("$"), "…", result.encoded.length, "chars");
console.log(await verifyPassword("correct horse battery staple", result.encoded));
console.log(await verifyPassword("correct horse battery stapler", result.encoded));

const parts = decodePasswordHash(result.encoded);
console.log(parts.algorithm, parts.salt.length, "byte salt,", parts.hash.length, "byte hash");

for (const attempt of [() => hashPassword("pw", { cost: 1024 }), () => hashPassword("x".repeat(2000))]) {
  try {
    await attempt();
  } catch (error) {
    console.log((error as Error).name, "-", (error as Error).message);
  }
}
console.log("policy:", PASSWORD_POLICY, "short ok?", isValidPassword("abc"), "- hashPassword('abc') works:", (await hashPassword("abc")).encoded.startsWith("v1$"));
```

Output of `npx tsx passwords.ts`

```ts
v1$scrypt$16384$8$5 … 86 chars
true
false
scrypt 16 byte salt, 32 byte hash
CryptoError - scrypt cost for a new password hash must be at least 16384.
CryptoError - Password must not exceed 1024 characters.
policy: { MIN_LENGTH: 8, RECOMMENDED_MIN_LENGTH: 12, MAX_LENGTH: 1024 } short ok? false - hashPassword('abc') works: true
```

The package refuses a *new* hash cheaper than scrypt's cost 16384, and passwords over 1,024 characters (so nobody makes your server hash a 10 MB "password"). It does **not** refuse short passwords: `hashPassword("abc")` works. Your registration route enforces the policy with `isValidPassword` or a schema, as in the authentication lesson.

## Encryption and key handling

The Task API pays freelancers for finished tasks, so it stores their bank account numbers, and must read them back to make transfers. Encryption with AES-256-GCM fits: a 32-byte key, a fresh 12-byte nonce (IV) per message, and an authentication tag that detects any change. `encryptEnvelope` returns one self-describing string, and `aad` (additional authenticated data) binds the ciphertext to its owner:

envelope.tsNode.js only

```ts
import { decryptEnvelope, encryptEnvelope, randomBytesSecure, utf8Decode, utf8Encode } from "@zudojs/crypto";

const key = await randomBytesSecure(32);
const owner = utf8Encode("freelancer:17");
const sealed = await encryptEnvelope(utf8Encode("0123456789 GTBank"), key, { aad: owner });

const [version, algorithm, iv, tag, ciphertext] = sealed.split(".");
console.log(version, algorithm, "iv", iv!.length, "tag", tag!.length, "ciphertext", ciphertext!.length, "chars");
console.log(utf8Decode(await decryptEnvelope(sealed, key, owner)));

const attempts: [string, () => Promise<Uint8Array>][] = [
  ["another owner", () => decryptEnvelope(sealed, key, utf8Encode("freelancer:18"))],
  ["no owner", () => decryptEnvelope(sealed, key)],
  ["wrong key", async () => decryptEnvelope(sealed, await randomBytesSecure(32), owner)],
  ["ciphertext changed", () => decryptEnvelope([version, algorithm, iv, tag, (ciphertext!.startsWith("A") ? "B" : "A") + ciphertext!.slice(1)].join("."), key, owner)],
  ["not an envelope", () => decryptEnvelope("v1.aes-256-gcm.abc", key, owner)],
];
for (const [label, attempt] of attempts) {
  try {
    await attempt();
    console.log(label, "-> decrypted?!");
  } catch (error) {
    const e = error as Error & { code?: string };
    console.log(label, "->", e.name, e.code, e.message);
  }
}
```

Output of `npx tsx envelope.ts`

```ts
v1 aes-256-gcm iv 16 tag 22 ciphertext 23 chars
0123456789 GTBank
another owner -> CryptoError ERR_CRYPTO_CIPHER Decryption failed.
no owner -> CryptoError ERR_CRYPTO_CIPHER Decryption failed.
wrong key -> CryptoError ERR_CRYPTO_CIPHER Decryption failed.
ciphertext changed -> CryptoError ERR_CRYPTO_CIPHER Decryption failed.
not an envelope -> CryptoError ERR_CRYPTO_CIPHER Invalid encrypted envelope.
```

The envelope carries a version (`v1`), the algorithm, the IV, the tag and the ciphertext. Copying the sealed value into another freelancer's row fails, because the AAD differs. Every failure is a `CryptoError` with code `ERR_CRYPTO_CIPHER`. Apart from the string that is not an envelope at all, they all say only "Decryption failed.": GCM never tells you *why*, it only guarantees you never get silently wrong data.

> LET THE PACKAGE CHOOSE THE IV
>
> The lower-level `encrypt(plaintext, key, { iv })` accepts an IV you pass in. With the same key, a repeated IV lets an attacker recover plaintexts and forge tags, as [the node:crypto lesson](https://zudojs.oyinlola.site/learn/node-crypto#encryption) showed, so `@zudojs/crypto` 1.4.0 made it a refusal: passing an IV this process has already used under the same key throws a `CryptoError` instead of encrypting. The guard only remembers what this one process has seen, so it is a safety net, not a proof of uniqueness across a restart or a fleet of servers. Never pass `iv` yourself; the package generates a fresh one for every call, which never trips the guard.

### Keys: load, name, rotate

A key is 32 random bytes that live in an environment variable or a secret manager, as base64. Load it once at start-up, and fail loudly if it is missing or the wrong size. `createCryptoKey` checks the size for the algorithm and gives the key a **key id** and a **fingerprint** (a hash of the key, safe to log). The file below is a small **key ring**: every sealed value starts with the id of the key that sealed it, so old values still open after you add a new key:

vault.ts

```ts
import {
  createCryptoKey, CryptoAlgorithm, decryptEnvelope, encryptEnvelope, fromBase64, utf8Decode, utf8Encode,
} from "@zudojs/crypto";
import type { CryptoKey } from "@zudojs/crypto";

export async function loadKey(keyId: string, base64: string | undefined): Promise<CryptoKey> {
  if (!base64) throw new Error(`Encryption key ${keyId} is not set`);
  return createCryptoKey(fromBase64(base64), { algorithm: CryptoAlgorithm.AES_256_GCM, keyId });
}

export class Vault {
  private readonly keys: ReadonlyMap<string, CryptoKey>;

  constructor(keys: readonly CryptoKey[], private readonly currentId: string) {
    this.keys = new Map(keys.map((key) => [key.keyId, key]));
    if (!this.keys.has(currentId)) throw new Error(`No key with id ${currentId}`);
  }

  async seal(plaintext: string, owner: string): Promise<string> {
    const key = this.keys.get(this.currentId)!;
    const envelope = await encryptEnvelope(utf8Encode(plaintext), key.bytes(), { aad: utf8Encode(owner) });
    return `${key.keyId}:${envelope}`;
  }

  async open(sealed: string, owner: string): Promise<string> {
    const at = sealed.indexOf(":");
    const key = this.keys.get(sealed.slice(0, at));
    if (at < 1 || !key) throw new Error("Unknown encryption key");
    return utf8Decode(await decryptEnvelope(sealed.slice(at + 1), key.bytes(), utf8Encode(owner)));
  }

  needsRotation(sealed: string): boolean {
    return !sealed.startsWith(`${this.currentId}:`);
  }
}
```

key-ring.tsNode.js only

```ts
import { randomBytesSecure, toBase64 } from "@zudojs/crypto";
import { loadKey, Vault } from "./vault.js";

// Demo only: invent the two keys. Your app reads PAYOUT_KEY_2026_03 and PAYOUT_KEY_2026_09 from the environment.
const env: Record<string, string | undefined> = {
  PAYOUT_KEY_2026_03: toBase64(await randomBytesSecure(32)),
  PAYOUT_KEY_2026_09: toBase64(await randomBytesSecure(32)),
  PAYOUT_KEY_BROKEN: "c2hvcnQ=",
};

const march = await loadKey("2026-03", env["PAYOUT_KEY_2026_03"]);
const september = await loadKey("2026-09", env["PAYOUT_KEY_2026_09"]);
console.log("key", september.keyId, september.length, "bits, fingerprint", /^[0-9a-f]{64}$/.test(september.fingerprint));
console.log("safe to log:", Object.keys(JSON.parse(JSON.stringify(september))).includes("bytes") ? "NO" : "yes, no key bytes");

for (const name of ["PAYOUT_KEY_BROKEN", "PAYOUT_KEY_MISSING"]) {
  try {
    await loadKey(name, env[name]);
  } catch (error) {
    console.log(name, "->", (error as Error).message);
  }
}

const oldVault = new Vault([march], "2026-03");
const stored = await oldVault.seal("0123456789 GTBank", "freelancer:17");

const vault = new Vault([march, september], "2026-09");
console.log("old value opens:", await vault.open(stored, "freelancer:17"), "- needs rotation:", vault.needsRotation(stored));
const rotated = await vault.seal(await vault.open(stored, "freelancer:17"), "freelancer:17");
console.log("rotated to", rotated.split(":")[0], "- needs rotation:", vault.needsRotation(rotated));
```

Output of `npx tsx key-ring.ts`

```ts
key 2026-09 256 bits, fingerprint true
safe to log: yes, no key bytes
PAYOUT_KEY_BROKEN -> Algorithm "aes-256-gcm" requires a 32-byte key, received 5 bytes.
PAYOUT_KEY_MISSING -> Encryption key PAYOUT_KEY_MISSING is not set
old value opens: 0123456789 GTBank - needs rotation: true
rotated to 2026-09 - needs rotation: false
```

The key's `length` is in *bits* (256), and serialising the key object as JSON leaves out its bytes, so a key that ends up in a log line by accident does not leak. Loading refuses a 5-byte key and a missing variable at start-up, long before the first payout.

Rotation then has four steps: add the new key and make it current (new values use it at once), keep the old key for reading, re-seal old values in a background job using `needsRotation`, and remove the old key only when nothing needs it. [Cryptography for developers](https://zudojs.oyinlola.site/learn/sec-crypto#rotation) covers what to do when a key has leaked.

## Build: signed download links

In [the upload project](https://zudojs.oyinlola.site/learn/zudo-file-uploads), downloads went through the API. Sometimes you want a link that works on its own for a short time: in an e-mail, or in an `<img>` tag where the browser cannot send your login token. The link then carries its own proof: a **signed value**. It holds some data, an expiry and a **purpose**, and an HMAC over all of it with a key only the server has:

signed.ts

```ts
import { fromBase64Url, hmacSha256, timingSafeEqualEncoded, toBase64Url, utf8Decode, utf8Encode } from "@zudojs/crypto";

export interface SigningKeys {
  readonly current: string;
  readonly keys: Readonly<Record<string, Uint8Array>>;
}

type Data = Readonly<Record<string, string | number>>;
export type Verified =
  | { readonly ok: true; readonly data: Data }
  | { readonly ok: false; readonly reason: "malformed" | "unknown key" | "bad signature" | "wrong purpose" | "expired" };

export async function signValue(signing: SigningKeys, purpose: string, data: Data, expiresAt: number): Promise<string> {
  const payload = toBase64Url(utf8Encode(JSON.stringify({ purpose, data, expiresAt })));
  const kid = signing.current;
  const mac = await hmacSha256(`${kid}.${payload}`, signing.keys[kid]!, "base64url");
  return `${kid}.${payload}.${mac}`;
}

export async function verifyValue(signing: SigningKeys, purpose: string, value: string, now: number): Promise<Verified> {
  const parts = value.split(".");
  if (parts.length !== 3 || value.length > 2048) return { ok: false, reason: "malformed" };
  const [kid, payload, mac] = parts as [string, string, string];
  const key = signing.keys[kid];
  if (!key) return { ok: false, reason: "unknown key" };
  const expected = await hmacSha256(`${kid}.${payload}`, key, "base64url");
  if (!timingSafeEqualEncoded(mac, expected, "base64url")) return { ok: false, reason: "bad signature" };
  const claims = JSON.parse(utf8Decode(fromBase64Url(payload))) as { purpose: string; data: Data; expiresAt: number };
  if (claims.purpose !== purpose) return { ok: false, reason: "wrong purpose" };
  if (claims.expiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, data: claims.data };
}
```

The order of the checks matters. The signature is checked before the payload is even parsed, so an attacker's JSON never reaches `JSON.parse`. The key id (`kid`) is inside the signed text, so it cannot be swapped for another. The **purpose** stops a value signed for one feature from being replayed in another: a download link is not an e-mail confirmation, even though both are signed with the same key.

signed-links.tsNode.js only

```ts
import { randomBytesSecure } from "@zudojs/crypto";
import { signValue, verifyValue } from "./signed.js";

const signing = { current: "k2", keys: { k1: await randomBytesSecure(32), k2: await randomBytesSecure(32) } };
const now = Date.UTC(2026, 8, 24, 9, 0);
const tenMinutes = 10 * 60 * 1000;

const sig = await signValue(signing, "attachment-download", { attachment: 7, user: "u-ada" }, now + tenMinutes);
console.log(`/attachments/7/download?sig=${sig.slice(0, 12)}…`);
console.log(await verifyValue(signing, "attachment-download", sig, now + 60_000));

const [kid, payload, mac] = sig.split(".") as [string, string, string];
const edited = Buffer.from(JSON.stringify({ purpose: "attachment-download", data: { attachment: 8, user: "u-ada" }, expiresAt: now + tenMinutes })).toString("base64url");
const oldKeyLink = await signValue({ ...signing, current: "k1" }, "attachment-download", { attachment: 7, user: "u-ada" }, now + tenMinutes);
const confirm = await signValue(signing, "email-confirmation", { user: "u-ada" }, now + tenMinutes);

const cases: [string, string, string, number][] = [
  ["attachment 8 instead", `${kid}.${edited}.${mac}`, "attachment-download", now],
  ["signed with k1", oldKeyLink, "attachment-download", now],
  ["k1 retired", oldKeyLink.replace(/^k1/, "k0"), "attachment-download", now],
  ["other purpose", confirm, "attachment-download", now],
  ["after 11 minutes", sig, "attachment-download", now + 11 * 60 * 1000],
  ["not a signed value", "hello", "attachment-download", now],
  ["mac cut short", `${kid}.${payload}.${mac.slice(0, 20)}`, "attachment-download", now],
];
for (const [label, value, purpose, at] of cases) {
  const result = await verifyValue(signing, purpose, value, at);
  console.log(label.padEnd(20), result.ok ? "ok" : result.reason);
}
```

Output of `npx tsx signed-links.ts`

```ts
/attachments/7/download?sig=k2.eyJwdXJwb…
{ ok: true, data: { attachment: 7, user: 'u-ada' } }
attachment 8 instead bad signature
signed with k1       ok
k1 retired           unknown key
other purpose        wrong purpose
after 11 minutes     expired
not a signed value   malformed
mac cut short        bad signature
```

Changing the attachment id broke the signature. A link signed with the older key `k1` still works, because `k1` is still in the ring for reading; rewriting its key id is caught as an unknown key. The e-mail confirmation value had a valid signature, but the wrong purpose. And ten minutes means ten minutes.

A signed link is a **bearer token**: whoever holds it can use it until it expires. Keep the lifetime short, put the user id inside so your route can still check the user may see the attachment, and never put secrets in the payload: it is signed, not encrypted, exactly like a JWT. (A JWT is this same idea with a standard format; [authentication](https://zudojs.oyinlola.site/learn/zudo-auth#jwt) uses one for logins.)

### When others must verify: signatures

An HMAC can only be checked by someone who has the key, and anyone who can check can also sign. When a partner or a customer must verify your data without being able to forge it (an exported receipt, a webhook you send, a licence file), use a public-key **signature**. `@zudojs/crypto` signs with Ed25519:

signatures.tsNode.js only

```ts
import { exportPrivateKeyPem, exportPublicKeyPem, generateEd25519KeyPair, signString, toBase64Url, verifyString } from "@zudojs/crypto";

const pair = generateEd25519KeyPair();
const privateKey = exportPrivateKeyPem(pair.privateKey); // keep secret, like any key
const publicKey = exportPublicKeyPem(pair.publicKey);    // publish this
const receipt = JSON.stringify({ invoice: "inv_5f2c", amount: "₦45,000", paidAt: "2026-09-24" });

const signature = await signString(receipt, privateKey);
console.log(signature.length, "byte signature:", toBase64Url(signature).length, "chars");
console.log(publicKey.split("\n")[0]);
console.log("genuine:", await verifyString(receipt, signature, publicKey));
console.log("amount changed:", await verifyString(receipt.replace("45,000", "4,500"), signature, publicKey));
```

Output of `npx tsx signatures.ts`

```ts
64 byte signature: 86 chars
-----BEGIN PUBLIC KEY-----
genuine: true
amount changed: false
```

The keys are exported as **PEM** text, the usual format for storing and publishing keys. `signString` and `verifyString` take keys as PEM text or bytes; their types do not accept the `KeyObject`s that `generateEd25519KeyPair` returns, so export first. You publish the public key; the private key never leaves your server. [Cryptography for developers](https://zudojs.oyinlola.site/learn/sec-crypto#signatures) goes deeper into signatures, publishing keys and rotating them.

## Failure cases and testing

Cryptographic code fails quietly: a wrong comparison still returns a boolean, and a weak token still looks random. Test behaviour you can check:

- **Known answers.** Your HMAC and hash wrappers reproduce published vectors, like the RFC 4231 case above.
- **Round trips** for every input shape: empty strings, emoji, ₦ signs, long text.
- **Every rejection path**: each `reason` in `verifyValue`, each refusal in `redeem`. The signed-links example is that test.
- **Time**: inject the clock, as `PasswordResets` does, so expiry is tested in microseconds instead of 15 minutes.

crypto.test.tsNode.js only

```ts
import { strict as assert } from "node:assert";
import { randomBytesSecure, utf8Encode } from "@zudojs/crypto";
import { PasswordResets } from "./password-resets.js";
import { signValue, verifyValue } from "./signed.js";
import { Vault, loadKey } from "./vault.js";

async function test(name: string, body: () => Promise<void>) {
  try {
    await body();
    console.log("PASS", name);
  } catch (error) {
    console.log("FAIL", name, "-", (error as Error).message.split("\n")[0]);
  }
}

await test("vault round-trips unusual text", async () => {
  const key = await loadKey("t1", Buffer.from(await randomBytesSecure(32)).toString("base64"));
  const vault = new Vault([key], "t1");
  for (const text of ["", "₦45,000 to Chidi 🎉", "x".repeat(10_000)]) {
    assert.equal(await vault.open(await vault.seal(text, "freelancer:1"), "freelancer:1"), text);
  }
});

await test("two seals of the same text differ", async () => {
  const vault = new Vault([await loadKey("t1", Buffer.from(await randomBytesSecure(32)).toString("base64"))], "t1");
  assert.notEqual(await vault.seal("same", "o"), await vault.seal("same", "o"));
});

await test("a reset token expires exactly at its ttl", async () => {
  let now = 0;
  const resets = new PasswordResets({ now: () => now }, 1_000);
  const token = await resets.issue("u-1");
  now = 1_000;
  assert.equal(await resets.redeem(token), null);
});

await test("a signed value is refused one millisecond after expiry", async () => {
  const signing = { current: "k1", keys: { k1: await randomBytesSecure(32) } };
  const value = await signValue(signing, "p", { id: 1 }, 5_000);
  assert.deepEqual(await verifyValue(signing, "p", value, 4_999), { ok: true, data: { id: 1 } });
  assert.deepEqual(await verifyValue(signing, "p", value, 5_000), { ok: false, reason: "expired" });
});

await test("utf8Encode counts bytes, not characters", async () => {
  const bytes = utf8Encode("₦").length;
  assert.equal(bytes, 1, `₦ is ${bytes} bytes, not 1`);
});
```

Output of `npx tsx crypto.test.ts`

```ts
PASS vault round-trips unusual text
PASS two seals of the same text differ
PASS a reset token expires exactly at its ttl
PASS a signed value is refused one millisecond after expiry
FAIL utf8Encode counts bytes, not characters - ₦ is 3 bytes, not 1
```

The last test fails on purpose: `₦` is one character but 3 bytes in UTF-8. Length limits on anything you hash, sign or encrypt are limits on *bytes*; checking characters instead is a classic off-by-a-lot bug.

In your Vitest suite, also check that production settings are the strong ones: that the reset TTL is `TOKEN_TTL.PASSWORD_RESET_MS`, and that the keys loaded at start-up are 256 bits.

## Production concerns

- **Where keys live.** Environment variables set by your platform or a secret manager, never Git. Separate keys per purpose (signing links, encrypting payouts) and per environment, so a leaked staging key opens nothing in production.
- **Logging.** Log key ids and fingerprints, token prefixes and hashes, never keys, tokens, signatures or decrypted data. `CryptoKey` objects are safe to log; `key.bytes()` is not.
- **Errors at the edge.** A `CryptoError` from `decryptEnvelope` has status 500, which is right for your own stored data. For values that come from a client (a signed link, a reset token), answer 400 or 401 with a generic message instead, as `verifyValue` and `redeem` do by returning results instead of throwing.
- **Dependency injection.** `createCryptoService()` bundles the operations in one object you can register in [the container](https://zudojs.oyinlola.site/learn/zudo-container) and replace in tests.
- **Cost.** Each password hash takes tens of milliseconds of CPU on Node's thread pool; hashes of tokens and HMACs take microseconds. Rate-limit login and reset endpoints, not link verification.
- **Clear buffers you are done with.** `wipe(bytes)` fills a `Uint8Array` with zeros, shortening the time a key or password sits in memory after use.

## Practice

TRY IT YOURSELF

### Invite codes people can type

Team invites are read aloud and typed on phones. Write `inviteCode()` that returns 12 characters from an alphabet without `0`, `O`, `1`, `I` or `L`, formatted in groups of four (`ABCD-EFGH-JKMN`). How many bits of entropy does it have, and is that enough for a code that expires in 7 days and allows 10 attempts?

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`await randomFromAlphabet(12, ALPHABET)` gives you 12 raw characters. `raw.match(/.{4}/g)` splits a string into chunks of four.

HINT 2

`const raw = await randomFromAlphabet(12, ALPHABET); return raw.match(/.{4}/g)!.join("-");`.

SOLUTION

invite-code.tsNode.js only

```ts
import { randomFromAlphabet } from "@zudojs/crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

async function inviteCode(): Promise<string> {
  const raw = await randomFromAlphabet(12, ALPHABET);
  return raw.match(/.{4}/g)!.join("-");
}

const code = await inviteCode();
console.log(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(code));
console.log(ALPHABET.length, "symbols,", Math.floor(12 * Math.log2(ALPHABET.length)), "bits");
```

Output of `npx tsx invite-code.ts`

```ts
true
31 symbols, 59 bits
```

31 symbols give about 4.95 bits each, so 12 characters are 59 bits. With 10 attempts per code, an attacker's chance is 10 in 259: plenty. When checking a typed code, remove the dashes and upper-case it first, and compare in constant time.

TRY IT YOURSELF

### E-mail confirmation links

Use `signValue` and `verifyValue` to build `confirmationLink(userId, email)` and `confirm(sig, now)`. The link lasts 24 hours and must only work for confirmations. Show that a confirmation link cannot be used as a download link, and that a download link cannot confirm an e-mail.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`confirmationLink`: `const sig = await signValue(signing, "email-confirmation", { user: userId, email }, now + DAY); return \`/confirm?sig=${sig}\`;`.

HINT 2

`confirm`: `const result = await verifyValue(signing, "email-confirmation", sig, at); return result.ok ? \`confirmed ${result.data["email"]}\` : \`refused: ${result.reason}\`;`.

SOLUTION

confirm-email.tsNode.js only

```ts
import { randomBytesSecure } from "@zudojs/crypto";
import { signValue, verifyValue } from "./signed.js";

const signing = { current: "k1", keys: { k1: await randomBytesSecure(32) } };
const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 24, 9, 0);

async function confirmationLink(userId: string, email: string): Promise<string> {
  const sig = await signValue(signing, "email-confirmation", { user: userId, email }, now + DAY);
  return `/confirm?sig=${sig}`;
}

async function confirm(sig: string, at: number): Promise<string> {
  const result = await verifyValue(signing, "email-confirmation", sig, at);
  return result.ok ? `confirmed ${result.data["email"]}` : `refused: ${result.reason}`;
}

const link = await confirmationLink("u-ada", "ada@example.com");
const sig = new URL(link, "https://tasks.example.com").searchParams.get("sig")!;
console.log(await confirm(sig, now + 60_000));
console.log(await confirm(sig, now + DAY + 1));
console.log("as a download:", (await verifyValue(signing, "attachment-download", sig, now)).ok);
const download = await signValue(signing, "attachment-download", { attachment: 7 }, now + DAY);
console.log(await confirm(download, now));
```

Output of `npx tsx confirm-email.ts`

```ts
confirmed ada@example.com
refused: expired
as a download: false
refused: wrong purpose
```

Put the e-mail address inside the signed data: if the user changes their address before clicking, the old link confirms the old address, not the new one.

TRY IT YOURSELF

### Rotate every stored value

Write `rotateAll(vault, rows)` that re-seals every row whose value `needsRotation`, and returns how many it changed. Rows look like `{ owner: "freelancer:17", sealed: "…" }`. Run it twice and show the second run changes nothing.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Skip a row when `!vault.needsRotation(row.sealed)`. Otherwise read its plaintext first: `await vault.open(row.sealed, row.owner)`.

HINT 2

`if (!vault.needsRotation(row.sealed)) continue; row.sealed = await vault.seal(await vault.open(row.sealed, row.owner), row.owner); changed++;`. The second run finds every row already sealed with the current key, so it changes nothing.

SOLUTION

rotate-all.tsNode.js only

```ts
import { randomBytesSecure, toBase64 } from "@zudojs/crypto";
import { loadKey, Vault } from "./vault.js";

interface Row {
  owner: string;
  sealed: string;
}

async function rotateAll(vault: Vault, rows: Row[]): Promise<number> {
  let changed = 0;
  for (const row of rows) {
    if (!vault.needsRotation(row.sealed)) continue;
    row.sealed = await vault.seal(await vault.open(row.sealed, row.owner), row.owner);
    changed++;
  }
  return changed;
}

const oldKey = await loadKey("2026-03", toBase64(await randomBytesSecure(32)));
const newKey = await loadKey("2026-09", toBase64(await randomBytesSecure(32)));
const before = new Vault([oldKey], "2026-03");
const rows: Row[] = [];
for (const [owner, account] of [["freelancer:17", "0123456789 GTBank"], ["freelancer:18", "9876543210 Access"]]) {
  rows.push({ owner: owner!, sealed: await before.seal(account!, owner!) });
}

const vault = new Vault([oldKey, newKey], "2026-09");
console.log("first run:", await rotateAll(vault, rows));
console.log("second run:", await rotateAll(vault, rows));
console.log(rows.map((r) => r.sealed.split(":")[0]), await vault.open(rows[1]!.sealed, "freelancer:18"));
```

Output of `npx tsx rotate-all.ts`

```ts
first run: 2
second run: 0
[ '2026-09', '2026-09' ] 9876543210 Access
```

The job is **idempotent**: running it again is harmless, so it can be stopped and restarted at any time. In a database, process rows in batches, and update each row only if its `sealed` value is still the one you read (the version check from [data architecture](https://zudojs.oyinlola.site/learn/zudo-data-architecture#optimistic)), so a payout detail changed during the job is not overwritten.

## Summary

- Secrets come from the secure generator: `generateToken` and its named variants (32 bytes, with a prefix), `randomFromAlphabet` for typed codes, random public ids next to your serial keys. Never `Math.random`, times or counters.
- Store tokens as `hashToken` hashes. Reset tokens expire, work once, replace older ones, and the request endpoint answers the same for every address.
- HMAC keys are at least 16 bytes (use 32). A signed value holds a key id, a purpose, an expiry and data, and is checked in that order: format, key, signature (in constant time), purpose, expiry.
- `hashPassword` uses scrypt with a cost floor and a length cap, but no minimum length: enforce your policy yourself.
- `encryptEnvelope` gives versioned AES-256-GCM with a fresh IV; bind values to their owner with `aad`. Never pass your own IV.
- Load keys with `createCryptoKey` (size check, key id, loggable fingerprint), prefix stored values with the key id, and rotate with a key ring and an idempotent job.
- Compare secrets with `timingSafeEqualString` or `timingSafeEqualEncoded`, which return `false` instead of throwing.

Next, [authentication](https://zudojs.oyinlola.site/learn/zudo-auth) uses these building blocks through `@zudojs/auth`: password logins, JWTs, sessions and lockouts.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
