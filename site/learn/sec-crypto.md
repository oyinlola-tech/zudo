---
title: "Cryptography for developers — ZudoJS Academy"
description: "Choose between hashing, HMAC, encryption and signatures by the problem, sign and verify with Ed25519, run TLS locally, and manage and rotate keys safely."
source: https://zudojs.oyinlola.site/learn/sec-crypto
---

LEVEL 10 · LESSON 5 OF 6

Cryptography and trust Core

# Cryptography for developers

Choose between hashing, HMAC, encryption and signatures by the problem, sign and verify with Ed25519, run TLS locally, and manage and rotate keys safely.

- **55 min** to read and try
- **You need:** Cryptography with node:crypto, and Writing injection-safe code
- **You build:** Signed receipts that anyone can verify with a published public key, a key ring that rotates signing keys by key id, and a local TLS server whose client refuses certificates it should not trust

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Choose a hash, an HMAC, encryption or a signature from the security property a problem needs
- Sign and verify data with Ed25519 in node:crypto, and publish a public key as a JWK
- Explain symmetric and asymmetric cryptography, key exchange, and what TLS does during a handshake
- Run a local TLS server and test that the client refuses unknown certificates and wrong host names
- Keep secrets out of source code and rotate signing keys with key ids without breaking existing signatures

## Four messages, four different promises

Your shop sends and stores many kinds of data, and each one needs a different promise:

1. **Receipts.** Customers forward PDF receipts to their employers for expense claims. The employer wants to know that a receipt for ₦45,000 really came from your shop and was not edited to ₦145,000. The employer is not your partner and will never hold any of your secrets.
2. **Stock updates.** Your warehouse service tells your shop service "SKU RICE-5: 40 in stock" every minute. Both services are yours.
3. **Seller bank accounts.** You store account numbers and read them back to pay sellers.
4. **Everything in transit.** Customers type card details and passwords into your site over café Wi-Fi.

[Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto) gave you the tools for the second and third: HMAC with a shared key, AES-256-GCM for data you read back, plus secure random tokens, hashes and password hashing. This lesson adds what is left: **digital signatures** for the receipts, **TLS** for the café Wi-Fi, and the part that decides whether any of it stays secure over time: where keys live, and how you replace them.

First, though, the skill that matters most: looking at a problem and naming the right tool before writing any code. Most real cryptography bugs are not broken algorithms. They are the right algorithm used for the wrong job.

## Choose the tool by the promise you need

Cryptography offers a small set of guarantees. Name the one you need first:

- **Integrity**: the data has not changed.
- **Authenticity**: the data came from someone who holds a particular key.
- **Confidentiality**: only holders of a key can read the data.
- **Public verifiability**: anyone can check authenticity, without being able to create valid data themselves. (Lawyers call a related idea **non-repudiation**: the signer cannot later deny signing.)

Then the tool follows almost mechanically:

| You need | Tool | Keys | Shop example |
| --- | --- | --- | --- |
| Integrity against accidents only | Hash (SHA-256) | None | Checksum of a downloaded price list |
| Authenticity between parties who trust each other | HMAC-SHA256 | One shared secret | Warehouse to shop stock updates; payment webhooks |
| Confidentiality (plus integrity) | Authenticated encryption (AES-256-GCM) | One secret key | Stored bank account numbers |
| Public verifiability | Digital signature (Ed25519) | A private key to sign, a public key to verify | Receipts, software releases, tokens checked by other services |
| Confidentiality over a network with a stranger | Key exchange plus encryption, packaged as TLS | Key pairs and certificates | Every HTTPS request |
| Storing a password | Password hash (scrypt, Argon2id) | A salt per password (not secret) | User login |

REASON IT OUT

### Before you pick a tool

For the receipts, answer these before choosing anything:

- Who must be able to *create* a valid receipt?
- Who must be able to *check* one?
- Is any of the receipt secret? Does anything need to be read back by you later?
- If you used HMAC, what would the employer need in order to check a receipt, and what could they then do with it?

**Show the reasoning**

Only your shop may create receipts. Anyone the customer forwards it to must be able to check it: employers, auditors, the tax office, people you have never heard of. Nothing in it is secret (the customer already has it), so encryption is the wrong tool; the need is authenticity that strangers can verify.

HMAC fails here. To check an HMAC, the employer needs the same secret key you used to create it, and anyone who can check an HMAC can also create one. You would have to hand your signing secret to every employer in the country, and any of them could then issue receipts in your name. A digital signature separates the two abilities: a **private key** that only your shop holds creates signatures, and a **public key**, which you can publish on your website, only checks them.

> CODE REVIEW
>
> For every use of cryptography in a change, ask which promise it is meant to give (integrity, authenticity, confidentiality, public verifiability) and check that the tool gives exactly that one. Base64 and hashes are never "encryption".

## Symmetric and asymmetric cryptography

HMAC and AES are **symmetric**: the same key does both jobs (create and check, encrypt and decrypt). Symmetric algorithms are very fast, and their keys are just 32 random bytes. Their weakness is **key distribution**: both sides need the same secret, so you need a safe way to get it to them, and every holder can do everything.

**Asymmetric** (or **public-key**) cryptography uses a **key pair**: two keys that are mathematically linked, where the public one can be derived from the private one but not the other way round. Each key does half of the work:

