---
title: "File uploads and storage — ZudoJS Academy"
description: "Accept uploads safely with node:http: stream multipart bodies to disk, enforce size limits, sniff real content types and serve files through signed URLs."
source: https://zudojs.oyinlola.site/learn/backend-files
---

LEVEL 7 · LESSON 15 OF 15

Backend building blocks Core

# File uploads and storage

Accept uploads safely with node:http: stream multipart bodies to disk, enforce size limits, sniff real content types and serve files through signed URLs.

- **55 min** to read and try
- **You need:** Queues and background jobs, TypeScript on Node.js, and Streams and buffers
- **You build:** A product-photo upload service with no framework - a streaming multipart parser, size limits, magic-number sniffing, random storage keys, SHA-256 checksums, signed download links and a property test for the parser

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain how a multipart/form-data body is built, and why uploads are streamed instead of buffered
- Parse multipart bodies as a stream, handling boundaries split across chunks
- Enforce size limits while streaming, and clean up partial files on every failure
- Decide a file's type from its bytes, never from the client's name or header, and store it under a random key
- Serve private files through expiring HMAC-signed URLs with safe headers
- Describe object storage (buckets, keys, metadata, presigned URLs) and when to use it instead of a local disk

## A photo is not a JSON field

Sellers in a grocery marketplace need to upload product photos. The first version accepts JSON with the photo base64-encoded in a field, because the API already speaks JSON:

base64-json.tsNode.js only

```ts
const photo = Buffer.alloc(3 * 1024 * 1024, 0x42);
const json = JSON.stringify({ productId: 7, photo: photo.toString("base64") });
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

console.log("the photo:        ", mb(photo.length));
console.log("the JSON body:    ", mb(Buffer.byteLength(json)));
```

Output of `npx tsx base64-json.ts`

```ts
the photo:         3.0 MB
the JSON body:     4.0 MB
```

Base64 turns every 3 bytes into 4 characters, so the body is a third bigger. And to parse JSON, the server must hold the whole body in memory, then the parsed string, then the decoded bytes. Ten sellers uploading at once, and the server holds hundreds of megabytes. One malicious "seller" sending a 2 GB body, and it holds nothing ever again.

Then the security reports arrive:

- A file called `photo.jpg` was really an HTML page with a script. It was served from the shop's own domain, so the script could read the logged-in customer's data.
- A file called `../../app/config.json` was saved exactly under that name, and overwrote a file outside the upload folder.
- A download link to a private invoice could be passed around forever.

This lesson builds an upload service that handles all of it with nothing but Node.js: bodies are **streamed** to disk in small pieces, sizes are limited while streaming, types come from the file's actual bytes, names come from the server, and downloads go through **signed URLs** that expire. You used streams in [Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams) and typed them in [TypeScript on Node.js](https://zudojs.oyinlola.site/learn/ts-node#streams); here they carry real uploads.

## What can the client lie about?

REASON IT OUT

### Trusting an upload

An upload arrives with a filename, a `Content-Type` for the file, a `Content-Length` for the request, and the bytes. For each, decide: can the client lie about it, and what should the server use instead?

- The filename `../../etc/passwd.jpg`?
- The file's `Content-Type: image/jpeg`?
- The request's `Content-Length: 5000`?
- The extension `.jpg`?
- What happens to the half-written file if the connection drops at 80%?

**Show the reasoning**

**All four are chosen by the client**, and all four can lie. The filename can contain path separators, control characters or a thousand characters, so it is never used to build a path: the server stores the file under a random id and keeps a cleaned-up name only for display. The file's `Content-Type` and extension are labels the client typed; the file's real type is found by looking at its first bytes. `Content-Length` is useful for rejecting an obviously huge upload early, but the body can be longer than declared (or have no length at all, with chunked encoding), so the server counts the bytes it actually receives and stops at the limit.

**The half-written file** must be deleted. Every failure path (too big, wrong type, connection lost, a later field invalid) must clean up, or the disk slowly fills with fragments. Writing to a temporary name and renaming only when complete means a half file is never mistaken for a whole one.

## What a multipart body looks like

Browsers and `fetch` send files as `multipart/form-data`. The body is a series of **parts**, one per form field, separated by a **boundary**: a random string, announced in the request's `Content-Type` header, that does not appear in the data. Each part has its own small headers, a blank line, and then the raw bytes. `FormData` builds one; here are its exact bytes, with the random boundary replaced by `BOUNDARY`, `␍␊` marking each line end (`\r\n`), and the four bytes of the tiny "photo" shown in hex:

raw-multipart.tsNode.js only

```ts
const form = new FormData();
form.append("caption", "Rice, 5 kg bag");
form.append("photo", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }), "rice.jpg");

const response = new Response(form);
const contentType = response.headers.get("content-type") ?? "";
const boundary = contentType.split("boundary=")[1] ?? "";
const body = Buffer.from(await response.arrayBuffer()).toString("latin1");

console.log("Content-Type:", contentType.replace(boundary, "BOUNDARY"));
console.log("");
const readable = body
  .replaceAll(boundary, "BOUNDARY")
  .replace(/[\x80-\xff]+/g, (bytes) => `<bytes ${[...bytes].map((c) => c.charCodeAt(0).toString(16)).join(" ")}>`);
for (const line of readable.split("\r\n").slice(0, -1)) console.log(`${line}␍␊`);
```

