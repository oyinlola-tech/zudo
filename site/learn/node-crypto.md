---
title: "Cryptography with node:crypto — ZudoJS Academy"
description: "Use node:crypto correctly: unguessable tokens, hashes and HMAC webhook signatures, timing-safe comparison, scrypt password hashing and AES-256-GCM encryption."
source: https://zudojs.oyinlola.site/learn/node-crypto
---

LEVEL 4 · LESSON 5 OF 20

Node.js Core

# Cryptography with node:crypto

Use node:crypto correctly: unguessable tokens, hashes and HMAC webhook signatures, timing-safe comparison, scrypt password hashing and AES-256-GCM encryption.

- **55 min** to read and try
- **You need:** Files, paths and your computer, Streams and buffers, and Events, processes and workers
- **You build:** An account security toolkit that hashes passwords, issues reset tokens, verifies signed payment webhooks and encrypts bank account numbers

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Choose between a hash, an HMAC, a password hash and encryption for a given security goal
- Generate unguessable tokens and codes and store only their hashes
- Verify an HMAC-signed webhook over the raw body with timingSafeEqual and reject replays
- Hash and verify passwords with scrypt, a random salt and a self-describing stored format
- Encrypt and decrypt with AES-256-GCM, bind data with AAD and detect tampering

## A shop with four secrets to protect

Your shop's server holds things attackers want. Think about what happens when something goes wrong:

1. **Passwords.** One day a backup of the users table leaks. If the passwords are readable, or easy to recover, every customer who reuses a password is exposed on every other site too.
2. **Payment notifications.** The payment provider calls your server with *"charge.success, ₦45,000, order 1042"*, and your code marks the order paid and ships it. Anyone on the internet can send the same request. How do you know it came from the provider?
3. **Bank account numbers.** To pay out sellers you must store their account numbers and read them back later. A leaked backup must not reveal them.
4. **Tokens.** A password-reset link contains a token. If an attacker can guess tokens, they can take over accounts without knowing any password.