|  | Symmetric | Asymmetric |
| --- | --- | --- |
| Keys | One shared secret | A private key (kept secret) and a public key (shared freely) |
| Authenticity | HMAC: every key holder can create and check | Signature: private key signs, public key verifies |
| Confidentiality | AES-GCM: every key holder can encrypt and decrypt | Key exchange (X25519) to agree on a symmetric key, then AES-GCM |
| Speed | Very fast | Much slower, so it is used for small things: signatures and agreeing on keys |
| Hard part | Getting the shared key to the other side safely | Knowing that a public key really belongs to who you think (certificates) |

In practice the two work together. Asymmetric cryptography solves the "how do strangers agree on a secret" problem, then fast symmetric cryptography protects the actual data. This combination is called **hybrid encryption**, and TLS is the best-known example.

### Agreeing on a key with a stranger

A **key exchange** lets two parties who have never met compute the same secret while an eavesdropper who sees everything they send cannot. With **X25519**, each side makes a key pair and sends only its public key; combining your own private key with the other side's public key gives both sides the same result. That shared secret then goes through a **key derivation function** (HKDF) to produce a proper encryption key:

key-exchange.jsNode.js only

```ts
import { diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";

const shop = generateKeyPairSync("x25519");
const customer = generateKeyPairSync("x25519");

// Only the public keys travel over the network.
const shopSecret = diffieHellman({ privateKey: shop.privateKey, publicKey: customer.publicKey });
const customerSecret = diffieHellman({ privateKey: customer.privateKey, publicKey: shop.publicKey });
console.log("same shared secret:", shopSecret.equals(customerSecret), `(${shopSecret.length} bytes)`);

const deriveKey = (secret) => Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "shop session v1", 32));
console.log("same AES-256 key:", deriveKey(shopSecret).equals(deriveKey(customerSecret)));

const outsider = generateKeyPairSync("x25519");
const outsiderGuess = diffieHellman({ privateKey: outsider.privateKey, publicKey: shop.publicKey });
console.log("outsider gets the same secret:", outsiderGuess.equals(shopSecret));
```

Output of `node key-exchange.js`

```ts
same shared secret: true (32 bytes)
same AES-256 key: true
outsider gets the same secret: false
```

The label `"shop session v1"` in HKDF binds the derived key to one purpose. Deriving a different label from the same shared secret gives an unrelated key, so one secret can safely produce separate keys for separate jobs.

There is a catch that the example also hints at: the outsider made their own key pair and computed *a* shared secret with the shop. If they could stand between the customer and the shop and swap the public keys in transit, each side would unknowingly agree on a key with the outsider (a **man-in-the-middle**). Key exchange alone does not tell you *who* you agreed with. That is what signatures and certificates add, as you will see in the TLS section.

> CODE REVIEW
>
> Never use a raw key-exchange result directly as an encryption key; derive keys with HKDF and a purpose label. And look for what authenticates the other side's public key: without it, a key exchange is open to a man-in-the-middle.

## Digital signatures with Ed25519

**Ed25519** is a modern signature algorithm: small keys (32 bytes), small signatures (64 bytes), fast, and designed so that common implementation mistakes are hard to make. It is the default choice for new systems. (You will also meet RSA and ECDSA, mostly for compatibility with older systems.) In `node:crypto` you generate a key pair once, sign with `sign(null, data, privateKey)` and check with `verify(null, data, publicKey, signature)`. The `null` means "no separate hash algorithm": Ed25519 has its own built in.

ed25519-basics.jsNode.js only

```ts
import { generateKeyPairSync, sign, verify } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const receipt = Buffer.from("Receipt R-7731: 2 x Rice 5kg, total ₦45,000, paid 2026-09-24");

const signature = sign(null, receipt, privateKey);
console.log("signature bytes:", signature.length);
console.log("genuine receipt verifies:", verify(null, receipt, publicKey, signature));

const edited = Buffer.from(receipt.toString().replace("₦45,000", "₦145,000"));
console.log("edited receipt verifies:", verify(null, edited, publicKey, signature));

try {
  sign(null, receipt, publicKey);
} catch (error) {
  console.log("signing with the public key:", error.code);
}
```

Output of `node ed25519-basics.js`

```ts
signature bytes: 64
genuine receipt verifies: true
edited receipt verifies: false
signing with the public key: ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE
```

The last line is the property that makes signatures useful. The employer holds only the public key, and a public key cannot sign. Changing a single character of the receipt makes verification fail.

### Signing structured data