Output of `npx tsx raw-multipart.ts`

```ts
Content-Type: multipart/form-data; boundary=BOUNDARY

--BOUNDARY␍␊
Content-Disposition: form-data; name="caption"␍␊
␍␊
Rice, 5 kg bag␍␊
--BOUNDARY␍␊
Content-Disposition: form-data; name="photo"; filename="rice.jpg"␍␊
Content-Type: image/jpeg␍␊
␍␊
<bytes ff d8 ff e0>␍␊
--BOUNDARY--␍␊
```

Three things to notice. The file is sent as raw bytes, not base64, so there is no size penalty. The `filename` and the part's `Content-Type` are just text the client wrote. And the parser's job is to find `␍␊--BOUNDARY` in a stream of bytes, where the end of one part and the start of the next can arrive in different chunks, or even be split across two chunks in the middle of the boundary itself.

## A streaming multipart parser

Node.js has no built-in streaming multipart parser. (The web-standard `request.formData()` works in Node.js, but it reads the whole body into memory first, which is exactly what you are avoiding.) Production code uses a library such as busboy; writing a small one yourself shows what those libraries must get right. First, an error type that carries the HTTP status:

src/errors.tsNode.js only

```ts
export class UploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}
```

The parser is a small **state machine**: it is always in one state (before the first boundary, reading part headers, reading part data, just after a boundary, done), and each chunk of input moves it forward. For every part it asks `onPart` for a **sink**, an object with `write` and `end`, and pours the part's bytes into it as they arrive:

src/multipart.tsNode.js only

```ts
import { UploadError } from "./errors.js";

export interface PartInfo {
  readonly name: string;
  readonly filename: string | undefined;
  readonly contentType: string | undefined;
}

export interface PartSink {
  write(chunk: Buffer): Promise<void>;
  end(): Promise<void>;
}

const MAX_HEADER_BYTES = 8 * 1024;

export function boundaryFrom(contentType: string | undefined): string {
  const match = /^multipart\/form-data;\s*boundary=(?:"([^"]{1,70})"|([^\s;]{1,70}))$/i.exec(contentType ?? "");
  const boundary = match?.[1] ?? match?.[2];
  if (boundary === undefined) throw new UploadError(400, "send multipart/form-data with a boundary");
  return boundary;
}

function parseHeaders(block: string): PartInfo {
  const headers = new Map<string, string>();
  for (const line of block.split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const disposition = headers.get("content-disposition") ?? "";
  const name = /\bname="([^"]*)"/.exec(disposition)?.[1];
  if (!disposition.startsWith("form-data") || name === undefined) throw new UploadError(400, "a part has no field name");
  const filename = /\bfilename="([^"]*)"/.exec(disposition)?.[1];
  return { name, filename, contentType: headers.get("content-type") };
}

export async function parseMultipart(
  body: AsyncIterable<unknown>,
  boundary: string,
  onPart: (part: PartInfo) => PartSink,
): Promise<void> {
  const opening = Buffer.from(`--${boundary}\r\n`);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  let state: "preamble" | "headers" | "body" | "after" | "done" = "preamble";
  let pending = Buffer.alloc(0);
  let sink: PartSink | undefined;

  for await (const chunk of body) {
    if (!Buffer.isBuffer(chunk)) throw new UploadError(400, "expected bytes");
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      if (state === "preamble") {
        const at = pending.indexOf(opening);
        if (at === -1) break;
        pending = pending.subarray(at + opening.length);
        state = "headers";
      } else if (state === "headers") {
        const end = pending.indexOf("\r\n\r\n");
        if (end === -1) {
          if (pending.length > MAX_HEADER_BYTES) throw new UploadError(400, "part headers are too long");
          break;
        }
        sink = onPart(parseHeaders(pending.subarray(0, end).toString("utf8")));
        pending = pending.subarray(end + 4);
        state = "body";
      } else if (state === "body") {
        const at = pending.indexOf(delimiter);
        if (at === -1) {
          const safe = pending.length - (delimiter.length - 1);
          if (safe > 0) {
            await sink!.write(pending.subarray(0, safe));
            pending = pending.subarray(safe);
          }
          break;
        }
        await sink!.write(pending.subarray(0, at));
        await sink!.end();
        pending = pending.subarray(at + delimiter.length);
        state = "after";
      } else if (state === "after") {
        if (pending.length < 2) break;
        const next = pending.subarray(0, 2).toString("latin1");
        pending = pending.subarray(2);
        if (next === "--") state = "done";
        else if (next === "\r\n") state = "headers";
        else throw new UploadError(400, "malformed multipart body");
      } else {
        break;
      }
    }
  }
  if (state !== "done") throw new UploadError(400, "the upload ended before the closing boundary");
}
```