Each problem needs a different cryptographic tool, and using the wrong one is a classic, serious bug: passwords stored with a fast hash, webhook signatures compared with `===`, "encryption" that is really base64. [Files, paths and your computer](https://zudojs.oyinlola.site/learn/node-apis#crypto) introduced `randomUUID`, `randomBytes` and SHA-256. This lesson goes through every tool in `node:crypto` that a backend developer needs, shows how each one fails when misused, and ends with a small toolkit that handles all four problems.

Almost every example needs Node.js; the browser version of `crypto` is different (you will meet it at the end). Run them with `node file.js`.

## The words and the map

A few terms come up again and again:

- A **key** is a secret random value, usually 32 bytes, known only to the parties that should be able to read or sign something.
- A **hash function** turns any input into a fixed-length fingerprint (a **digest**). It has no key and cannot be reversed.
- A **MAC** (message authentication code) is a fingerprint made *with a key*. Only someone with the key can make a valid one. **HMAC** is the standard way to build one from a hash.
- A **cipher** encrypts: it turns **plaintext** into **ciphertext** with a key, and back again.
- A **salt** and a **nonce** (also called IV, initialisation vector) are random values that are *not* secret. They make every result unique even when the input repeats.

And the map you will fill in during this lesson:

| You need to… | Use | Not |
| --- | --- | --- |
| make an id, token or code nobody can guess | `randomBytes`, `randomInt`, `randomUUID` | `Math.random()` |
| check a file or value has not changed by accident | SHA-256 hash | MD5, SHA-1 |
| prove a message came from someone who knows a shared key | HMAC-SHA256, compared with `timingSafeEqual` | `sha256(secret + message)`, `===` |
| store a password | scrypt or Argon2id with a random salt | SHA-256, encryption |
| store data you must read back later | AES-256-GCM with a random nonce | base64, hashing |

Cryptographic functions work on bytes, so their results are `Buffer`s (from [Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams#buffers)). To store or send bytes as text you **encode** them. Encoding is not encryption: anyone can decode it.

encodings.jsNode.js only

```ts
import { randomBytes } from "node:crypto";

const key = randomBytes(32);
console.log("bytes:     ", key.length);
console.log("hex:       ", key.toString("hex").length, "characters");
console.log("base64:    ", key.toString("base64").length, "characters");
console.log("base64url: ", key.toString("base64url").length, "characters");

const secretNote = Buffer.from("PIN 4821").toString("base64");
console.log("'encrypted' with base64:", secretNote, "->", Buffer.from(secretNote, "base64").toString());
```

Output of `node encodings.js`

```ts
bytes:      32
hex:        64 characters
base64:     44 characters
base64url:  43 characters
'encrypted' with base64: UElOIDQ4MjE= -> PIN 4821
```

**base64url** is base64 with `-` and `_` instead of `+` and `/`, and no `=` padding, so it can go into URLs and file names unchanged. It is the right choice for tokens in links.

## Unguessable values

`Math.random()` is built for games and simulations. Its numbers come from a formula with a small internal state, and after seeing enough outputs an attacker can predict the next ones. `node:crypto`'s functions take randomness from the operating system's **cryptographically secure** generator, which is designed so that no amount of past output helps predict the future.

### Codes and dice: randomInt

A six-digit code for confirming a phone number looks easy: take a random byte and use `% 10` for each digit. But that is subtly unfair. There are 256 possible byte values, and 256 is not a multiple of 10:

modulo-bias.js

```ts
const counts = Array(10).fill(0);
for (let byte = 0; byte < 256; byte++) counts[byte % 10]++;
console.log(counts.map((count, digit) => `${digit}:${count}`).join(" "));
```

Output of `node modulo-bias.js` and of the browser terminal

```ts
0:26 1:26 2:26 3:26 4:26 5:26 6:25 7:25 8:25 9:25
```

Digits 0 to 5 come up 26 times in 256, digits 6 to 9 only 25 times. This **modulo bias** makes some codes more likely than others, which helps an attacker who is guessing. `randomInt(min, max)` avoids it (it throws away values that would cause bias and draws again), and returns a whole number from `min` up to but not including `max`:

codes.jsNode.js only

```ts
import { randomInt, randomUUID, randomBytes } from "node:crypto";

const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
console.log("six digits:", /^\d{6}$/.test(code));

const die = randomInt(1, 7);
console.log("die roll between 1 and 6:", die >= 1 && die <= 6);

const orderId = randomUUID();
console.log("uuid v4:", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(orderId));

const resetToken = randomBytes(32).toString("base64url");
console.log("reset token length:", resetToken.length, "url-safe:", /^[A-Za-z0-9_-]+$/.test(resetToken));
```

Output of `node codes.js`

```ts
six digits: true
die roll between 1 and 6: true
uuid v4: true
reset token length: 43 url-safe: true
```

- A 6-digit code has only 1,000,000 possibilities. That is fine for a code that expires in 10 minutes and allows 5 attempts, and hopeless for anything long-lived. Rate limiting is what makes short codes safe.
- A UUID v4 has 122 random bits. Good for ids, but ids often appear in URLs and logs, so do not use them as secrets.
- 32 random bytes are 256 bits: guessing is impossible in practice. Use this size for session ids, API keys and reset tokens.

### Store the hash of a token, not the token

If your database holds valid reset tokens and it leaks, the attacker can use them. So store only a SHA-256 hash of each token. The user's e-mail link holds the token itself; when it comes back, you hash it again and look the hash up.

reset-token.jsNode.js only

```ts
import { createHash, randomBytes } from "node:crypto";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const resets = new Map();

function createReset(userId, now) {
  const token = randomBytes(32).toString("base64url");
  resets.set(sha256(token), { userId, expiresAt: now + 15 * 60_000 });
  return token;
}

function useReset(token, now) {
  const key = sha256(token);
  const entry = resets.get(key);
  resets.delete(key);
  if (!entry || entry.expiresAt < now) return null;
  return entry.userId;
}

const now = Date.UTC(2026, 8, 24, 9, 0);
const link = createReset("user-17", now);
console.log("stored values contain the token:", [...resets.keys()].includes(link));
console.log("first use:", useReset(link, now + 60_000));
console.log("second use:", useReset(link, now + 120_000));
console.log("expired:", useReset(createReset("user-18", now), now + 16 * 60_000));
```

Output of `node reset-token.js`

```ts
stored values contain the token: false
first use: user-17
second use: null
expired: null
```

A fast hash like SHA-256 is fine here, even though you will soon see it is wrong for passwords. The difference is the input: a token has 256 random bits, so there is nothing to guess, however fast the hash. A password chosen by a person might be one of a few million common ones. The token is also deleted on first use and expires, so a stolen link stops working quickly.

## Hashes in depth

A cryptographic hash promises three things: the same input always gives the same digest; you cannot find an input for a given digest (it is **one-way**); and you cannot find two inputs with the same digest (it is **collision resistant**). A tiny change in the input changes about half the output bits, so similar inputs give completely different digests. `crypto.hash` is a one-call shortcut for small inputs:

hash-props.jsNode.js only

```ts
import { hash } from "node:crypto";

const a = hash("sha256", "Invoice INV-1042: ₦45,000");
const b = hash("sha256", "Invoice INV-1042: ₦45,001");

let differentBits = 0;
for (let i = 0; i < a.length; i += 2) {
  let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
  while (x) {
    differentBits += x & 1;
    x >>= 1;
  }
}
console.log(a);
console.log(b);
console.log(`${differentBits} of 256 bits differ`);
console.log("sha512 length:", hash("sha512", "x").length, "hex characters");
```

Output of `node hash-props.js`

```ts
a4f32f85a2a935a8bc1f34ed9ab21972048d0aed0364e0e1819c8b3f17bb20a0
1b3ddaba0434a7ac12c18af7ea870f09f867e288c97f533cdefb73c0ba39cf51
154 of 256 bits differ
sha512 length: 128 hex characters
```

MD5 and SHA-1 still appear in old code and tutorials. Both are **broken**: researchers can create two different files with the same MD5 or SHA-1 digest. Never use them for security. SHA-256 and SHA-512 are the standard choices today.

### Hashing a file with a stream

Downloads often publish a SHA-256 **checksum** so you can check the file arrived intact. `createHash` returns a stream you can pipe into, so even a file of many gigabytes is hashed with constant memory:

checksum.jsNode.js only

```ts
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, rm, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

await writeFile("invoices.csv", "id,amount\nINV-1042,45000\nINV-1043,12500\n");

async function sha256File(path) {
  const hasher = createHash("sha256");
  await pipeline(createReadStream(path), hasher);
  return hasher.digest("hex");
}

const published = "c419272338b2c9a1c9659a8c89cac88ad5e2b94f391c3f3f4060e8c854083a43";
console.log("intact file matches:", (await sha256File("invoices.csv")) === published);

await appendFile("invoices.csv", "INV-1044,1\n");
console.log("changed file matches:", (await sha256File("invoices.csv")) === published);
await rm("invoices.csv");
```

Output of `node checksum.js`

```ts
intact file matches: true
changed file matches: false
```

One extra line was enough to change the digest completely. A checksum protects against *accidents* such as a broken download. It does not protect against an *attacker* who can change both the file and the published checksum. For that you need a key, which brings us to HMAC.

## HMAC: signing a webhook

A **webhook** is an HTTP request another service sends to your server when something happens, such as a payment succeeding. Payment providers (Paystack, Flutterwave, Stripe and others) solve the "anyone can send it" problem the same way. When you set up the webhook, the provider gives you a **signing secret**. For every notification it computes an HMAC of the request body with that secret and puts it in a header. Your server computes the same HMAC over the body it received. If they match, the sender knew the secret, and the body was not changed on the way.

HMAC is a standard (RFC 2104), so its results can be checked against published test values. Here is the standard one for HMAC-SHA256:

hmac-standard.jsNode.js only

```ts
import { createHmac } from "node:crypto";

const mac = createHmac("sha256", "key").update("The quick brown fox jumps over the lazy dog").digest("hex");
console.log(mac);
console.log(mac === "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
```

Output of `node hmac-standard.js`

```ts
f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8
true
```

> NOT sha256(secret + message)
>
> Why not just hash the secret and the message together? Because SHA-256 has a weakness called **length extension**: from `sha256(secret + message)` an attacker can compute a valid digest for `message + extra` without knowing the secret. HMAC was designed to prevent exactly that. Use `createHmac`, never a home-made combination.

REASON IT OUT

### Before you trust a payment notification

Your endpoint receives `POST /webhooks/payments` with a JSON body and an `x-signature` header. If it is genuine, your code marks the order paid and ships goods worth real money. Think through what can go wrong before you write the check:

- Who can send a request to this URL?
- Which exact bytes did the provider sign: the JSON object, or the text of the body?
- The signature is a secret-dependent string. How should you compare it with yours?
- Can the same genuine request arrive twice? What if an attacker records one and sends it again next week?

**Show the reasoning**

**Anyone** can send a request; the URL is not a secret. Only the HMAC proves origin.

The provider signed the **raw bytes** of the body. If you parse the JSON and turn it back into text, spacing and key order can change, and the HMAC no longer matches, even for a genuine request. Verify first, on the raw body, then parse.

Compare with `timingSafeEqual`, not `===`, for reasons explained in the next section.

Yes, it can arrive twice: providers **retry** when your server was slow or returned an error. And a recorded request replayed later still has a valid signature. So remember which event ids you have processed and ignore repeats (this is called **idempotency**), and reject signatures whose timestamp is too old, when the provider signs a timestamp.

The next example shows the raw-body trap. The same data, parsed and turned back into JSON with different spacing, no longer matches:

raw-body.jsNode.js only

```ts
import { createHmac, randomBytes } from "node:crypto";

const secret = randomBytes(32);
const sign = (body) => createHmac("sha512", secret).update(body).digest("hex");

const rawBody = '{"event":"charge.success","data":{"reference":"ORD-1042","amount":4500000}}';
const header = sign(rawBody);

console.log("raw body verifies:       ", sign(rawBody) === header);
const reserialized = JSON.stringify(JSON.parse(rawBody), null, 2);
console.log("re-serialized verifies:  ", sign(reserialized) === header);

const tampered = rawBody.replace("4500000", "4500");
console.log("changed amount verifies: ", sign(tampered) === header);
```

Output of `node raw-body.js`

```ts
raw body verifies:        true
re-serialized verifies:   false
changed amount verifies:  false
```

This is why web frameworks give webhook routes access to the raw body. In a plain `node:http` server ([Reading a request body](https://zudojs.oyinlola.site/learn/node-http#body)) you already have it: collect the chunks into a `Buffer` and verify that before calling `JSON.parse`. The comparisons above use `===` only to show which inputs match; your real check needs the next section.

## Timing attacks and timingSafeEqual

`===` on two strings stops at the first character that differs. Comparing a wrong guess that starts with the right character takes a tiny bit longer than comparing one that starts wrong. Over a network, one comparison's difference is far smaller than the noise, but an attacker can send millions of requests and average them. Here the time is replaced by a count of the steps taken, which is what the time is made of:

leaky-compare.js

```ts
function leakyEqual(expected, guess) {
  let steps = 0;
  for (let i = 0; i < expected.length; i++) {
    steps++;
    if (expected[i] !== guess[i]) return { equal: false, steps };
  }
  return { equal: guess.length === expected.length, steps };
}

const signature = "7f3a9c";
for (const guess of ["000000", "700000", "7f0000", "7f3000", "7f3a9c"]) {
  console.log(guess, leakyEqual(signature, guess));
}
```

Output of `node leaky-compare.js` and of the browser terminal

```ts
000000 { equal: false, steps: 1 }
700000 { equal: false, steps: 2 }
7f0000 { equal: false, steps: 3 }
7f3000 { equal: false, steps: 4 }
7f3a9c { equal: true, steps: 6 }
```

Each correct character makes the comparison one step longer. That lets an attacker find the signature one character at a time: 16 tries per hex character instead of 1664 for the whole thing. This is a **timing attack**.

`timingSafeEqual(a, b)` compares two buffers in **constant time**: it always looks at every byte, so the time says nothing about where they differ. It requires both buffers to have the same length and throws otherwise, so check the length first (the length of a signature is not a secret):

safe-compare.jsNode.js only

```ts
import { timingSafeEqual } from "node:crypto";

function safeEqualHex(expectedHex, receivedHex) {
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

console.log(safeEqualHex("7f3a9c", "7f3a9c"));
console.log(safeEqualHex("7f3a9c", "7f3a9d"));
console.log(safeEqualHex("7f3a9c", "7f3a"));

try {
  timingSafeEqual(Buffer.from("7f3a9c"), Buffer.from("7f3a"));
} catch (error) {
  console.log(error.code);
}
```

Output of `node safe-compare.js`

```ts
true
false
false
ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH
```

Use a constant-time comparison for anything secret-dependent that an attacker can make you compare over and over: signatures, API keys, reset-token hashes. Note that `Buffer.from(text, "hex")` silently stops at the first character that is not hex, so a header like `"zz"` becomes an empty buffer. The length check turns that into a clean `false`.

## Passwords: slow on purpose

You cannot store a password encrypted, because whoever has the key (your server, and anyone who breaks into it) could decrypt all of them. You store a hash and, at login, hash the attempt and compare. But not with SHA-256. Look at what an attacker does with a leaked table:

fast-hash.jsNode.js only

```ts
import { hash } from "node:crypto";

const leaked = [
  { email: "ada@example.com", hash: hash("sha256", "password123") },
  { email: "bola@example.com", hash: hash("sha256", "iloveyou") },
  { email: "chidi@example.com", hash: hash("sha256", "password123") },
];

const commonPasswords = ["123456", "password", "iloveyou", "qwerty", "password123"];
const lookup = new Map(commonPasswords.map((pw) => [hash("sha256", pw), pw]));

for (const user of leaked) {
  console.log(user.email, "->", lookup.get(user.hash) ?? "not cracked");
}

let tries = 0;
const start = performance.now();
while (performance.now() - start < 200) hash("sha256", "guess" + tries++);
console.log("more than 100,000 guesses per second on one core:", tries * 5 > 100_000);
```

Output of `node fast-hash.js`

```ts
ada@example.com -> password123
bola@example.com -> iloveyou
chidi@example.com -> password123
more than 100,000 guesses per second on one core: true
```

Two weaknesses show up:

- **No salt.** Ada and Chidi have the same hash, so cracking one cracks both, and a precomputed table of common passwords (a **rainbow table**) cracks everyone at once.
- **Too fast.** One laptop core does hundreds of thousands of SHA-256 hashes per second; a graphics card does billions. Every common password falls in seconds.

A **password hashing function** fixes both. It takes a random **salt** per user, stored next to the hash, so equal passwords get different hashes and precomputed tables are useless. And it is deliberately **slow and memory-hungry**, tuned so one login takes tens of milliseconds for you but makes billions of guesses unaffordable. Node.js has **scrypt** built in.

### Hashing and verifying with scrypt

scrypt's cost is set by three numbers: `N` (CPU and memory cost, a power of 2), `r` (block size) and `p` (parallelism). Memory use is about `128 × N × r` bytes. The security guidance from OWASP (a well-known web security organisation) recommends at least N = 217, r = 8, p = 1, which needs 128 MiB. That is above Node.js's default memory limit for scrypt, so you must raise `maxmem`:

scrypt-maxmem.jsNode.js only

```ts
import { scryptSync } from "node:crypto";

try {
  scryptSync("password123", "salt", 64, { N: 2 ** 17, r: 8, p: 1 });
} catch (error) {
  console.log(error.code);
}

const ok = scryptSync("password123", "salt", 64, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
console.log("derived", ok.length, "bytes");
```

Output of `node scrypt-maxmem.js`

```ts
ERR_CRYPTO_INVALID_SCRYPT_PARAMS
derived 64 bytes
```

Now a pair of functions you can actually use. The stored value is **self-describing**: it records the algorithm and the parameters next to the salt and hash, so you can raise the cost later and still verify old hashes.

passwords.jsNode.js only

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
export const PARAMS = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LENGTH = 32;

function options({ N, r, p }) {
  return { N, r, p, maxmem: 256 * N * r };
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, options(PARAMS));
  const { N, r, p } = PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const [name, N, r, p, salt, key] = stored.split("$");
  if (name !== "scrypt") throw new Error(`unknown password hash format: ${name}`);
  const expected = Buffer.from(key, "base64url");
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  const actual = await scryptAsync(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, options(params));
  return timingSafeEqual(actual, expected);
}
```

login.jsNode.js only

```ts
import { hashPassword, verifyPassword } from "./passwords.js";

const ada = await hashPassword("correct horse battery staple");
const chidi = await hashPassword("correct horse battery staple");

console.log(ada.split("$").slice(0, 4).join("$"), "…");
console.log("same password, same stored value:", ada === chidi);
console.log("right password:", await verifyPassword("correct horse battery staple", ada));
console.log("wrong password:", await verifyPassword("correct horse battery stapler", ada));
```

Output of `node login.js`

```ts
scrypt$131072$8$1 …
same password, same stored value: false
right password: true
wrong password: false
```

- The same password gives different stored values, because each has its own salt. The salt is not secret; its job is only to be unique.
- `verifyPassword` reads the parameters from the stored value, not from `PARAMS`. When you raise the cost next year, old hashes still verify, and you can re-hash a user's password with the new cost right after a successful login, the only time you have the plain password.
- Use the **async** `scrypt`, not `scryptSync`, in a server. The async version runs on Node.js's internal thread pool, the way file reads do, so the event loop keeps serving other requests during the hundreds of milliseconds it takes. `scryptSync` would block the whole server for every login, the problem you solved with workers in [the previous lesson](https://zudojs.oyinlola.site/learn/node-events-processes#workers).

### Normalizing the password

Why `normalize("NFKC")`? In Unicode, "é" can be stored as one character or as "e" plus a combining accent. They look identical, but they are different bytes, so they hash differently. A user who registered on a phone and logs in on a laptop could be locked out:

normalize.jsNode.js only

```ts
import { hash } from "node:crypto";

const phone = "caf\u00e9-2026";
const laptop = "cafe\u0301-2026";

console.log(phone === laptop, phone.length, laptop.length);
console.log("same hash:", hash("sha256", phone) === hash("sha256", laptop));
console.log("same after normalize:", hash("sha256", phone.normalize("NFKC")) === hash("sha256", laptop.normalize("NFKC")));
```

Output of `node normalize.js`

```ts
false 9 10
same hash: false
same after normalize: true
```

> NOTE
>
> OWASP's first choice today is **Argon2id**, a newer password hash that won the Password Hashing Competition. Node.js 24.7 and later include it as `crypto.argon2()`; before that it needed a package. bcrypt is older but still acceptable. scrypt with the parameters above is a sound, built-in choice. Whatever you pick, the rules are the same: a unique salt per password, a cost tuned so a hash takes around a hundred milliseconds on your server, and a stored format that records the parameters.

A few rules around the hash matter as much as the hash itself. Answer a failed login with the same message whether the e-mail exists or not ("invalid e-mail or password"). Limit login attempts per account and per IP address. And put a sensible maximum length on passwords (say 1,000 characters), so nobody can make your server hash a 10 MB password. The security course's [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication) lesson covers these in depth, and the ZudoJS lesson [Authentication](https://zudojs.oyinlola.site/learn/zudo-auth) packages them.

## Encryption with AES-256-GCM

Bank account numbers for seller payouts must be read back, so a hash is no use. You need **encryption**. The standard choice is **AES-256-GCM**:

- **AES** is the cipher, the most widely used and studied in the world. **256** is the key size in bits: a 32-byte key.
- **GCM** is the mode. It encrypts and also produces an **authentication tag**, a 16-byte MAC over the ciphertext. When you decrypt, a changed ciphertext or tag is detected and rejected. Encryption that includes this check is called **authenticated encryption**, and it is the only kind you should use.
- Every encryption needs a fresh 12-byte **nonce** (the IV). It is not secret and is stored with the ciphertext, but it must *never* repeat with the same key.

vault.jsNode.js only

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function loadKey(base64) {
  const key = Buffer.from(base64 ?? "", "base64");
  if (key.length !== 32) throw new Error(`encryption key must be 32 bytes, got ${key.length}`);
  return key;
}

export function encrypt(key, plaintext, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ciphertext].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

export function decrypt(key, sealed, context) {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== "v1") throw new Error(`unknown format ${version}`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
```

The `context` is **AAD** (additional authenticated data): text that is not encrypted, but is covered by the tag. Here it is the seller's id, which binds the ciphertext to its owner. Now use it, including the ways it should fail:

payouts.jsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, loadKey } from "./vault.js";

const key = loadKey(randomBytes(32).toString("base64"));

const sealed = encrypt(key, "0123456789 GTBank", "seller:17");
console.log("parts:", sealed.split(".").length, "contains the number:", sealed.includes("0123456789"));
console.log("again, different:", encrypt(key, "0123456789 GTBank", "seller:17") !== sealed);
console.log("decrypted:", decrypt(key, sealed, "seller:17"));

const bytes = Buffer.from(sealed.split(".")[3], "base64url");
bytes[0] ^= 1;
const tampered = sealed.split(".").slice(0, 3).concat(bytes.toString("base64url")).join(".");

const attempts = [
  ["one flipped bit", () => decrypt(key, tampered, "seller:17")],
  ["copied to another seller", () => decrypt(key, sealed, "seller:18")],
  ["wrong key", () => decrypt(loadKey(randomBytes(32).toString("base64")), sealed, "seller:17")],
  ["key from a bad env var", () => loadKey("c2hvcnQ=")],
];
for (const [label, attempt] of attempts) {
  try {
    attempt();
    console.log(label, "-> decrypted?!");
  } catch (error) {
    console.log(label, "->", error.message);
  }
}
```

Output of `node payouts.js`

```ts
parts: 4 contains the number: false
again, different: true
decrypted: 0123456789 GTBank
one flipped bit -> Unsupported state or unable to authenticate data
copied to another seller -> Unsupported state or unable to authenticate data
wrong key -> Unsupported state or unable to authenticate data
key from a bad env var -> encryption key must be 32 bytes, got 5
```

- The same plaintext encrypted twice gives different results, thanks to the random nonce. An attacker cannot even tell that two sellers use the same bank account.
- One flipped bit, a ciphertext copied into another seller's row, and the wrong key all fail in `decipher.final()` with the same message. GCM does not tell you *why*; it only guarantees you never get silently wrong data.
- In production, the key comes from an environment variable or a secret manager, as base64: `loadKey(process.env.PAYOUT_KEY)`. `loadKey` refuses to start with a missing or short key, the same "fail at startup" rule as in [What Node.js is](https://zudojs.oyinlola.site/learn/node-runtime#env). Make a key with `node -p "crypto.randomBytes(32).toString('base64')"`.
- The `v1.` prefix is a version. When you rotate keys, a `v2` can mean "new key", and old values still decrypt with the old key until they are re-encrypted.

### Never reuse a nonce

Why does the nonce matter so much? GCM encrypts by combining the plaintext with a stream of pseudo-random bytes made from the key and the nonce, using XOR (`^`, from [Operators](https://zudojs.oyinlola.site/learn/js-operators)). Same key and same nonce means the same stream. Then XOR-ing two ciphertexts cancels the stream out, and whoever knows one message learns the other, without the key:

nonce-reuse.jsNode.js only

```ts
import { createCipheriv, randomBytes } from "node:crypto";

const key = randomBytes(32);
const fixedIv = Buffer.alloc(12);

function badEncrypt(text) {
  const cipher = createCipheriv("aes-256-gcm", key, fixedIv);
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
}

const knownToAttacker = "PAY NGN 50000 TO ACCOUNT 0123456789";
const secret = "PAY NGN 90000 TO ACCOUNT 9876543210";
const c1 = badEncrypt(knownToAttacker);
const c2 = badEncrypt(secret);

const recovered = Buffer.alloc(c2.length);
for (let i = 0; i < c2.length; i++) recovered[i] = c1[i] ^ c2[i] ^ knownToAttacker.charCodeAt(i);
console.log(recovered.toString("utf8"));
```

Output of `node nonce-reuse.js`

```ts
PAY NGN 90000 TO ACCOUNT 9876543210
```

Worse, a repeated nonce also lets an attacker forge authentication tags. A random 12-byte nonce per message is safe for billions of messages with one key. A counter, a timestamp or a fixed value is not.

## Build: an account security toolkit

Now put the pieces behind one small module, the way a real service would. It handles all four problems from the start of the lesson: passwords, webhooks, bank account numbers and reset tokens. The webhook signature follows the pattern many providers use: the header carries a timestamp and an HMAC of `timestamp.body`, so an old request cannot be replayed:

security.jsNode.js only

```ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function signWebhook(secret, body, timestamp) {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function verifyWebhook(secret, rawBody, header, nowSeconds, seenIds, toleranceSeconds = 300) {
  const parts = Object.fromEntries((header ?? "").split(",").map((kv) => kv.split("=")));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return "rejected: malformed header";
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return "rejected: too old";

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(parts.v1, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return "rejected: bad signature";

  const event = JSON.parse(rawBody);
  if (seenIds.has(event.id)) return `ignored: ${event.id} already processed`;
  seenIds.add(event.id);
  return `accepted: ${event.type} ${event.id}`;
}

export function newResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, stored: createHash("sha256").update(token).digest("hex") };
}
```

demo.jsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { signWebhook, verifyWebhook, newResetToken } from "./security.js";

const secret = randomBytes(32);
const seen = new Set();
const now = 1_790_000_000;
const body = JSON.stringify({ id: "evt_1042", type: "charge.success", amount: 4_500_000 });
const header = signWebhook(secret, body, now);

const cases = [
  ["genuine", body, header, now + 5],
  ["provider retry", body, header, now + 30],
  ["replayed next week", body, header, now + 7 * 24 * 3600],
  ["amount changed", body.replace("4500000", "4500"), header, now + 5],
  ["forged with a guessed secret", body, signWebhook("password", body, now), now + 5],
  ["no header", body, undefined, now + 5],
];
for (const [label, rawBody, sig, at] of cases) {
  console.log(label.padEnd(29), verifyWebhook(secret, rawBody, sig, at, seen));
}

const { token, stored } = newResetToken();
console.log("reset link token is 43 characters:", token.length === 43, "stored hash is 64 hex:", /^[0-9a-f]{64}$/.test(stored));
```

Output of `node demo.js`

```ts
genuine                       accepted: charge.success evt_1042
provider retry                ignored: evt_1042 already processed
replayed next week            rejected: too old
amount changed                rejected: bad signature
forged with a guessed secret  rejected: bad signature
no header                     rejected: malformed header
reset link token is 43 characters: true stored hash is 64 hex: true
```

Each rejection has its own line of defence:

- The **retry** had a perfectly valid signature. Only the `seenIds` set stopped it from shipping the order twice. In a real service that set is a database table with a unique index on the event id.
- The **replay** was also correctly signed, a week ago. The signed timestamp made it detectable. The tolerance (5 minutes here) allows for small clock differences between servers.
- Changing the amount, or signing with a guessed secret, produced a different HMAC, compared in constant time.
- The malformed-header check comes first, so garbage input never reaches `JSON.parse`. The order matters: verify, *then* parse, *then* act.

With `passwords.js` and `vault.js` from above, you now have all four tools. [Cryptography with @zudojs/crypto](https://zudojs.oyinlola.site/learn/zudo-crypto) offers the same building blocks as a package, and [Cryptography for developers](https://zudojs.oyinlola.site/learn/sec-crypto) in the security course goes further, into key management and signatures with public keys.

## Failure cases, testing and production

### The mistakes that cause real breaches

- Passwords stored with SHA-256, MD5 or no salt. Use scrypt or Argon2id.
- Secrets compared with `===`. Use `timingSafeEqual` after a length check.
- Tokens made with `Math.random()` or from the time. Use `randomBytes`.
- Encryption without authentication (AES-CBC or AES-CTR on their own), or with a repeated nonce. Use AES-256-GCM with a random nonce per message.
- Webhooks verified on re-serialized JSON, or not at all, or processed twice.
- Keys in the source code or in Git. Load them from the environment, and never log them.
- Home-made algorithms. You are not expected to invent cryptography; nobody is. Combine the standard pieces exactly as shown, or use a well-reviewed library.

### Testing cryptographic code

You cannot eyeball whether encryption "looks random", so test behaviour instead:

- **Known answers.** Standards publish test vectors, like the HMAC one above. Your HMAC wrapper must reproduce them.
- **Round trips.** `decrypt(encrypt(x)) === x` for many inputs, including empty strings and emoji.
- **Every rejection.** For each check you wrote (tampered data, wrong key, wrong context, old timestamp, repeated event, wrong length), a test that it fails. The `payouts.js` and `demo.js` examples are exactly that.
- **Uniqueness.** Two encryptions of the same value differ; two hashes of the same password differ.
- **Speed of password hashing in tests.** The real cost makes tests slow. Pass lower parameters in tests only, and assert in a separate test that production uses the real ones.

### Production concerns

- **Key management.** Keep keys in a secret manager or the platform's environment settings, with access limited to the services that need them. Plan rotation from day one: a version prefix and the ability to decrypt with the previous key.
- **Re-hash passwords** when you raise the cost, at the next successful login.
- **Capacity.** Each login costs about 100 ms of CPU and 128 MiB of memory with the parameters above. Node.js's thread pool runs 4 of these at a time by default (the `UV_THREADPOOL_SIZE` environment variable changes it), so rate-limit login attempts and measure how many your server can handle.
- **Logging.** Never log passwords, tokens, keys, signatures or decrypted data. Log the event id and the result instead.
- **The browser.** Browsers have their own `crypto`: `crypto.getRandomValues()`, `crypto.randomUUID()` and the **Web Crypto API** in `crypto.subtle`, whose functions return promises. Node.js has the same API as `globalThis.crypto`, which helps when code must run in both. The test for this lesson uses it.

## Practice

TRY IT YOURSELF

### Re-hash when the cost goes up

Add a `needsRehash(stored)` function to the password module that returns `true` when a stored scrypt value used different parameters than the current `PARAMS`. Show it on a hash made with `N = 2 ** 15` and one made with the current parameters.

**Show a solution**

rehash.jsNode.js only

```ts
import { PARAMS, hashPassword } from "./passwords.js";

function needsRehash(stored) {
  const [, N, r, p] = stored.split("$").map(Number);
  return N !== PARAMS.N || r !== PARAMS.r || p !== PARAMS.p;
}

const old = "scrypt$32768$8$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";
console.log("old cost:", needsRehash(old));
console.log("current cost:", needsRehash(await hashPassword("correct horse battery staple")));
```

Output of `node rehash.js`

```ts
old cost: true
current cost: false
```

At login: `if (await verifyPassword(pw, stored) && needsRehash(stored)) save(await hashPassword(pw))`. Over time every active user moves to the new cost, without anyone having to reset a password.

TRY IT YOURSELF

### Verify a Paystack-style webhook

Some providers sign the raw body alone with HMAC-SHA512 and send the hex digest in a header, with no timestamp. Write `verifySha512(secret, rawBody, headerHex)` with a constant-time comparison, test it on a genuine body, a changed body and an empty header, and explain what protects you from replays in this scheme.

**Show a solution**

sha512-webhook.jsNode.js only

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function verifySha512(secret, rawBody, headerHex) {
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const received = Buffer.from(headerHex ?? "", "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const secret = randomBytes(32);
const body = '{"event":"charge.success","data":{"reference":"ORD-1042","amount":4500000}}';
const header = createHmac("sha512", secret).update(body).digest("hex");

console.log("genuine:", verifySha512(secret, body, header));
console.log("changed:", verifySha512(secret, body.replace("ORD-1042", "ORD-1043"), header));
console.log("empty header:", verifySha512(secret, body, ""));
```

Output of `node sha512-webhook.js`

```ts
genuine: true
changed: false
empty header: false
```

Without a signed timestamp, a recorded request stays valid forever. The only protection is idempotency: store each processed `reference` (or event id) with a unique constraint, and treat a repeat as "already done". Some providers also publish the IP addresses their webhooks come from, which is a useful extra filter.

TRY IT YOURSELF

### Rotate an encryption key

Write `decryptAny(keys, sealed, context)` that takes a map of key versions (`{ v1: oldKey, v2: newKey }`) and picks the key by the prefix, and `reencrypt` that moves a value from `v1` to `v2`. Use `encrypt` and `decrypt` from `vault.js`, replacing the `v1` label.

**Show a solution**

rotate.jsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "./vault.js";

const keys = { v1: randomBytes(32), v2: randomBytes(32) };
const CURRENT = "v2";

function seal(plaintext, context) {
  return encrypt(keys[CURRENT], plaintext, context).replace(/^v1\./, `${CURRENT}.`);
}

function decryptAny(sealed, context) {
  const [version] = sealed.split(".");
  if (!keys[version]) throw new Error(`no key for ${version}`);
  return decrypt(keys[version], sealed.replace(/^v\d+\./, "v1."), context);
}

const old = encrypt(keys.v1, "0123456789 GTBank", "seller:17");
const moved = seal(decryptAny(old, "seller:17"), "seller:17");
console.log(old.split(".")[0], "->", moved.split(".")[0]);
console.log(decryptAny(moved, "seller:17"));
```

Output of `node rotate.js`

```ts
v1 -> v2
0123456789 GTBank
```

Rotation is: add the new key, write everything new with it, re-encrypt old values in a background job, and only remove the old key when no `v1` values remain. In a real module the version would be a parameter of `encrypt` rather than a string replacement.

## Recap

- Unguessable values come from `randomBytes` (32 bytes for tokens), `randomInt` (codes, without modulo bias) and `randomUUID` (ids). Store hashes of tokens, not the tokens.
- SHA-256 fingerprints data and detects accidental changes. MD5 and SHA-1 are broken.
- HMAC proves a message came from someone with the key. Verify webhooks on the raw body, compare with `timingSafeEqual` after a length check, reject old timestamps and ignore repeated event ids.
- Passwords need a slow, salted, memory-hard hash: scrypt with N = 217, r = 8, p = 1 (raise `maxmem`), or Argon2id. Use the async version and a self-describing stored format.
- Data you must read back needs AES-256-GCM: a 32-byte key from the environment, a fresh 12-byte nonce every time, the tag checked on decrypt, and AAD to bind the data to its owner. A repeated nonce breaks it.
- Encoding (hex, base64) is not encryption, and hashing is not encryption.

Next, [npm and packages](https://zudojs.oyinlola.site/learn/npm-packages) brings other people's code into your project, and the lesson after it looks at how the npm ecosystem stays trustworthy, which uses the hashes and signatures you have just learned.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