A signature covers **bytes**, not objects. As with webhooks in [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#hmac), two JSON texts with the same meaning (different spacing, different key order) are different bytes. The safe design is to sign the exact bytes you send, and send them unchanged: here, the JSON text encoded as base64url, next to the signature. The verifier checks the signature on those bytes first, and only then parses them:

receipts.js

```ts
import { sign, verify } from "node:crypto";

export function signReceipt(receipt, privateKey) {
  const payload = Buffer.from(JSON.stringify(receipt));
  return {
    payload: payload.toString("base64url"),
    signature: sign(null, payload, privateKey).toString("base64url"),
  };
}

/** Returns the receipt if the signature is valid, otherwise null. */
export function verifyReceipt(envelope, publicKey) {
  if (typeof envelope?.payload !== "string" || typeof envelope?.signature !== "string") return null;
  const payload = Buffer.from(envelope.payload, "base64url");
  const signature = Buffer.from(envelope.signature, "base64url");
  if (signature.length !== 64) return null;
  if (!verify(null, payload, publicKey, signature)) return null;
  return JSON.parse(payload.toString("utf8"));
}
```

Test it with every way a receipt can be wrong: changed content, a signature from a different key, a truncated signature and a missing field. Each is a well-formed-looking envelope that must be refused:

receipts-test.jsNode.js only

```ts
import { generateKeyPairSync } from "node:crypto";
import { signReceipt, verifyReceipt } from "./receipts.js";

const shopKeys = generateKeyPairSync("ed25519");
const otherKeys = generateKeyPairSync("ed25519");
const receipt = { id: "R-7731", totalKobo: 4_500_000, paidAt: "2026-09-24T10:15:00Z" };
const envelope = signReceipt(receipt, shopKeys.privateKey);

const editedPayload = Buffer.from(JSON.stringify({ ...receipt, totalKobo: 14_500_000 })).toString("base64url");
const cases = [
  ["genuine", envelope],
  ["edited total", { ...envelope, payload: editedPayload }],
  ["other key", signReceipt(receipt, otherKeys.privateKey)],
  ["short signature", { ...envelope, signature: envelope.signature.slice(0, 40) }],
  ["no signature", { payload: envelope.payload }],
];
for (const [label, candidate] of cases) {
  console.log(label.padEnd(16), JSON.stringify(verifyReceipt(candidate, shopKeys.publicKey)));
}
```

Output of `node receipts-test.js`

```ts
genuine          {"id":"R-7731","totalKobo":4500000,"paidAt":"2026-09-24T10:15:00Z"}
edited total     null
other key        null
short signature  null
no signature     null
```

Ed25519 signatures are **deterministic**: the same key and the same bytes always give the same signature, so there is no random nonce to get wrong (a real source of breaches in older ECDSA code). The `verifyReceipt` function also never parses JSON it has not verified, so a forged envelope cannot even reach `JSON.parse`.

### Publishing the public key

The employer needs your public key. Publish it in a standard format: a **JWK** (JSON Web Key) is a small JSON object describing one key, and a list of them served at a well-known URL is a **JWKS**. Exporting never includes private material from a public key:

jwk.jsNode.js only

```ts
import { createPublicKey, generateKeyPairSync } from "node:crypto";

const { publicKey } = generateKeyPairSync("ed25519");
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "receipts-2026-09", use: "sig", alg: "EdDSA" };
console.log(Object.keys(jwk));
console.log(jwk.kty, jwk.crv, "x is", Buffer.from(jwk.x, "base64url").length, "bytes");

const imported = createPublicKey({ key: jwk, format: "jwk" });
console.log(imported.type, imported.asymmetricKeyType, imported.equals(publicKey));
```

Output of `node jwk.js`

```json
[ 'crv', 'x', 'kty', 'kid', 'use', 'alg' ]
OKP Ed25519 x is 32 bytes
public ed25519 true
```

The `kid` (key id) names the key. It becomes important as soon as you have more than one, which happens the day you rotate keys.

### Testing against published vectors

You cannot tell by looking whether signing code is correct, but standards publish **test vectors**: fixed keys, messages and the exact expected output. RFC 8032, which defines Ed25519, gives this one for an empty message. A correct implementation must reproduce it byte for byte:

ed25519-vector.jsNode.js only

```ts
import { createPrivateKey, sign } from "node:crypto";

const hex = (h) => Buffer.from(h, "hex").toString("base64url");
const privateKey = createPrivateKey({
  format: "jwk",
  key: {
    kty: "OKP",
    crv: "Ed25519",
    d: hex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"),
    x: hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"),
  },
});
const expected =
  "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";
console.log("RFC 8032 test 1:", sign(null, Buffer.alloc(0), privateKey).toString("hex") === expected);
```

Output of `node ed25519-vector.js`

```ts
RFC 8032 test 1: true
```

> CODE REVIEW
>
> Signed data should be verified on the exact bytes that were signed, before parsing. The verifier should accept exactly one algorithm per key (never let the message choose it), check the signature length, and have tests for tampered data, a wrong key and malformed input.

## TLS and HTTPS

**TLS** (Transport Layer Security) is the protocol that puts the S in HTTPS. On the café Wi-Fi, anyone on the same network can see and change unprotected traffic. TLS gives every connection three promises: **confidentiality** (nobody else can read it), **integrity** (nobody can change it unnoticed) and **server authentication** (you are talking to the real `shop.example`, not someone pretending).

It combines everything in this lesson. Here is a simplified TLS 1.3 handshake:

```ts
 browser                                              shop.example
    │  ClientHello: versions, ciphers, key share (X25519 public key)  ──►  │
    │                                                                      │
    │  ◄──  ServerHello: chosen cipher, key share (X25519 public key)      │
    │       both sides now derive the same keys (key exchange + HKDF)      │
    │  ◄──  Certificate: "this public key belongs to shop.example",        │
    │       signed by a certificate authority                              │
    │  ◄──  CertificateVerify: a signature over the handshake so far,      │
    │       made with the certificate's private key                        │
    │  ◄──  Finished                                                       │
    │  Finished  ──►                                                       │
    │  HTTP requests and responses, encrypted with AES-GCM or ChaCha20  ◄─►│
```

Key exchange agrees on keys, the certificate and the signature prove who is on the other end, and symmetric encryption protects the data.

The **certificate** is the answer to the man-in-the-middle problem from the key-exchange section. It is a small signed document that says "this public key belongs to `shop.example`, valid until this date". The signer is a **certificate authority** (CA), an organisation your browser or operating system already trusts. Certificates can form a chain (the CA signs an intermediate, which signs your certificate), and the client follows the chain up to a CA in its **trust store**. The client then checks two more things: the certificate is currently valid, and the name in it matches the host it wanted to reach.

### A TLS server on your own computer

To try TLS locally you need a certificate for `localhost`. No public CA will issue one, so you make a **self-signed** certificate: one signed by its own key. On your computer you would normally use a tool such as `mkcert` (which also installs a local CA that your browser trusts) or `openssl`. So that this example runs anywhere without extra tools, the helper below builds a minimal certificate with `node:crypto`. You do not need to follow the byte-level details; read the field list, because it is exactly what a certificate contains:

test-cert.js

```ts
// Builds a short-lived self-signed Ed25519 certificate for local tests only.
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";

function der(tag, ...parts) {
  const body = Buffer.concat(parts);
  const length = body.length < 0x80 ? [body.length]
    : body.length < 0x100 ? [0x81, body.length] : [0x82, body.length >> 8, body.length & 0xff];
  return Buffer.concat([Buffer.from([tag, ...length]), body]);
}
const sequence = (...parts) => der(0x30, ...parts);
const ED25519 = sequence(Buffer.from("06032b6570", "hex"));
const commonName = (name) =>
  sequence(der(0x31, sequence(Buffer.from("0603550403", "hex"), der(0x0c, Buffer.from(name)))));
const time = (date) => der(0x18, Buffer.from(date.toISOString().replace(/[-:T]|\.\d+/g, "")));

export function selfSignedCertificate(hostname, validDays = 1) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const now = new Date();
  const fields = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),                        // format: X.509 version 3
    der(0x02, Buffer.concat([Buffer.from([1]), randomBytes(15)])), // serial number
    ED25519,                                                       // signature algorithm
    commonName(hostname),                                          // issuer (itself)
    sequence(time(now), time(new Date(now.getTime() + validDays * 86_400_000))), // validity
    commonName(hostname),                                          // subject
    publicKey.export({ format: "der", type: "spki" }),             // the public key
    der(0xa3, sequence(sequence(Buffer.from("0603551d11", "hex"),  // subject alternative name:
      der(0x04, sequence(der(0x82, Buffer.from(hostname))))))),    //   the host name it is valid for
  );
  const certificate = sequence(fields, ED25519, der(0x03, Buffer.from([0]), sign(null, fields, privateKey)));
  const base64 = certificate.toString("base64").match(/.{1,64}/g).join("\n");
  return {
    cert: `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`,
    key: privateKey.export({ format: "pem", type: "pkcs8" }),
  };
}
```

A certificate is fields plus a signature over them. Node.js can read any certificate with `X509Certificate`, which is also how you would inspect one from a real server:

inspect-cert.jsNode.js only

```ts
import { X509Certificate } from "node:crypto";
import { selfSignedCertificate } from "./test-cert.js";

const { cert } = selfSignedCertificate("localhost");
const x509 = new X509Certificate(cert);
console.log("subject:", x509.subject);
console.log("issuer: ", x509.issuer);
console.log("names:  ", x509.subjectAltName);
console.log("key:    ", x509.publicKey.asymmetricKeyType);
console.log("self-signed:", x509.verify(x509.publicKey));
console.log("valid for localhost:", x509.checkHost("localhost") !== undefined);
console.log("valid for shop.example:", x509.checkHost("shop.example") !== undefined);
```

Output of `node inspect-cert.js`

```ts
subject: CN=localhost
issuer:  CN=localhost
names:   DNS:localhost
key:     ed25519
self-signed: true
valid for localhost: true
valid for shop.example: false
```

Now the real test. A `node:tls` server uses the certificate and its private key. The client connects four times. Only the first connection is configured correctly: it trusts exactly this certificate (the `ca` option) and asks for `localhost`. The other three are the situations a TLS client must refuse, and the test proves that it does:

tls-demo.jsNode.js only

```ts
import { once } from "node:events";
import { connect, createServer } from "node:tls";
import { selfSignedCertificate } from "./test-cert.js";

const { cert, key } = selfSignedCertificate("localhost");
const server = createServer({ cert, key, minVersion: "TLSv1.3" }, (socket) => socket.end("order ORD-1042 confirmed\n"));
server.listen(0, "127.0.0.1");
await once(server, "listening");

function request(options) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: server.address().port, ...options }, () => {
      let body = "";
      socket.on("data", (chunk) => (body += chunk));
      socket.on("end", () => resolve(`${socket.getProtocol()} ${socket.getCipher().name}: ${body.trim()}`));
    });
    socket.on("error", (error) => resolve(`refused (${error.code})`));
  });
}

console.log("trusted cert, right name: ", await request({ servername: "localhost", ca: cert }));
console.log("cert not trusted:         ", await request({ servername: "localhost" }));
console.log("trusted cert, wrong name: ", await request({ servername: "shop.example", ca: cert }));
console.log("same name, different key: ", await request({ servername: "localhost", ca: selfSignedCertificate("localhost").cert }));
server.close();
```

Output of `node tls-demo.js`

```ts
trusted cert, right name:  TLSv1.3 TLS_AES_256_GCM_SHA384: order ORD-1042 confirmed
cert not trusted:          refused (DEPTH_ZERO_SELF_SIGNED_CERT)
trusted cert, wrong name:  refused (ERR_TLS_CERT_ALTNAME_INVALID)
same name, different key:  refused (DEPTH_ZERO_SELF_SIGNED_CERT)
```

- The first connection negotiated TLS 1.3 and an AES-256-GCM cipher suite, all from the defaults: you did not choose any algorithms.
- Without `ca`, the client uses the normal trust store, which does not contain this self-signed certificate, so it refuses.
- With the right certificate but the wrong name, it refuses too: a valid certificate for another host proves nothing about this one.
- A different certificate with the same name but a different key is refused. This is exactly the man-in-the-middle case: someone can make their own certificate that says "localhost", but they cannot make one your client trusts.

> NEVER SWITCH VERIFICATION OFF
>
> When a certificate error appears in development, the tempting fix is `rejectUnauthorized: false` or the environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0`. Both make the client accept any certificate from anyone, which removes server authentication entirely, and they have a habit of reaching production. The correct fix is to trust the specific certificate or local CA you use for development (the `ca` option, or `NODE_EXTRA_CA_CERTS`), as the first connection above does.

### HTTPS in production

- Public sites get certificates from a CA such as Let's Encrypt through the **ACME** protocol, which renews them automatically. Certificates are short-lived on purpose, so renewal must be automated and monitored.
- TLS is often **terminated** at a load balancer or reverse proxy, which decrypts and forwards plain HTTP to your Node.js process. Then the network behind it must be trusted, or you use TLS again for the internal hop. Between your own services, **mutual TLS** (mTLS), where the client also presents a certificate, authenticates both sides.
- Send `Strict-Transport-Security` so browsers never try plain HTTP again (see [Security headers, HSTS and CSP](https://zudojs.oyinlola.site/learn/zudo-security#headers)), and redirect port 80 to 443.
- Allow only TLS 1.2 and 1.3. Node.js's defaults are already sensible; avoid overriding cipher lists unless you have a specific reason.

> CODE REVIEW
>
> Search for `rejectUnauthorized`, `NODE_TLS_REJECT_UNAUTHORIZED`, `checkServerIdentity` and `http://` URLs to other services. Each one needs a reason, and "it made the error go away" is not one.

## Secrets management

Every tool in this lesson rests on keys staying secret: HMAC secrets, AES keys, private signing keys, TLS private keys, database passwords, API keys. The algorithms will not break; key handling does. The rules:

### Never in source code, never in Git

A secret committed to a repository is copied to every clone, every fork, every CI runner and every backup, and it stays in the history even after you delete the line. Automated scanners watch public repositories for keys and find them within minutes. Keep secrets out from the start:

- Code reads secrets from the **environment**. Your hosting platform, container orchestrator or CI system injects them at runtime.
- For local development, a `.env` file holds your own development values and is listed in `.gitignore`. A committed `.env.example` documents the variable names with placeholder values.
- Turn on **secret scanning** (GitHub push protection, or tools such as gitleaks in a pre-commit hook and in CI), so a key is caught before it is pushed.

```ts
# .env.example: copy to .env and fill in your own development values. .env is in .gitignore.
PAYMENT_WEBHOOK_SECRET=
RECEIPT_SIGNING_KEY_ID=receipts-dev
DATABASE_URL=postgres://localhost:5432/shop_dev
```

Node.js reads `.env` files itself with `node --env-file=.env app.js` or `process.loadEnvFile()`, and `util.parseEnv` parses the format. Whatever the source, validate at startup and report names, not values:

config-check.jsNode.js only

```ts
import { parseEnv } from "node:util";

const REQUIRED = {
  PAYMENT_WEBHOOK_SECRET: (v) => /^[A-Za-z0-9_-]{43,}$/.test(v),
  RECEIPT_SIGNING_KEY_ID: (v) => /^receipts-[a-z0-9-]+$/.test(v),
  DATABASE_URL: (v) => v.startsWith("postgres://"),
};

function checkConfig(env) {
  const problems = Object.entries(REQUIRED)
    .filter(([name, isValid]) => env[name] === undefined || !isValid(env[name]))
    .map(([name]) => name);
  return problems.length === 0 ? "config ok" : `missing or invalid: ${problems.join(", ")}`;
}

const fromExampleFile = parseEnv("PAYMENT_WEBHOOK_SECRET=\nRECEIPT_SIGNING_KEY_ID=receipts-dev\n");
console.log(checkConfig(fromExampleFile));

const filledIn = { ...fromExampleFile, PAYMENT_WEBHOOK_SECRET: "x".repeat(43), DATABASE_URL: "postgres://localhost:5432/shop_dev" };
console.log(checkConfig(filledIn));
```

Output of `node config-check.js`

```ts
missing or invalid: PAYMENT_WEBHOOK_SECRET, DATABASE_URL
config ok
```

An empty placeholder copied from `.env.example` fails the check, so the service refuses to start instead of signing webhooks with an empty key. [Types are not security](https://zudojs.oyinlola.site/learn/ts-security#secrets) shows the next step: wrapping each secret in a type that cannot be logged by accident.

### Secret stores

Environment variables are a delivery mechanism, not a vault: they are visible to the whole process, often to crash reports, and to anyone who can inspect the running container. For production, keep the source of truth in a **secret store** (HashiCorp Vault, AWS Secrets Manager, Google Secret Manager, Azure Key Vault, or your platform's equivalent). A store gives you access control per service, an audit log of who read what, and versioned secrets, which is what makes rotation practical.

The strongest option for private keys is to never have them in your application at all. A **KMS** (key management service) or **HSM** (hardware security module) keeps the key inside itself and signs or decrypts on request. For large data, services use **envelope encryption**: each record is encrypted with its own random data key (AES-256-GCM, as in node-crypto), and only the small data key is encrypted by the KMS. Leaking the database then reveals nothing without access to the KMS.

### Least privilege and separation

- Each service gets only the secrets it uses. The receipts service needs the signing key; the web front end does not.
- Development, staging and production use different secrets. A staging leak must not open production.
- One key, one purpose. Do not reuse the webhook HMAC secret as a cookie-signing key; derive separate keys with HKDF labels if they must come from one master secret.

> CODE REVIEW
>
> Look for string literals that look like keys, `.env` files in the diff, secrets passed on command lines (visible in process lists), secrets in log statements, and the same secret name used for two purposes.

## Key rotation with key ids

**Key rotation** means replacing a key with a new one. You rotate on a schedule (so a key that leaked unnoticed stops working eventually), when someone with access leaves, and immediately when a key may have leaked. Rotation is only painless if you planned for it on day one, and the plan has one central idea: every signature or ciphertext says **which key** made it, with a key id.

For signed receipts, the rotation goes through phases so that nothing breaks:

1. **Add** the new key pair and publish its public key. Keep signing with the old one. Verifiers learn the new key before they ever see it used.
2. **Switch** signing to the new key. Old receipts still verify, because the old public key is still published.
3. **Retire** the old key once nothing signed with it needs to verify any more (for short-lived tokens, after their maximum lifetime; for receipts that must verify for years, perhaps never: you stop signing with it but keep its public key published).

Here is a small key ring that follows those phases. It signs with whichever key is marked active and verifies by the `kid` in the envelope:

keyring.js

```ts
import { generateKeyPairSync, sign, verify } from "node:crypto";

export function createKeyRing() {
  const keys = new Map(); // kid -> { publicKey, privateKey }
  let activeKid = null;

  return {
    add(kid) {
      if (keys.has(kid)) throw new Error(`duplicate key id ${kid}`);
      keys.set(kid, generateKeyPairSync("ed25519"));
    },
    activate(kid) {
      if (!keys.has(kid)) throw new Error(`unknown key id ${kid}`);
      activeKid = kid;
    },
    retire(kid) {
      if (kid === activeKid) throw new Error("cannot retire the active key");
      keys.delete(kid);
    },
    publishedKids: () => [...keys.keys()],
    sign(data) {
      const payload = Buffer.from(JSON.stringify(data));
      const signature = sign(null, payload, keys.get(activeKid).privateKey);
      return { kid: activeKid, payload: payload.toString("base64url"), signature: signature.toString("base64url") };
    },
    verify(envelope) {
      const key = keys.get(envelope.kid);
      if (key === undefined) return { ok: false, reason: "unknown key id" };
      const payload = Buffer.from(envelope.payload, "base64url");
      const valid = verify(null, payload, key.publicKey, Buffer.from(envelope.signature, "base64url"));
      return valid ? { ok: true, data: JSON.parse(payload.toString("utf8")) } : { ok: false, reason: "bad signature" };
    },
  };
}
```

Walk a receipt signed with the old key through all three phases:

rotation-demo.jsNode.js only

```ts
import { createKeyRing } from "./keyring.js";

const ring = createKeyRing();
ring.add("receipts-2026-03");
ring.activate("receipts-2026-03");
const oldReceipt = ring.sign({ id: "R-7731", totalKobo: 4_500_000 });

ring.add("receipts-2026-09");
console.log("1. added:    ", ring.publishedKids(), "old receipt:", ring.verify(oldReceipt).ok);

ring.activate("receipts-2026-09");
const newReceipt = ring.sign({ id: "R-8802", totalKobo: 1_250_000 });
console.log("2. switched: ", newReceipt.kid, "old receipt:", ring.verify(oldReceipt).ok, "new receipt:", ring.verify(newReceipt).ok);

ring.retire("receipts-2026-03");
console.log("3. retired:  ", ring.publishedKids(), "old receipt:", ring.verify(oldReceipt));

console.log("made-up kid: ", ring.verify({ ...newReceipt, kid: "receipts-1999" }));
console.log("wrong kid:   ", ring.verify({ ...oldReceipt, kid: "receipts-2026-09" }));
```

Output of `node rotation-demo.js`

```ts
1. added:     [ 'receipts-2026-03', 'receipts-2026-09' ] old receipt: true
2. switched:  receipts-2026-09 old receipt: true new receipt: true
3. retired:   [ 'receipts-2026-09' ] old receipt: { ok: false, reason: 'unknown key id' }
made-up kid:  { ok: false, reason: 'unknown key id' }
wrong kid:    { ok: false, reason: 'bad signature' }
```

- Between phases 1 and 2, both receipts verify: nobody was affected by the rotation.
- After retirement, the old receipt is refused with a clear reason. For tokens that is the point of rotation; for receipts you would keep the old public key.
- The `kid` only *selects* among keys the verifier already trusts. An unknown kid is refused, and a kid pointing at the wrong key fails the signature check. The verifier never loads a key named by the message itself, and never lets the message choose the algorithm.

The same idea works for every key type. An HMAC webhook secret gets a version in its header so old and new secrets both verify during the overlap. Encrypted values carry a version prefix so they can be decrypted with the old key and re-encrypted with the new one, as in the `v1.` exercise of [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#practice). Passwords are the exception: you cannot re-hash without the password, so you upgrade each hash at the user's next login.

### When a key has leaked

Treat a leak as an incident. Order matters: **first** create and activate a new key and revoke the leaked one at its source (the payment provider, the CA, the secret store), so it stops working; **then** find out how it leaked and what it was used for, using the audit logs; **then** clean up (remove it from history, rotate anything that shared its storage). Deleting the file from Git without rotating does nothing: the key is already copied.

> CODE REVIEW
>
> Every signature, token and ciphertext format should carry a key id or version. Verification should look keys up by id from a trusted set and refuse unknown ids. Ask how the key in this change would be rotated, and whether that has ever been practised.

## Failure cases and testing

The mistakes that cause real incidents, and the defence for each:

| Mistake | Defence |
| --- | --- |
| Using HMAC where outsiders must verify, and handing out the secret | Signatures: private key to sign, public key to verify |
| Letting the message pick the algorithm or the key | One fixed algorithm per key; keys chosen by id from a trusted set |
| Verifying after parsing and re-serialising | Verify the exact received bytes, then parse |
| Turning off certificate verification | Trust the specific development CA instead |
| Keys in code, in Git, in logs, on command lines | Environment or secret store, validated at startup, typed as secrets |
| No way to rotate | Key ids from day one, overlap phases, practised rotation |
| Home-made constructions | Standard algorithms (Ed25519, X25519, HKDF, AES-GCM, TLS) through `node:crypto` or a well-reviewed library |

And the tests that catch them, each shown in this lesson or in node-crypto:

- **Known-answer tests** against published vectors (the RFC 8032 check).
- **Round trips**: sign then verify, encrypt then decrypt.
- **Every rejection**: edited data, wrong key, truncated signature, missing field, unknown kid, untrusted certificate, wrong host name.
- **Rotation**: a value from the old key verifies during the overlap and is refused after retirement.
- **Configuration**: the service refuses to start with a missing or placeholder secret.

## A code-review checklist

| Look for | Ask |
| --- | --- |
| Any cryptographic call | Which promise is it for, and does this tool give exactly that? |
| Key exchange | Is the other side's public key authenticated (certificate, signature, pinned key)? Is the result passed through HKDF with a purpose label? |
| Signatures | Verified on the exact signed bytes before parsing? Fixed algorithm? Length checked? Tests for tampering and wrong keys? |
| TLS options | Any `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED`, custom `checkServerIdentity`, or plain `http://` to another service? |
| Secrets | From the environment or a secret store? Validated at startup? Absent from Git, logs, errors and command lines? One purpose each? |
| Formats | Does every signed or encrypted value carry a key id or version? Can the key be rotated without downtime? |

## In production

- **Prefer managed keys.** Put private signing keys in a KMS or HSM when you can, so application servers never hold them.
- **Automate certificates.** ACME renewal with monitoring and alerts well before expiry. An expired certificate is an outage.
- **Publish keys properly.** Serve a JWKS with `kid`s, with caching headers, so verifiers can pick up new keys before you start using them.
- **Keep libraries current.** Node.js bundles OpenSSL; security releases of Node.js often contain OpenSSL fixes. Stay on a supported release line.
- **Plan for new algorithms.** Designing formats with key ids and explicit versions ("crypto agility") also lets you move to new algorithms. Modern browsers already use hybrid post-quantum key exchange in TLS 1.3, and signature algorithms will follow.
- **Use the framework.** [Authentication with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-auth) signs and verifies tokens with @zudojs/auth and @zudojs/crypto; the ideas in this lesson are what those packages do underneath.

## Practice

TRY IT YOURSELF

### Pick the tool

For each situation, name the promise needed and the tool: (a) a mobile app caches the product catalogue and must notice if the cached file was corrupted on disk; (b) your shop sends delivery partners a daily manifest, and partners must be sure it came from you, but you do not want partners to be able to create manifests; (c) you store customers' dates of birth and must show them on the profile page; (d) two of your own services call each other inside your network.

**Show a solution**

- (a) Integrity against accidents: a SHA-256 checksum stored with the file. No key, because the threat is corruption, not an attacker.
- (b) Public verifiability: an Ed25519 signature with a `kid`, with your public keys published as a JWKS. HMAC would let every partner forge manifests.
- (c) Confidentiality with read-back: AES-256-GCM with a random nonce per value, the key from a secret store, and a version prefix for rotation. Hashing would make it unreadable; encoding would protect nothing.
- (d) Authenticity and confidentiality in transit between parties you control: mutual TLS, or TLS plus an HMAC-signed or signed token per request. "Inside the network" is not a reason to skip it: one compromised machine could otherwise read and change everything.

TRY IT YOURSELF

### Sign with a timestamp and a purpose

A signature made for a receipt must not be accepted as, say, a refund approval, even if someone copies the payload across. Extend `signReceipt`/`verifyReceipt` so the signed bytes include a `purpose` (`"receipt"`) and `verify` refuses any other purpose. Show that a correctly signed `"refund-approval"` envelope is refused by the receipt verifier.

**Show a solution**

purpose.jsNode.js only

```ts
import { generateKeyPairSync, sign, verify } from "node:crypto";

function signFor(purpose, data, privateKey) {
  const payload = Buffer.from(JSON.stringify({ purpose, data }));
  return { payload: payload.toString("base64url"), signature: sign(null, payload, privateKey).toString("base64url") };
}

function verifyFor(purpose, envelope, publicKey) {
  const payload = Buffer.from(envelope.payload, "base64url");
  if (!verify(null, payload, publicKey, Buffer.from(envelope.signature, "base64url"))) return "bad signature";
  const message = JSON.parse(payload.toString("utf8"));
  return message.purpose === purpose ? message.data : `wrong purpose: ${message.purpose}`;
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const receipt = signFor("receipt", { id: "R-7731", totalKobo: 4_500_000 }, privateKey);
const approval = signFor("refund-approval", { id: "R-7731", totalKobo: 4_500_000 }, privateKey);

console.log(verifyFor("receipt", receipt, publicKey));
console.log(verifyFor("receipt", approval, publicKey));
```

Output of `node purpose.js`

```json
{ id: 'R-7731', totalKobo: 4500000 }
wrong purpose: refund-approval
```

Both signatures are valid; only the purpose inside the signed bytes tells them apart. Putting the purpose (and often an issuer, an audience and an expiry) *inside* what is signed is called **domain separation**. JWTs do the same with their `aud`, `iss` and `exp` claims. Using separate keys per purpose is an even stronger version of the same idea.

TRY IT YOURSELF

### An HMAC key ring for webhooks

Your stock updates are signed with HMAC-SHA256, and the header looks like `v1=<hex>`. Write `verifyStock(secrets, rawBody, header)` where `secrets` is an object such as `{ v1: oldSecret, v2: newSecret }`. Pick the secret by the version prefix, compare in constant time, and refuse unknown versions. Show that during a rotation both versions verify, and that an unknown version is refused.

**Show a solution**

hmac-ring.jsNode.js only

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function verifyStock(secrets, rawBody, header) {
  const match = /^(v\d+)=([0-9a-f]{64})$/.exec(header ?? "");
  if (!match) return "malformed header";
  const secret = Object.hasOwn(secrets, match[1]) ? secrets[match[1]] : undefined;
  if (secret === undefined) return "unknown version";
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(match[2], "hex")) ? "ok" : "bad signature";
}

const secrets = { v1: randomBytes(32), v2: randomBytes(32) };
const body = '{"sku":"RICE-5","inStock":40}';
const signWith = (version) => `${version}=${createHmac("sha256", secrets[version]).update(body).digest("hex")}`;

console.log("old secret:", verifyStock(secrets, body, signWith("v1")));
console.log("new secret:", verifyStock(secrets, body, signWith("v2")));
console.log("unknown:   ", verifyStock(secrets, body, signWith("v2").replace("v2=", "v9=")));
console.log("garbage:   ", verifyStock(secrets, body, "v2=zz"));
```

Output of `node hmac-ring.js`

```ts
old secret: ok
new secret: ok
unknown:    unknown version
garbage:    malformed header
```

The regular expression fixes the format and the length (64 hex characters), so `timingSafeEqual` always compares two 32-byte buffers. `Object.hasOwn` makes sure a version like `constructor` cannot pick up something inherited from `Object.prototype` (the same class of bug as prototype pollution in [Writing injection-safe code](https://zudojs.oyinlola.site/learn/sec-injection#prototype-pollution)). Once every sender uses `v2`, delete `v1`.

## Summary

- Name the promise first: integrity (hash), authenticity between trusted parties (HMAC), confidentiality (AES-256-GCM), public verifiability (signatures), passwords (scrypt or Argon2id).
- Symmetric cryptography uses one shared key and is fast; asymmetric uses a key pair and solves key distribution. Real systems combine them: a key exchange (X25519 plus HKDF) agrees on a symmetric key.
- Ed25519 signs with a private key and verifies with a public key that you can publish as a JWK. Verify the exact bytes, before parsing, with one fixed algorithm.
- TLS combines key exchange, certificates, signatures and symmetric encryption. The client must check the certificate chain and the host name; never switch verification off, trust your development CA instead.
- Secrets live in the environment or a secret store, never in Git; validate them at startup, give each service only what it needs, and use one key per purpose.
- Rotate with key ids: add, switch, retire. Verifiers pick keys by id from a trusted set. After a leak, rotate first and investigate second.

Next: [Types are not security](https://zudojs.oyinlola.site/learn/ts-security), where TypeScript types, runtime validation and these security controls come together in one endpoint.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