- **The boundary across chunks.** In the `body` state, if the delimiter is not found, the parser writes out everything except the last `delimiter.length - 1` bytes. Those might be the start of a delimiter that finishes in the next chunk, so they wait. That one line is the difference between a parser that works in tests and one that corrupts real uploads.
- **Backpressure.** The parser `await`s every `sink.write`. If the disk is slower than the network, the parser stops pulling chunks from the request, and Node.js stops reading from the socket: memory stays flat ([Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams#writable) explained backpressure).
- **Limits everywhere.** The boundary has a maximum length, part headers are limited to 8 KB, and a body that ends before the closing boundary is an error, not a silently truncated file.

Feed it the same form in 7-byte, 64-byte and one huge chunk. The result must not change:

try-parser.tsNode.js only

```ts
import { boundaryFrom, parseMultipart } from "./src/multipart.js";
import type { PartInfo, PartSink } from "./src/multipart.js";

const photo = new Uint8Array(5_000).fill(0x42);
photo.set([0xff, 0xd8, 0xff, 0xe0]);
const form = new FormData();
form.append("caption", "Rice, 5 kg bag");
form.append("photo", new Blob([photo], { type: "image/jpeg" }), "rice.jpg");
const request = new Response(form);
const bytes = Buffer.from(await request.arrayBuffer());

async function* inChunks(size: number): AsyncGenerator<Buffer> {
  for (let at = 0; at < bytes.length; at += size) yield bytes.subarray(at, at + size);
}

for (const chunkSize of [7, 64, 100_000]) {
  const parts: string[] = [];
  function collect(part: PartInfo): PartSink {
    const chunks: Buffer[] = [];
    return {
      async write(chunk) {
        chunks.push(chunk);
      },
      async end() {
        const all = Buffer.concat(chunks);
        const shown = part.filename === undefined ? JSON.stringify(all.toString("utf8")) : `${all.length} bytes, starts ${all.subarray(0, 4).toString("hex")}`;
        parts.push(`${part.name}${part.filename === undefined ? "" : ` (${part.filename}, ${part.contentType})`}: ${shown}`);
      },
    };
  }
  await parseMultipart(inChunks(chunkSize), boundaryFrom(request.headers.get("content-type") ?? undefined), collect);
  console.log(`chunks of ${chunkSize} bytes ->`, parts);
}
```

Output of `npx tsx try-parser.ts`

```ts
chunks of 7 bytes -> [
  'caption: "Rice, 5 kg bag"',
  'photo (rice.jpg, image/jpeg): 5000 bytes, starts ffd8ffe0'
]
chunks of 64 bytes -> [
  'caption: "Rice, 5 kg bag"',
  'photo (rice.jpg, image/jpeg): 5000 bytes, starts ffd8ffe0'
]
chunks of 100000 bytes -> [
  'caption: "Rice, 5 kg bag"',
  'photo (rice.jpg, image/jpeg): 5000 bytes, starts ffd8ffe0'
]
```

## The file's real type

Most file formats start with a fixed sequence of bytes, called a **magic number** or signature. A JPEG starts with `FF D8 FF`, a PNG with `89 50 4E 47 0D 0A 1A 0A` (the bytes of `\x89PNG\r\n\x1a\n`), a WebP with `RIFF`, four size bytes, then `WEBP`. Looking at those bytes to decide the type is called **content sniffing**:

src/sniff.tsNode.js only

```ts
export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export const EXTENSIONS: Readonly<Record<ImageType, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

export function sniffImage(head: Uint8Array): ImageType | undefined {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return undefined;
}
```

try-sniff.tsNode.js only

```ts
import { sniffImage } from "./src/sniff.js";

const uploads: [string, string | Uint8Array][] = [
  ["rice.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])],
  ["oil.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])],
  ["sugar.webp", "RIFF\x24\x00\x00\x00WEBPVP8 "],
  ["beans.jpg", "<html><script>steal(document.cookie)</script>"],
  ["invoice.jpg", "%PDF-1.7\n%\xe2\xe3"],
];

for (const [name, content] of uploads) {
  const bytes = typeof content === "string" ? Buffer.from(content, "latin1") : content;
  console.log(name.padEnd(12), "->", sniffImage(bytes) ?? "refused: not an image");
}
```

The HTML page and the PDF both claimed to be `.jpg`. Their bytes said otherwise. The shop accepts only the three image types it can display, as an **allow-list**, and everything else is refused with **415 Unsupported Media Type**. Sniffing checks the start of the file only; a file can still be a broken image or contain a hidden payload after a valid header. For images that will be shown to many people, many services go further and **re-encode** every upload (decode it and save a fresh JPEG), which destroys anything that is not image data; that is heavy work, so it belongs in a background job from [the last lesson](https://zudojs.oyinlola.site/learn/backend-queues).

## Streaming to disk

The file sink is where the rules meet the disk:

src/file-sink.tsNode.js only

```ts
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import type { WriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { finished } from "node:stream/promises";

import { UploadError } from "./errors.js";
import type { PartInfo, PartSink } from "./multipart.js";
import { EXTENSIONS, sniffImage } from "./sniff.js";
import type { ImageType } from "./sniff.js";

export interface StoredFile {
  readonly key: string;
  readonly originalName: string;
  readonly contentType: ImageType;
  readonly size: number;
  readonly sha256: string;
}

export interface FileSink extends PartSink {
  abort(): Promise<void>;
  stored(): StoredFile | undefined;
}

export function displayName(filename: string | undefined): string {
  const base = (filename ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[^\w. -]/g, "_").replace(/^\.+/, "").slice(0, 100);
  return clean === "" ? "upload" : clean;
}

export function imageSink(dir: string, part: PartInfo, maxBytes: number): FileSink {
  const id = randomUUID();
  const tempPath = join(dir, `${id}.part`);
  const hash = createHash("sha256");
  let head = Buffer.alloc(0);
  let size = 0;
  let type: ImageType | undefined;
  let out: WriteStream | undefined;
  let result: StoredFile | undefined;

  async function toDisk(chunk: Buffer): Promise<void> {
    if (!out!.write(chunk)) await once(out!, "drain");
  }

  async function open(): Promise<void> {
    type = sniffImage(head);
    if (type === undefined) throw new UploadError(415, "only JPEG, PNG and WebP images are accepted");
    out = createWriteStream(tempPath, { flags: "wx" });
    await toDisk(head);
  }

  return {
    async write(chunk) {
      size += chunk.length;
      if (size > maxBytes) throw new UploadError(413, `the file is larger than ${maxBytes} bytes`);
      hash.update(chunk);
      if (out !== undefined) return toDisk(chunk);
      head = Buffer.concat([head, chunk]);
      if (head.length >= 12) await open();
    },
    async end() {
      if (out === undefined) await open();
      out!.end();
      await finished(out!);
      const key = `${id}${EXTENSIONS[type!]}`;
      await rename(tempPath, join(dir, key));
      result = { key, originalName: displayName(part.filename), contentType: type!, size, sha256: hash.digest("hex") };
    },
    async abort() {
      out?.destroy();
      await rm(tempPath, { force: true });
      if (result !== undefined) await rm(join(dir, result.key), { force: true });
    },
    stored: () => result,
  };
}
```

- **Sniff before writing.** The first 12 bytes are held in memory; only when they pass `sniffImage` is a file opened. A refused upload never touches the disk.
- **Count while streaming.** Every chunk adds to `size`, and passing `maxBytes` throws **413 Content Too Large** at once, whatever the request's headers said.
- **Random key, temporary name.** The data goes to `<uuid>.part`, opened with the `wx` flag (fail if it exists), and is renamed to `<uuid>.jpg` only after the last byte is flushed. The extension comes from the sniffed type, never from the client.
- **A checksum for free.** The SHA-256 of the bytes is computed on the way through. It lets you detect corruption later, and spot the same photo uploaded twice.
- **`abort` cleans up** the temporary file, and also a finished file when a *later* part of the same request fails, so a rejected request leaves nothing behind.
- **`displayName`** keeps only the last path segment and safe characters. It is stored as metadata, shown to people, and never used as a path.

## Signed URLs

Product photos may be public, but invoices, ID documents and delivery notes are not. You could route every download through your API with a login check, but then links cannot be put in an `<img>` tag, an e-mail or a CDN. A **signed URL** carries its own permission: the path, an expiry time, and an **HMAC** of both made with a server secret (the same tool as the tokens in [BookStore API: authentication and tests](https://zudojs.oyinlola.site/learn/bookstore-auth#tokens)). Anyone holding the link can use it until it expires; nobody can make a new one or change it without the secret:

src/signed-url.tsNode.js only

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function signature(secret: string, path: string, expires: number): string {
  return createHmac("sha256", secret).update(`${path}\n${expires}`).digest("base64url");
}

export function signUrl(secret: string, path: string, expires: number): string {
  return `${path}?expires=${expires}&sig=${signature(secret, path, expires)}`;
}

export function checkSignedUrl(secret: string, url: URL, nowSeconds: number): "ok" | "expired" | "bad signature" {
  const expires = Number(url.searchParams.get("expires"));
  const given = Buffer.from(url.searchParams.get("sig") ?? "");
  const expected = Buffer.from(signature(secret, url.pathname, expires));
  if (!Number.isSafeInteger(expires) || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return "bad signature";
  }
  return nowSeconds < expires ? "ok" : "expired";
}
```

try-signed-url.tsNode.js only

```ts
import { randomBytes } from "node:crypto";

import { checkSignedUrl, signUrl } from "./src/signed-url.js";

const secret = randomBytes(32).toString("hex");
const now = Date.UTC(2026, 8, 24, 12, 0, 0) / 1_000;
const link = new URL(signUrl(secret, "/files/9b2c.jpg", now + 600), "https://shop.example");
const sig = link.searchParams.get("sig") ?? "";

console.log(link.href.replace(sig, "<signature>"));
console.log("now:              ", checkSignedUrl(secret, link, now));
console.log("after 10 minutes: ", checkSignedUrl(secret, link, now + 600));

const otherFile = new URL(link.href.replace("9b2c.jpg", "7f1a.jpg"));
const longer = new URL(link.href.replace(`expires=${now + 600}`, `expires=${now + 86_400}`));
console.log("other file:       ", checkSignedUrl(secret, otherFile, now));
console.log("longer expiry:    ", checkSignedUrl(secret, longer, now));
console.log("other secret:     ", checkSignedUrl(randomBytes(32).toString("hex"), link, now));
```

Output of `npx tsx try-signed-url.ts`

```ts
https://shop.example/files/9b2c.jpg?expires=1790251800&sig=<signature>
now:               ok
after 10 minutes:  expired
other file:        bad signature
longer expiry:     bad signature
other secret:      bad signature
```

The signature covers the path *and* the expiry, so neither can be changed: pointing the link at another file fails, and so does stretching ten minutes into a day. The comparison uses `timingSafeEqual`, as every secret comparison should ([Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#timing)). Choose short lifetimes: minutes for a download link, and never "forever". To revoke links early, rotate the secret, or add a per-file version to what is signed.

## The upload service

Now everything together on `node:http`. `POST /photos` accepts one photo and an optional caption, and answers with the stored metadata and a signed link. `GET /files/…` serves a file only with a valid, unexpired signature:

src/upload-server.tsNode.js only

```ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server, ServerResponse } from "node:http";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import { UploadError } from "./errors.js";
import { imageSink } from "./file-sink.js";
import type { FileSink, StoredFile } from "./file-sink.js";
import { boundaryFrom, parseMultipart } from "./multipart.js";
import type { PartSink } from "./multipart.js";
import { checkSignedUrl, signUrl } from "./signed-url.js";

export interface UploadOptions {
  readonly dir: string;
  readonly secret: string;
  readonly maxFileBytes: number;
  readonly nowSeconds: () => number;
}

function sendJson(res: ServerResponse, status: number, body: unknown, close = false): void {
  res.writeHead(status, { "content-type": "application/json", ...(close ? { connection: "close" } : {}) });
  res.end(JSON.stringify(body));
}

function textSink(limit: number, done: (text: string) => void): PartSink {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    async write(chunk) {
      size += chunk.length;
      if (size > limit) throw new UploadError(400, `text fields are limited to ${limit} bytes`);
      chunks.push(chunk);
    },
    async end() {
      done(Buffer.concat(chunks).toString("utf8"));
    },
  };
}

export function createUploadServer(options: UploadOptions): Server {
  const files = new Map<string, StoredFile & { caption: string }>();

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname.startsWith("/files/")) {
      const key = url.pathname.slice("/files/".length);
      const file = files.get(key);
      const check = checkSignedUrl(options.secret, url, options.nowSeconds());
      if (file === undefined || check !== "ok") return sendJson(res, 403, { error: check === "ok" ? "bad signature" : check });
      res.writeHead(200, {
        "content-type": file.contentType,
        "content-length": (await stat(join(options.dir, key))).size,
        "x-content-type-options": "nosniff",
        "content-disposition": `inline; filename="${file.originalName}"`,
        "cache-control": "private, max-age=600",
      });
      return pipeline(createReadStream(join(options.dir, key)), res);
    }

    if (req.method !== "POST" || url.pathname !== "/photos") return sendJson(res, 404, { error: "no such route" });

    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > options.maxFileBytes + 16_384) return sendJson(res, 413, { error: "the upload is too large" }, true);

    let photo: FileSink | undefined;
    let caption = "";
    try {
      await parseMultipart(req, boundaryFrom(req.headers["content-type"]), (part) => {
        if (part.name === "caption" && part.filename === undefined) return textSink(200, (text) => (caption = text));
        if (part.name === "photo" && part.filename !== undefined && photo === undefined) {
          photo = imageSink(options.dir, part, options.maxFileBytes);
          return photo;
        }
        throw new UploadError(400, `unexpected field "${part.name}"`);
      });
      const stored = photo?.stored();
      if (stored === undefined) throw new UploadError(400, "send one file in the photo field");
      files.set(stored.key, { ...stored, caption });
      const link = signUrl(options.secret, `/files/${stored.key}`, options.nowSeconds() + 600);
      sendJson(res, 201, { ...stored, caption, url: link });
    } catch (error) {
      await photo?.abort();
      if (error instanceof UploadError) sendJson(res, error.status, { error: error.message }, true);
      else sendJson(res, 500, { error: "upload failed" }, true);
    }
  });
}
```

Some details that matter:

- **Early rejection.** A `Content-Length` far above the limit is refused before a single byte is read. It is a courtesy, not a check: the streaming limit in the sink is what really protects the server.
- **`connection: close` on errors.** When the server refuses an upload halfway, the client may still be sending. Closing the connection after the answer stops the transfer instead of reading hundreds of megabytes just to throw them away.
- **An allow-list of fields.** A photo field with a filename and a small caption; anything else is refused, like the unknown JSON keys in [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers#entities-dtos).
- **Safe download headers.** The `Content-Type` is the sniffed one. `X-Content-Type-Options: nosniff` tells browsers not to guess a different type from the content. The file is streamed from disk with `pipeline`, so a download uses as little memory as an upload.

Try every case from the start of the lesson against a real server. The limit is set to 100,000 bytes to keep the demo small. One upload is sent as a stream with no `Content-Length` at all, so only the streaming limit can stop it. (Node's `fetch` needs `duplex: "half"` for a streamed body; the current TypeScript types for `fetch` do not list that option yet, so the options are built in a variable first, which skips the excess-property check.)

try-upload.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createUploadServer } from "./src/upload-server.js";

const dir = await mkdtemp(join(tmpdir(), "uploads-"));
let now = Date.UTC(2026, 8, 24, 12, 0, 0) / 1_000;
const server = createUploadServer({ dir, secret: randomBytes(32).toString("hex"), maxFileBytes: 100_000, nowSeconds: () => now });
server.listen(0);
await once(server, "listening");
const address = server.address();
if (address === null || typeof address === "string") throw new Error("expected a TCP address");
const base = `http://localhost:${address.port}`;

function jpeg(size: number): Blob {
  const bytes = new Uint8Array(size).fill(0x42);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return new Blob([bytes], { type: "image/jpeg" });
}

async function upload(label: string, fill: (form: FormData) => void): Promise<Record<string, unknown>> {
  const form = new FormData();
  fill(form);
  const response = await fetch(`${base}/photos`, { method: "POST", body: form });
  const body = (await response.json()) as Record<string, unknown>;
  const shown = response.status === 201 ? `${body["originalName"]}, ${body["contentType"]}, ${body["size"]} bytes` : body["error"];
  console.log(label.padEnd(22), response.status, shown);
  return body;
}

const good = await upload("a real JPEG", (f) => { f.append("caption", "Rice, 5 kg"); f.append("photo", jpeg(5_000), "rice.jpg"); });
await upload("HTML named .jpg", (f) => f.append("photo", new Blob(["<html><script>alert(1)</script></html>"], { type: "image/jpeg" }), "beans.jpg"));
await upload("too big", (f) => f.append("photo", jpeg(300_000), "huge.jpg"));
const unsized = new Response((() => { const f = new FormData(); f.append("photo", jpeg(300_000), "huge.jpg"); return f; })());
const streamedInit = {
  method: "POST",
  headers: { "content-type": unsized.headers.get("content-type") ?? "" },
  body: unsized.body,
  duplex: "half",
};
const streamed = await fetch(`${base}/photos`, streamedInit);
console.log("too big, no length".padEnd(22), streamed.status, ((await streamed.json()) as { error: string }).error);
const traversal = await upload("path in the name", (f) => f.append("photo", jpeg(2_000), "../../etc/passwd.jpg"));
await upload("unexpected field", (f) => { f.append("photo", jpeg(2_000), "a.jpg"); f.append("isAdmin", "true"); });
await upload("no file", (f) => f.append("caption", "just text"));

const stored = await readdir(dir);
console.log("files on disk:", stored.length, "all named by id:", stored.every((name) => /^[0-9a-f-]{36}\.jpg$/.test(name)));

const link = String(good["url"]);
const download = await fetch(base + link);
console.log("download:", download.status, download.headers.get("content-type"), download.headers.get("x-content-type-options"), (await download.arrayBuffer()).byteLength, "bytes");
const [goodPath] = link.split("?");
const [, otherQuery] = String(traversal["url"]).split("?");
console.log("borrowed signature:", (await fetch(`${base}${goodPath}?${otherQuery}`)).status);
now += 601;
console.log("after expiry:      ", (await fetch(base + link)).status);

server.close();
await rm(dir, { recursive: true });
```

Output of `npx tsx try-upload.ts`

```ts
a real JPEG            201 rice.jpg, image/jpeg, 5000 bytes
HTML named .jpg        415 only JPEG, PNG and WebP images are accepted
too big                413 the upload is too large
too big, no length     413 the file is larger than 100000 bytes
path in the name       201 passwd.jpg, image/jpeg, 2000 bytes
unexpected field       400 unexpected field "isAdmin"
no file                400 send one file in the photo field
files on disk: 2 all named by id: true
download: 200 image/jpeg nosniff 5000 bytes
borrowed signature: 403
after expiry:       403
```

Read it as a checklist. The real JPEG was stored. The HTML page was refused by its bytes, whatever its name said. The huge upload was stopped by its declared length, and the one without a length by the streaming counter. The path in the name was reduced to `passwd.jpg` for display, and the file itself got a random name like every other. The upload with an unexpected field was refused, and its already-written photo was deleted, so only two files are on disk. The download had the sniffed type and `nosniff`; a signature borrowed from another file and an expired link were both refused.

## Object storage

A local folder works for one server. With two servers behind a load balancer, a photo uploaded to one is missing on the other; when a server is replaced, its disk goes with it. Production systems keep files in **object storage**: Amazon S3, Google Cloud Storage, Cloudflare R2, or a self-hosted S3-compatible store such as MinIO. The vocabulary:

| Term | Meaning | In this lesson |
| --- | --- | --- |
| Bucket | A named container for objects, with its own access rules | the upload folder |
| Key | The object's full name inside the bucket; there are no real folders, only `/` in keys | `<uuid>.jpg`, better `products/7/<uuid>.jpg` |
| Object | The bytes, written whole and replaced whole (no editing in place) | the file |
| Metadata | Content type, size, checksum and your own tags, stored with the object | `StoredFile` |
| Presigned URL | A signed, expiring URL for one operation on one object | `signUrl` |

With object storage, the upload itself often skips your server. The browser asks your API for permission; your API checks the user, picks the key and returns a **presigned PUT URL**; the browser sends the file straight to the bucket; then it tells your API "done", and a background job checks the object (size, sniffed type, maybe re-encoding) before it is published. Your servers never carry the bytes. Upload links are created with the provider's SDK; the AWS command-line tool can create the download (GET) kind, which shows the shape of every presigned URL (example output):

Example output

```bash
$ aws s3 presign s3://shop-product-photos/products/7/5f0c2e4e.jpg --expires-in 600
https://shop-product-photos.s3.eu-west-1.amazonaws.com/products/7/5f0c2e4e.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=…&X-Amz-Date=20260924T120000Z&X-Amz-Expires=600&X-Amz-SignedHeaders=host&X-Amz-Signature=…
```

It is the same idea as `signUrl`: what may be done, until when, and an HMAC over it (AWS's "Signature Version 4"). Keep the metadata (who uploaded what, for which product, its checksum and status) in your database, and the bytes in the bucket. Keep buckets private by default, and give each environment its own bucket and credentials. [Storage abstractions](https://zudojs.oyinlola.site/learn/zudo-storage), in the ZudoJS course, puts local disks and object stores behind one interface, and [Project: a file upload system](https://zudojs.oyinlola.site/learn/zudo-file-uploads) packages the upload rules from this lesson.

## Testing the parser with properties

The parser's hardest promise is "the bytes that come out are exactly the bytes that went in, however the input is chunked". That is a property, so fast-check (from [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies#properties)) can check it against random files, random chunk sizes, and one nasty file that contains the start of the delimiter:

tests/multipart.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import fc from "fast-check";

import { UploadError } from "../src/errors.js";
import { parseMultipart } from "../src/multipart.js";

const BOUNDARY = "shop-boundary-42";

function body(file: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

async function* chunks(bytes: Buffer, size: number): AsyncGenerator<Buffer> {
  for (let at = 0; at < bytes.length; at += size) yield bytes.subarray(at, at + size);
}

async function received(bytes: Buffer, size: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  await parseMultipart(chunks(bytes, size), BOUNDARY, () => ({
    write: async (chunk) => void parts.push(chunk),
    end: async () => {},
  }));
  return Buffer.concat(parts);
}

describe("parseMultipart", () => {
  it("returns the exact file bytes for any content and any chunk size", async () => {
    const tricky = fc.oneof(fc.uint8Array({ maxLength: 2_000 }), fc.constant(Buffer.from(`\r\n--${BOUNDARY.slice(0, 8)}\r\n--`)));
    await fc.assert(
      fc.asyncProperty(tricky, fc.integer({ min: 1, max: 64 }), async (file, size) => {
        assert.deepEqual(await received(body(file), size), Buffer.from(file));
      }),
      { numRuns: 300 },
    );
  });

  it("refuses a body that stops before the closing boundary", async () => {
    const cut = body(Buffer.from("half a photo")).subarray(0, 90);
    await assert.rejects(received(cut, 16), (error: unknown) => error instanceof UploadError && error.status === 400);
  });
});
```

Output of `npx tsx tests/multipart.test.ts`

```ts
▶ parseMultipart
  ✔ returns the exact file bytes for any content and any chunk size (568.288794ms)
  ✔ refuses a body that stops before the closing boundary (1.818395ms)
✔ parseMultipart (582.820885ms)
ℹ tests 2
ℹ suites 1
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1664.564645
```

Three hundred random files, each cut into random chunk sizes from 1 to 64 bytes, all came out byte for byte. The end-to-end run above covered the rest: limits, sniffing, cleanup and signatures. Add one more kind of test in a real project: upload a file, kill the connection halfway, and check that no `.part` file is left behind.

## Production concerns

- **Limits at every layer.** Your reverse proxy (nginx, a load balancer) has its own body-size limit and timeouts; set them to match, so a huge upload is refused before it reaches Node.js at all. Limit how many uploads one user can make per minute.
- **Scan and process in the background.** Virus scanning, re-encoding, thumbnails and extracting metadata are slow and can crash on hostile files. Keep uploads in a "pending" state, and let a queue worker promote them once they pass.
- **Serve user files from another domain.** Even with sniffing and `nosniff`, serving user content from a separate domain (for example `shop-usercontent.example`) means a file that slips through cannot read your site's cookies. Use `Content-Disposition: attachment` for anything that is not an image you display.
- **Strip metadata from photos.** Phone photos carry EXIF data, often including the GPS position of the seller's home. Re-encoding removes it.
- **Deletion is a feature.** Keep a record of which objects belong to which product or user, so you can delete them when a product is removed or a user asks for their data to be erased. Orphaned objects cost money and may break privacy promises.

## Practice

TRY IT YOURSELF

### Add PDFs, as downloads only

Sellers also need to upload price lists as PDF. Write `sniffDocument(head)` that recognises a PDF (`%PDF-`) and returns the headers to serve it with: its type, and `Content-Disposition: attachment` so the browser downloads it instead of opening it inside your site.

**Show a solution**

sniff-pdf.tsNode.js only

```ts
interface Serving {
  readonly contentType: string;
  readonly disposition: string;
}

function sniffDocument(head: Uint8Array, displayName: string): Serving | undefined {
  const isPdf = Buffer.from(head.subarray(0, 5)).toString("latin1") === "%PDF-";
  if (!isPdf) return undefined;
  return { contentType: "application/pdf", disposition: `attachment; filename="${displayName}"` };
}

console.log(sniffDocument(Buffer.from("%PDF-1.7\n..."), "price-list.pdf"));
console.log(sniffDocument(Buffer.from("<html><body>price list</body></html>"), "price-list.pdf"));
```

Output of `npx tsx sniff-pdf.ts`

```json
{
  contentType: 'application/pdf',
  disposition: 'attachment; filename="price-list.pdf"'
}
undefined
```

A PDF can contain scripts and links, so it should not be rendered inside your site's pages. `attachment` makes the browser save it, and the display name in the header is the cleaned one from `displayName`, never the raw client filename (a quote or a line break in it could break the header).

TRY IT YOURSELF

### Signed uploads

Extend the signed-URL idea to uploads: a link that allows exactly one `PUT` of one key, until an expiry time. Sign the method, the key and the expiry together, and show that a link issued for `GET` cannot be used for `PUT`.

**Show a solution**

signed-put.tsNode.js only

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const secret = randomBytes(32).toString("hex");
const sign = (method: string, key: string, expires: number) =>
  createHmac("sha256", secret).update(`${method}\n${key}\n${expires}`).digest("base64url");

function allowed(method: string, key: string, expires: number, sig: string, now: number): boolean {
  const expected = Buffer.from(sign(method, key, expires));
  const given = Buffer.from(sig);
  return now < expires && given.length === expected.length && timingSafeEqual(given, expected);
}

const now = 1_790_251_200;
const key = "products/7/5f0c2e4e.jpg";
const putSig = sign("PUT", key, now + 300);
const getSig = sign("GET", key, now + 300);

console.log("PUT with the PUT link:", allowed("PUT", key, now + 300, putSig, now));
console.log("PUT with a GET link:  ", allowed("PUT", key, now + 300, getSig, now));
console.log("PUT another key:      ", allowed("PUT", "products/8/x.jpg", now + 300, putSig, now));
console.log("PUT after expiry:     ", allowed("PUT", key, now + 300, putSig, now + 301));
```

Output of `npx tsx signed-put.ts`

```ts
PUT with the PUT link: true
PUT with a GET link:   false
PUT another key:       false
PUT after expiry:      false
```

Everything that limits the permission (method, key, expiry) must be inside the signature, or someone can change it. S3's presigned URLs sign the method and even chosen headers, such as the content type, for the same reason.

TRY IT YOURSELF

### Where should the check go?

For each rule, say whether it belongs in the upload request, in a background job, or in the download request: (a) the file is at most 5 MB; (b) the file is a real JPEG, PNG or WebP; (c) the image has no hidden payload and no GPS data; (d) only the product's seller may upload its photos; (e) an invoice link works for 10 minutes.

**Show a solution**

(a) Upload request, while streaming (and also at the proxy). (b) Upload request: the magic number is in the first bytes, so it costs nothing. (c) Background job: re-encoding is slow and risky, so the photo stays pending until the job passes it. (d) Upload request, before reading the body: an unauthorised upload should not cost you bandwidth. (e) Download request: the signed URL's expiry is checked when the link is used.

## Recap

- Upload files as `multipart/form-data`, not base64 in JSON. A multipart body is parts separated by a boundary; each part has small headers and raw bytes.
- Stream uploads: parse the body chunk by chunk, keep a delimiter's worth of bytes back between chunks, and await every write so backpressure keeps memory flat.
- Count bytes while streaming and stop at the limit; use `Content-Length` only to refuse early.
- Trust the bytes, not the labels: sniff magic numbers against an allow-list, store under a random key with the sniffed extension, keep a cleaned name for display only, and delete partial files on every failure.
- Serve private files through signed URLs: an HMAC over the path (and method) and an expiry, checked with `timingSafeEqual`; send the sniffed type with `nosniff`.
- In production, keep bytes in object storage, metadata in the database, heavy checks in background jobs, and user content on a separate domain.

That completes the backend building blocks. Next: the Database engineering course, which goes deep on the database every one of them leans on, starting with [Modelling data for a shop](https://zudojs.oyinlola.site/learn/db-modeling).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
