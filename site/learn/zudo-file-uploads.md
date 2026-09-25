---
title: "\"Project: a file upload system\" — ZudoJS Academy"
description: "Build task attachments with @zudojs/http and @zudojs/storage: size limits, sniffed content types, safe keys, metadata, fenced locks and failure recovery."
source: https://zudojs.oyinlola.site/learn/zudo-file-uploads
---

LEVEL 13 · LESSON 5 OF 12

Data Core

# "Project: a file upload system"

Build task attachments with @zudojs/http and @zudojs/storage: size limits, sniffed content types, safe keys, metadata, fenced locks and failure recovery.

- **60 min** to read and try
- **You need:** Storage abstractions, Transactions, and Routes, requests and responses
- **You build:** Task attachments and cover images with upload, download and replace routes, an orphan sweeper, and tests that inject storage failures

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Enforce upload limits at the body, multipart and business level, and answer 413 or 400 for each
- Decide a file's type from its bytes and refuse files that lie about it
- Store bytes under keys you generate and record their metadata, undoing the store when the record fails
- Serve downloads with headers that stop the browser from running uploaded content
- Replace a file safely under a lock whose fencing token the database checks
- Find and remove orphaned objects, and test failures by injecting them

## The upload route that trusted everything

Users of the Task API want to attach files to tasks: the design brief as a PDF, a screenshot of the bug, a scanned receipt for a ₦45,000 purchase. The first version of the feature takes the file name, the content type and the bytes the browser sent, writes the bytes to an `uploads/` folder under that name, and remembers the type to send back on download. Here it is, without the HTTP part:

naive.tsNode.js only

```ts
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "naive-"));
const uploads = join(root, "uploads");
await mkdir(uploads);
const records: { name: string; type: string; size: number }[] = [];

async function naiveUpload(name: string, type: string, bytes: Uint8Array) {
  await writeFile(join(uploads, name), bytes);
  records.push({ name, type, size: bytes.length });
}

const text = (s: string) => new TextEncoder().encode(s);
await naiveUpload("brief.pdf", "application/pdf", text("%PDF-1.7 the real brief"));
await naiveUpload("../escaped.txt", "text/plain", text("I am outside the uploads folder"));
await naiveUpload("avatar.png", "text/html", text("<script>fetch('/api/me').then(…)</script>"));

console.log("uploads/ holds:", await readdir(uploads));
console.log("next to uploads/:", (await readdir(root)).filter((f) => f !== "uploads"));
for (const r of records) console.log(`GET /files/${r.name} -> Content-Type: ${r.type}`);
```

Three uploads, three different disasters:

- **Path traversal.** The name `../escaped.txt` climbed out of `uploads/`. With a longer chain of `../` it could overwrite your server's code or configuration.
- **Stored cross-site scripting (XSS).** The "avatar" is a script, and the server will send it back as `text/html`, from your own domain. Any user who opens it runs the attacker's code with their session.
- **No limits.** Nothing stops a 5 GB upload, or a million small ones. The server reads each into memory and writes it to disk until one of them runs out.

Everything in an upload comes from the client: the name, the type, the size, the bytes. None of it can be trusted. In [Storage abstractions](https://zudojs.oyinlola.site/learn/zudo-storage) you met `LocalObjectStorage`, which already refuses traversal in keys. In this project you build the whole feature around it: a route that accepts files with `@zudojs/http`, a policy that checks them, object storage for the bytes, a database table for what you know about them, safe downloads, a replaceable cover image guarded by a fenced lock, and a clean-up job for when things go wrong halfway.

## Think it through first

REASON IT OUT

### Before you accept a file

You will build `POST /tasks/:id/attachments`. Answer these before reading on:

- Which parts of the request can the client make up? Which of them can you check, and how?
- Where must the size limit be enforced so that a 5 GB upload never reaches your handler's memory?
- Storing a file is two writes: the bytes into object storage, and a row into the database. They are not in one transaction. Which do you do first, and what happens if the second fails?
- Two people replace a task's cover image at the same moment. What should the task end up with, and what happens to the other image?
- How can a file you stored become harmful when someone *downloads* it?

**Show the reasoning**

The client controls everything: the file name, the declared `Content-Type`, the size header and the bytes. You can check the *bytes*: their length, and their first few bytes, which reveal the real format. The name you only keep as a label, cleaned, and never as a path.

The size limit has to act before the body is read into memory: in the HTTP adapter (`maxBodySize`), which refuses an oversized request with 413. Limits per file and per number of files come next, in the multipart parser, and the business rule ("2 MB per file") last.

Store the bytes first, then write the row. If the row fails, delete the bytes again. The other order leaves a row pointing at a file that does not exist, a broken link users can see; this order can only leave an unreferenced object (an **orphan**), invisible to users, which a clean-up job removes when even the delete fails.

The last writer should win, and the loser's image should be deleted. A lock makes the two replacements take turns. But a lock can expire while its holder is still busy, so the database must refuse a write from a holder whose lock has already passed to someone else. That is what a **fencing token** is for.

A browser decides what to do with a download from its headers. Served as `text/html`, or "sniffed" into HTML by the browser, an uploaded file becomes a page on your domain. Downloads need an honest `Content-Type`, `X-Content-Type-Options: nosniff`, and `Content-Disposition: attachment`.

Here is the flow the rest of the lesson builds, with what happens when each step fails:

```ts
  POST /tasks/1/attachments  (multipart/form-data)
        │
        ▼
  1. limits      body > 7 MB ─────────────▶ 413 (adapter, before the handler runs)
        │        file > 2 MB, > 3 files ──▶ 413 (multipart parser)
        ▼
  2. check       empty ───────────────────▶ 400
        │        bytes are not PNG/JPEG/PDF ▶ 415
        ▼
  3. store       object storage: tasks/1/<uuid>          fails ▶ 500, nothing recorded
        │
        ▼
  4. record      INSERT INTO attachments …                fails ▶ delete the object, then 404/500
        │
        ▼
  5. respond     201 [{ id, fileName, contentType, size, url }]
```

Each step either succeeds or leaves nothing behind. A crash between steps 3 and 4 leaves an orphan, which the sweeper removes later.

## The project

The database side uses the `Database` contract from [the storage lesson](https://zudojs.oyinlola.site/learn/zudo-storage#database) and its PGlite adapter, unchanged:

**Show pglite-database.ts (unchanged)**

pglite-database.ts

```ts
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Database, Query, QueryResult, Transaction, TransactionState } from "@zudojs/storage";

async function runQuery<T>(db: Pick<PGlite, "query">, query: Query): Promise<QueryResult<T>> {
  const started = performance.now();
  const result = await db.query<T>(query.text, [...(query.parameters ?? [])]);
  return {
    rows: result.rows,
    // A SELECT reports the rows it returned; INSERT/UPDATE/DELETE the rows they changed.
    rowCount: result.fields.length > 0 ? result.rows.length : (result.affectedRows ?? 0),
    fields: result.fields.map((f) => ({ name: f.name, oid: f.dataTypeID })),
    durationMs: performance.now() - started,
  };
}

export class PgliteDatabase implements Database {
  private readonly pg: PGlite;

  constructor(dataDir?: string) {
    this.pg = new PGlite(dataDir);
  }
  async connect() {
    await this.pg.waitReady;
  }
  async disconnect() {
    if (!this.pg.closed) await this.pg.close();
  }
  query<T = Record<string, unknown>>(query: Query) {
    return runQuery<T>(this.pg, query);
  }
  async execute(query: Query) {
    return { rowCount: (await runQuery(this.pg, query)).rowCount };
  }
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (pgTx) => {
      let state: TransactionState = "active";
      const tx: Transaction = {
        id: randomUUID(),
        get state() { return state; },
        query: (q) => runQuery(pgTx, q),
        execute: async (q) => ({ rowCount: (await runQuery(pgTx, q)).rowCount }),
        savepoint: async (name) => { await pgTx.exec(`SAVEPOINT "${name}"`); },
        rollbackToSavepoint: async (name) => { await pgTx.exec(`ROLLBACK TO SAVEPOINT "${name}"`); },
      };
      try {
        const result = await callback(tx);
        state = "committed";
        return result;
      } catch (error) {
        state = "rolledback";
        throw error;
      }
    });
  }
  async healthCheck() {
    const started = performance.now();
    try {
      await this.pg.query("SELECT 1");
      return { healthy: true, latencyMs: performance.now() - started, status: "connected" };
    } catch {
      return { healthy: false, latencyMs: performance.now() - started, status: "unreachable" };
    }
  }
  getPoolStats() {
    return { total: 1, idle: 1, active: 0, waiting: 0 };
  }
}
```

Two tables. `attachments` holds what you know about each file: which task it belongs to, where its bytes live (`object_key`), the cleaned name, the *checked* type, the size and a SHA-256 hash. `tasks` gets a `cover_key` for one replaceable cover image, and a `cover_fence` that the [fencing section](#fencing) explains:

setup.ts

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStorage } from "@zudojs/storage";
import { AttachmentRepository } from "./attachments.js";
import { PgliteDatabase } from "./pglite-database.js";
import { LIMITS } from "./upload-policy.js";

export async function setup() {
  const db = new PgliteDatabase();
  await db.connect();
  const statements = [
    `CREATE TABLE tasks (
        id          serial PRIMARY KEY,
        title       text NOT NULL,
        cover_key   text,
        cover_fence int NOT NULL DEFAULT 0
      )`,
    `CREATE TABLE attachments (
        id           serial PRIMARY KEY,
        task_id      int  NOT NULL REFERENCES tasks (id),
        object_key   text NOT NULL UNIQUE,
        file_name    text NOT NULL,
        content_type text NOT NULL,
        size_bytes   int  NOT NULL CHECK (size_bytes > 0),
        sha256       text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now()
      )`,
    "INSERT INTO tasks (title) VALUES ('Website relaunch'), ('Office move')",
  ];
  for (const text of statements) await db.execute({ text });
  const folder = await mkdtemp(join(tmpdir(), "task-files-"));
  const files = new LocalObjectStorage(folder, { maxObjectBytes: LIMITS.maxFileBytes });
  return { db, files, attachments: new AttachmentRepository(db) };
}
```

The repository extends `BaseRepository` from `@zudojs/storage`, with a column allow-list, plus two queries of its own:

attachments.ts

```ts
import { BaseRepository } from "@zudojs/storage";
import type { Database } from "@zudojs/storage";

export interface AttachmentRow extends Record<string, unknown> {
  readonly id: number;
  readonly task_id: number;
  readonly object_key: string;
  readonly file_name: string;
  readonly content_type: string;
  readonly size_bytes: number;
  readonly sha256: string;
  readonly created_at: Date;
}

export class AttachmentRepository extends BaseRepository<AttachmentRow, number> {
  constructor(database: Database) {
    super(database, {
      tableName: "attachments",
      columns: ["task_id", "object_key", "file_name", "content_type", "size_bytes", "sha256"],
    });
  }

  async listForTask(taskId: number): Promise<readonly AttachmentRow[]> {
    const result = await this.database.query<AttachmentRow>({
      text: "SELECT * FROM attachments WHERE task_id = $1 ORDER BY id",
      parameters: [taskId],
    });
    return result.rows;
  }

  /** Every object key the database points at: attachments and covers. */
  async referencedKeys(): Promise<ReadonlySet<string>> {
    const result = await this.database.query<{ key: string }>({
      text: `SELECT object_key AS key FROM attachments
             UNION ALL SELECT cover_key FROM tasks WHERE cover_key IS NOT NULL`,
    });
    return new Set(result.rows.map((row) => row.key));
  }
}
```

## Limits at three levels

Size limits only protect you if they act *before* the work they limit. An upload passes through three places, and each one has its own limit:

| Where | Setting | What it stops | Answer |
| --- | --- | --- | --- |
| HTTP adapter | `maxBodySize` (default 10 MB) | The whole request body, before it is buffered | 413 |
| Multipart parser | `maxFileSize`, `maxFiles`, `maxFields`, `maxFieldSize` | One file too big, too many files or form fields | 413 |
| Your policy | `checkFile` | Business rules: empty files, allowed types | 400, 415 |

The node adapter of `@zudojs/http` reads the whole body into memory, as a `Uint8Array`, before your route runs. That is convenient, and it is also why `maxBodySize` must be set for an upload server: it is the only limit that acts before the bytes are in memory. It applies to *every* route, so choose it for your largest legitimate request (here 3 files of 2 MB plus the form's overhead) and keep it low. Files much bigger than a few megabytes should not pass through your server at all; see [production concerns](#production).

All the limits live in one place, next to the content check you will read about in the next section. The route that passes the parser limits comes after the service, in [Store, then record](#store).

upload-policy.ts

```ts
import { HttpError, sanitizeFilename } from "@zudojs/http";

export const LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxFiles: 3,
  maxBodyBytes: 7 * 1024 * 1024,
} as const;

interface Signature {
  readonly type: string;
  readonly ext: string;
  readonly magic: readonly number[];
}

const SIGNATURES: readonly Signature[] = [
  { type: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { type: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

/** The type the bytes really have, read from their first bytes (the "magic number"). */
export function sniff(data: Uint8Array): Signature | undefined {
  return SIGNATURES.find((s) => s.magic.every((byte, i) => data[i] === byte));
}

export interface IncomingFile {
  readonly filename: string;
  readonly contentType: string;
  readonly data: Uint8Array;
}

export interface CheckedFile {
  readonly data: Uint8Array;
  readonly type: string;
  readonly fileName: string;
}

export function checkFile(file: IncomingFile): CheckedFile {
  if (file.data.length === 0) throw new HttpError(400, "The file is empty");
  if (file.data.length > LIMITS.maxFileBytes) throw new HttpError(413, "The file is larger than 2 MB");
  const real = sniff(file.data);
  if (!real) throw new HttpError(415, "Only PNG, JPEG and PDF files are accepted");
  const declared = file.contentType.split(";")[0]!.trim().toLowerCase();
  if (declared !== real.type && declared !== "application/octet-stream") {
    throw new HttpError(415, `The file says it is ${declared}, but its content is ${real.type}`);
  }
  const base = sanitizeFilename(file.filename).replace(/\.[^.]*$/, "").slice(0, 100) || "file";
  return { data: file.data, type: real.type, fileName: `${base}.${real.ext}` };
}
```

## Content types: sniff, don't trust

The `Content-Type` of a file part is whatever the client wrote. A browser guesses it from the file's extension; an attacker writes whatever gets past you. The bytes themselves are harder to fake: most binary formats begin with a fixed **magic number**. A PNG always starts with the 8 bytes `89 50 4E 47 0D 0A 1A 0A`, a JPEG with `FF D8 FF`, a PDF with the text `%PDF-`. Reading those first bytes to find the real type is called **content sniffing**.

`checkFile` in `upload-policy.ts` uses the sniffed type as the truth. It accepts only an allow-list of formats, refuses a declared type that contradicts the bytes (except the generic `application/octet-stream`, which means "I don't know"), and gives the stored name the extension of the *real* type. Try it on honest and dishonest files:

check-files.tsNode.js only

```ts
import { HttpError } from "@zudojs/http";
import { checkFile } from "./upload-policy.js";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const pdf = new TextEncoder().encode("%PDF-1.7\n% quote for the printer\n");
const html = new TextEncoder().encode("<html><script>alert(document.cookie)</script></html>");

const cases = [
  { filename: "sitemap.png", contentType: "image/png", data: png },
  { filename: "invoice.pdf.exe", contentType: "application/pdf", data: pdf },
  { filename: "../../quote", contentType: "application/octet-stream", data: pdf },
  { filename: "cute-cat.png", contentType: "image/png", data: html },
  { filename: "cover.jpg", contentType: "image/jpeg", data: png },
  { filename: "empty.png", contentType: "image/png", data: new Uint8Array() },
  { filename: "scan.pdf", contentType: "application/pdf", data: new Uint8Array(3 * 1024 * 1024) },
];
for (const file of cases) {
  try {
    const checked = checkFile(file);
    console.log("accepted", checked.type.padEnd(16), checked.fileName);
  } catch (error) {
    if (error instanceof HttpError) console.log("refused ", error.statusCode, error.message);
  }
}
```

Output of `npx tsx check-files.ts`

```ts
accepted image/png        sitemap.png
accepted application/pdf  invoice.pdf.pdf
accepted application/pdf  quote.pdf
refused  415 Only PNG, JPEG and PDF files are accepted
refused  415 The file says it is image/jpeg, but its content is image/png
refused  400 The file is empty
refused  413 The file is larger than 2 MB
```

- `invoice.pdf.exe` really is a PDF, so it is accepted, but it is stored as `invoice.pdf.pdf`. The last extension always matches the content, so no one downloads an "exe".
- `../../quote` lost its path and gained the right extension. `sanitizeFilename` from `@zudojs/http` removes path separators, `.` and `..`, control characters and drive letters, and cuts overlong names.
- The "cat" is HTML: no known magic number, so 415. The "cover.jpg" is really a PNG pretending to be a JPEG: also 415, because a file that lies about itself is suspicious.
- Size is checked first, before any other work on the bytes.

> SOME FORMATS ARE CODE
>
> Never add SVG, HTML or XML to an image allow-list. An SVG image is XML and can contain `<script>`; opened from your domain, it runs like any page. If you must accept SVG, serve it from a separate domain, or convert it to PNG on upload. Magic numbers also only prove how a file *starts*: a file can be a valid PNG and carry something else later. For images, re-encoding them (decoding and saving a fresh PNG or JPEG with an image library) is the strongest check, and it removes metadata such as GPS positions too.

## Store, then record

Now the service. It turns a checked file into a stored object and a database row, and it is where the failure handling lives:

attachment.service.ts

```ts
import { randomUUID } from "node:crypto";
import { NotFoundError } from "@zudojs/errors";
import type { ObjectStorage } from "@zudojs/storage";
import type { AttachmentRepository, AttachmentRow } from "./attachments.js";
import { checkFile } from "./upload-policy.js";
import type { CheckedFile, IncomingFile } from "./upload-policy.js";

export interface AttachmentResponse {
  readonly id: number;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly url: string;
}

export function toAttachmentResponse(row: AttachmentRow): AttachmentResponse {
  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    size: row.size_bytes,
    url: `/attachments/${row.id}`,
  };
}

export class AttachmentService {
  constructor(
    private readonly files: ObjectStorage,
    private readonly attachments: AttachmentRepository,
  ) {}

  /** Checks every file first, then stores them; if one fails, the ones before it are removed. */
  async uploadAll(taskId: number, incoming: readonly IncomingFile[]): Promise<AttachmentResponse[]> {
    const checked = incoming.map(checkFile);
    const saved: AttachmentResponse[] = [];
    try {
      for (const file of checked) saved.push(await this.store(taskId, file));
      return saved;
    } catch (error) {
      for (const done of saved) await this.remove(done.id);
      throw error;
    }
  }

  /** Store the bytes, then record them. If recording fails, delete the bytes again. */
  private async store(taskId: number, file: CheckedFile): Promise<AttachmentResponse> {
    const key = `tasks/${taskId}/${randomUUID()}`;
    const stored = await this.files.put(key, file.data, {
      contentType: file.type,
      metadata: { taskId: String(taskId) },
    });
    try {
      const row = await this.attachments.create({
        task_id: taskId,
        object_key: key,
        file_name: file.fileName,
        content_type: file.type,
        size_bytes: stored.size,
        sha256: stored.etag ?? "",
      } as AttachmentRow);
      return toAttachmentResponse(row);
    } catch (error) {
      await this.files.delete(key);
      if ((error as { code?: string }).code === "23503") throw new NotFoundError(`Task ${taskId} not found`);
      throw error;
    }
  }

  async open(id: number): Promise<{ readonly row: AttachmentRow; readonly bytes: Uint8Array }> {
    const row = await this.attachments.findById(id);
    if (!row) throw new NotFoundError(`Attachment ${id} not found`);
    const object = await this.files.get(row.object_key);
    if (!object) throw new NotFoundError(`Attachment ${id} not found`);
    return { row, bytes: new Uint8Array(await object.arrayBuffer()) };
  }

  /** Forget the record first, then the bytes: a failure leaves an orphan, never a broken link. */
  async remove(id: number): Promise<void> {
    const row = await this.attachments.findById(id);
    if (!row) throw new NotFoundError(`Attachment ${id} not found`);
    await this.attachments.delete(id);
    await this.files.delete(row.object_key);
  }
}
```

Walk through the decisions:

- **The key is yours.** `tasks/1/<uuid>`: grouped by task so a prefix lists them, random so nobody can guess another file's key, and free of anything the user typed. The user's name lives in the database, as a label.
- **Check all, then store.** `uploadAll` runs `checkFile` on every file before storing any, so a bad third file does not leave the first two behind. If storing the second file fails, the first is removed: the request succeeds or fails as a whole.
- **Compensation.** Object storage and the database cannot share a transaction. When the `INSERT` fails after the `put`, the service undoes the `put` by hand. An action that undoes an earlier one is called a **compensating action**.
- **The foreign key decides whether the task exists.** PostgreSQL error `23503` becomes a 404. Checking "does the task exist?" before storing would save a little work, but the foreign key is what stays true if the task is deleted in between.
- **Removal runs in the other order**: row first, then bytes, so a failure in between leaves an orphan instead of a broken link.

The route reads the multipart body with `extractBoundary` and `parseMultipartBuffer`, passing the parser limits. **Multipart** (`multipart/form-data`) is the format browsers use to send a form with files: the body is split into parts by a **boundary** string named in the `Content-Type` header, and each part has its own small headers with a field name, a file name and a type. The route hands the files to the service:

server.ts

```ts
import {
  badRequest, createAttachmentDisposition, createNodeHttpAdapter, createResponseContext, createRouter,
  extractBoundary, HttpError, parseMultipartBuffer,
} from "@zudojs/http";
import type { HttpRouterContext } from "@zudojs/http";
import type { AttachmentService } from "./attachment.service.js";
import { LIMITS } from "./upload-policy.js";
import type { IncomingFile } from "./upload-policy.js";

function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw badRequest("The id must be a positive whole number");
  return id;
}

function readFiles(ctx: HttpRouterContext): IncomingFile[] {
  const boundary = extractBoundary(ctx.request.getHeader("content-type"));
  if (!boundary) throw new HttpError(415, "Send the files as multipart/form-data");
  const form = parseMultipartBuffer(Buffer.from(ctx.request.body as Uint8Array), boundary, {
    maxFileSize: LIMITS.maxFileBytes,
    maxFiles: LIMITS.maxFiles,
    maxFields: 10,
    maxFieldSize: 1024,
  });
  const files = form.files.filter((file) => file.fieldName === "file");
  if (files.length === 0) throw badRequest('Send at least one file in the field "file"');
  return files.map((file) => ({ filename: file.filename, contentType: file.contentType, data: file.data }));
}

export function createUploadRouter(service: AttachmentService) {
  const router = createRouter();

  router.post("/tasks/:id/attachments", async (ctx) => {
    const saved = await service.uploadAll(parseId(ctx.params.id), readFiles(ctx));
    return createResponseContext().setStatus(201).json(saved);
  });

  router.get("/attachments/:id", async (ctx) => {
    const { row, bytes } = await service.open(parseId(ctx.params.id));
    return createResponseContext()
      .setStatus(200)
      .setContentType(row.content_type)
      .setHeader("content-disposition", createAttachmentDisposition(row.file_name))
      .setHeader("x-content-type-options", "nosniff")
      .setHeader("cache-control", "private, max-age=0")
      .setBody(bytes);
  });

  return router;
}

export async function startServer(service: AttachmentService) {
  const router = createUploadRouter(service);
  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    maxBodySize: LIMITS.maxBodyBytes,
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await adapter.start();
  return { url: `http://127.0.0.1:${adapter.address?.port}`, stop: () => adapter.stop() };
}
```

Three details in `readFiles`: a request that is not multipart at all gets **415 Unsupported Media Type** instead of crashing on a missing boundary; only parts in the field `file` count; and the parser's limits cover form fields as well as files, because a form with 100,000 tiny text fields is also an attack.

Start the server and upload like a browser would. `FormData` and `Blob` are built into Node.js, and `fetch` turns a `FormData` body into `multipart/form-data` with a boundary by itself:

try-uploads.tsNode.js only

```ts
import { AttachmentService } from "./attachment.service.js";
import { startServer } from "./server.js";
import { setup } from "./setup.js";

const { db, files, attachments } = await setup();
const server = await startServer(new AttachmentService(files, attachments));

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const pdf = new TextEncoder().encode("%PDF-1.7\n% quote for the printer\n");
const html = new TextEncoder().encode("<script>alert(1)</script>");

async function upload(label: string, taskId: number, parts: [Uint8Array<ArrayBuffer>, string, string][]) {
  const form = new FormData();
  for (const [bytes, name, type] of parts) form.append("file", new Blob([bytes], { type }), name);
  const res = await fetch(`${server.url}/tasks/${taskId}/attachments`, { method: "POST", body: form });
  console.log(label, res.status, await res.text());
}

await upload("two files:", 1, [[png, "sitemap.png", "image/png"], [pdf, "Quote (final).pdf", "application/pdf"]]);
await upload("one bad of two:", 1, [[pdf, "brief.pdf", "application/pdf"], [html, "cat.png", "image/png"]]);
await upload("missing task:", 9, [[png, "plan.png", "image/png"]]);

const objects = (await files.list("tasks/")).objects;
console.log("objects stored:", objects.length, "rows:", await attachments.count());
const quote = objects.find((object) => object.contentType === "application/pdf");
console.log("the quote's object metadata:", quote?.metadata);
await server.stop();
await db.disconnect();
```

The two good files became two objects and two rows, and the response says where to fetch each one. The mixed request was refused as a whole before anything was stored. The upload to a missing task *was* stored, then the foreign key refused the row, and the compensation deleted the object: the count shows two objects for two rows, no orphan. The object's own metadata (its type and the task it belongs to) travels with the bytes, which helps when you inspect a bucket by hand; the database row stays the source of truth.

Now the limits over real HTTP. The adapter refuses the 8 MB body before your code sees a byte; the parser refuses the 3 MB file and the fourth file:

try-limits.tsNode.js only

```ts
import { AttachmentService } from "./attachment.service.js";
import { startServer } from "./server.js";
import { setup } from "./setup.js";

const { db, files, attachments } = await setup();
const server = await startServer(new AttachmentService(files, attachments));
const png = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Blob([bytes], { type: "image/png" });
};

async function send(label: string, body: FormData | string, headers: Record<string, string> = {}) {
  const res = await fetch(`${server.url}/tasks/1/attachments`, { method: "POST", body, headers });
  console.log(label.padEnd(20), res.status, await res.text());
}

const huge = new FormData();
huge.append("file", png(8 * 1024 * 1024), "poster.png");
await send("8 MB body:", huge);

const big = new FormData();
big.append("file", png(3 * 1024 * 1024), "scan.png");
await send("3 MB file:", big);

const many = new FormData();
for (let i = 1; i <= 4; i++) many.append("file", png(100), `shot-${i}.png`);
await send("4 files:", many);

const wrongField = new FormData();
wrongField.append("upload", png(100), "shot.png");
await send("wrong field:", wrongField);

await send("JSON body:", '{"file":"aGVsbG8="}', { "content-type": "application/json" });
console.log("objects stored:", (await files.list("tasks/")).objects.length);
await server.stop();
await db.disconnect();
```

Output of `npx tsx try-limits.ts`

```ts
8 MB body:           413 {"error":"Payload Too Large"}
3 MB file:           413 {"error":"Uploaded file exceeds the configured file size limit.","code":"ERR_HTTP_MULTIPART_LIMIT"}
4 files:             413 {"error":"Maximum number of uploaded files exceeded.","code":"ERR_HTTP_MULTIPART_LIMIT"}
wrong field:         400 {"error":"Send at least one file in the field \"file\"","code":"BAD_REQUEST"}
JSON body:           415 {"error":"Send the files as multipart/form-data","code":"UNSUPPORTED_MEDIA_TYPE"}
objects stored: 0
```

## Safe downloads

A stored file does harm when a browser treats it as a page. The download route sets four headers, and each one closes a door:

- `Content-Type` is the *sniffed* type from the database, never the client's claim.
- `X-Content-Type-Options: nosniff` tells the browser not to guess a different type from the content. Without it, some browsers "helpfully" render a text file that looks like HTML as HTML.
- `Content-Disposition: attachment; filename="…"` makes the browser save the file instead of opening it in your site's tab. `createAttachmentDisposition` builds it, sanitizing the name again and adding a `filename*` version for non-ASCII names.
- `Cache-Control: private` keeps shared caches (a company proxy, a CDN) from storing someone's private file.

try-download.tsNode.js only

```ts
import { createAttachmentDisposition } from "@zudojs/http";
import { AttachmentService } from "./attachment.service.js";
import { startServer } from "./server.js";
import { setup } from "./setup.js";

const { db, files, attachments } = await setup();
const service = new AttachmentService(files, attachments);
const server = await startServer(service);

const pdf = new TextEncoder().encode("%PDF-1.7\n% quote for the printer\n");
const [saved] = await service.uploadAll(1, [{ filename: "Devis façade.pdf", contentType: "application/pdf", data: pdf }]);

const res = await fetch(`${server.url}${saved!.url}`);
console.log(res.status, res.headers.get("content-type"), res.headers.get("x-content-type-options"));
console.log(res.headers.get("content-disposition"));
console.log("bytes match:", Buffer.from(await res.arrayBuffer()).equals(Buffer.from(pdf)));
console.log((await fetch(`${server.url}/attachments/99`)).status);

console.log(createAttachmentDisposition('report".pdf\r\nSet-Cookie: session=stolen'));
await server.stop();
await db.disconnect();
```

Output of `npx tsx try-download.ts`

```ts
200 application/pdf nosniff
attachment; filename="Devis facade.pdf"; filename*=UTF-8''Devis%20fa%C3%A7ade.pdf
bytes match: true
404
attachment; filename="report\".pdfSet-Cookie: session=stolen"
```

The French name arrives twice in the header: as plain ASCII in `filename` for old clients, and exactly, percent-encoded, in `filename*`. The last line shows why you never build this header by hand: a name with a quote and a line break would otherwise end the header and start a new one (**response splitting**), here setting a cookie. The helper escaped the quote and dropped the line break.

> TIP
>
> Images you want to show in the page, such as a task's cover, may be served `inline` instead (`createInlineDisposition`), but only for types you sniffed as images, always with `nosniff`. Big sites go one step further and serve all user files from a separate domain, so even a mistake cannot run in the main site's origin.

## Replacing a file: locks and fencing tokens

A task has one cover image, and replacing it is a read-modify-write: read the old key, store the new file, point the task at it, delete the old file. If two replacements overlap, both may read the same old key; one of the new files is then never referenced, and depending on timing the task can end up with the older of the two pictures.

A lock makes replacements take turns. `InMemoryLockManager` from [the storage lesson](https://zudojs.oyinlola.site/learn/zudo-storage#locking) gives each lock a `ttl`, so a crashed holder cannot block everyone forever. The price: a holder that is merely *slow* (a long garbage-collection pause, a slow network write to storage) can lose its lock without knowing and carry on. Each lock also carries a **fence**, a number that grows with every new lock on the resource. The protected resource, here the `tasks` row, remembers the highest fence it has seen and refuses any write that carries a lower one:

cover.service.ts

```ts
import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError } from "@zudojs/errors";
import type { Database, LockManager, ObjectStorage } from "@zudojs/storage";
import { checkFile } from "./upload-policy.js";
import type { IncomingFile } from "./upload-policy.js";

export class CoverService {
  constructor(
    private readonly db: Database,
    private readonly files: ObjectStorage,
    private readonly locks: LockManager,
    private readonly lockTtlMs = 5_000,
  ) {}

  async setCover(taskId: number, incoming: IncomingFile): Promise<string> {
    const file = checkFile(incoming);
    const lock = await this.locks.acquire(`task:${taskId}:cover`, { ttl: this.lockTtlMs, timeout: 1_000 });
    try {
      const key = `tasks/${taskId}/cover-${randomUUID()}`;
      await this.files.put(key, file.data, { contentType: file.type, metadata: { taskId: String(taskId) } });
      const result = await this.db.query<{ old_key: string | null }>({
        text: `UPDATE tasks t SET cover_key = $1, cover_fence = $2
                 FROM (SELECT id, cover_key AS old_key FROM tasks WHERE id = $3 FOR UPDATE) old
                WHERE t.id = old.id AND t.cover_fence < $2
                RETURNING old.old_key`,
        parameters: [key, lock.fence, taskId],
      });
      if (result.rowCount === 0) {
        await this.files.delete(key);
        const task = await this.db.query({ text: "SELECT 1 FROM tasks WHERE id = $1", parameters: [taskId] });
        if (task.rowCount === 0) throw new NotFoundError(`Task ${taskId} not found`);
        throw new ConflictError(`A newer cover for task ${taskId} was saved first`);
      }
      const oldKey = result.rows[0]?.old_key;
      if (oldKey) await this.files.delete(oldKey);
      return key;
    } finally {
      await lock.release();
    }
  }
}
```

The `UPDATE` is the heart of it. `t.cover_fence < $2` is the fence check, done by PostgreSQL in the same statement as the write, so there is no gap between checking and writing. The subquery reads the old key under a row lock (`FOR UPDATE`) and `RETURNING old.old_key` hands back the key this write replaced, not one read earlier, so the right old file is deleted. A write refused by the fence cleans up its own new object and answers 409.

Now make it happen. One replacement runs with a 30 ms lock and a storage write that takes 300 ms; while it is stuck, its lock expires and a second, normal replacement goes through:

try-fencing.tsNode.js only

```ts
import { BaseError } from "@zudojs/errors";
import { InMemoryLockManager } from "@zudojs/storage";
import type { ObjectStorage } from "@zudojs/storage";
import { CoverService } from "./cover.service.js";
import { setup } from "./setup.js";

const { db, files } = await setup();
const locks = new InMemoryLockManager();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const cover = (name: string) => ({ filename: name, contentType: "image/png", data: png });

const slowFiles: ObjectStorage = {
  put: async (key, data, options) => { await sleep(300); return files.put(key, data, options); },
  get: (key) => files.get(key),
  delete: (key) => files.delete(key),
  exists: (key) => files.exists(key),
  metadata: (key) => files.metadata(key),
  list: (prefix, options) => files.list(prefix, options),
};
const slowWorker = new CoverService(db, slowFiles, locks, 30);
const fastWorker = new CoverService(db, files, locks);

const slow = slowWorker.setCover(1, cover("first-draft.png")).then(
  () => console.log("slow worker: saved?!"),
  (error: BaseError) => console.log("slow worker:", error.statusCode, error.message),
);
await sleep(60);
const fastKey = await fastWorker.setCover(1, cover("final.png"));
console.log("fast worker: saved");
await slow;

const task = (await db.query<{ cover_key: string; cover_fence: number }>({
  text: "SELECT cover_key, cover_fence FROM tasks WHERE id = 1",
})).rows[0]!;
console.log("cover is the fast one:", task.cover_key === fastKey, "- fence", task.cover_fence);
console.log("objects for task 1:", (await files.list("tasks/1/")).objects.length);

await fastWorker.setCover(1, cover("final-v2.png"));
console.log("after replacing again:", (await files.list("tasks/1/")).objects.length, "object");
await db.disconnect();
```

Output of `npx tsx try-fencing.ts`

```ts
fast worker: saved
slow worker: 409 A newer cover for task 1 was saved first
cover is the fast one: true - fence 2
objects for task 1: 1
after replacing again: 1 object
```

The slow worker took the lock first (fence 1), then stalled in the storage write. Its lock expired at 30 ms, and the fast worker got a new lock (fence 2) and saved. When the slow worker finally tried to point the task at its image, the database saw fence 1 against a stored 2 and refused. The slow worker deleted its own object and got a 409. There is exactly one object left, the current cover; replacing it again deletes the old one.

Without the fence check, the slow worker's stale write would have landed last and silently replaced the newer cover. The lock alone cannot prevent that, because the lock had already expired when the stale write happened. **Only the resource can refuse a stale token**, which is why the check is in the `UPDATE`, not in the service.

> ONE PROCESS
>
> An `InMemoryLockManager` hands out locks and fences inside one process. Run two copies of the API and each has its own counter, so both can hold "the" lock with fence 1. Across servers, the fence must come from something they share: a PostgreSQL sequence or advisory lock ([the data architecture lesson](https://zudojs.oyinlola.site/learn/zudo-data-architecture#optimistic)), or a lock service over Redis. The database check stays the same.

## When the process dies halfway

Compensation handles failures your code sees. It cannot handle the ones it does not: the process is killed between `put` and `INSERT`, or the compensating `delete` itself fails because storage is briefly unreachable. Then an object exists that no row points at. These **orphans** waste space, and they may be private files nobody can delete through the API any more.

The cure is a **sweeper**: a background job that lists the objects, compares them with the keys the database references, and deletes the difference. Two rules make it safe. It only deletes objects older than a **grace period**, because an upload that is between its `put` and its `INSERT` right now also looks like an orphan. And it collects the keys before deleting, page by page, following `continuationToken`:

sweeper.ts

```ts
import type { ObjectStorage } from "@zudojs/storage";
import type { AttachmentRepository } from "./attachments.js";

export async function sweepOrphans(
  files: ObjectStorage,
  attachments: AttachmentRepository,
  graceMs: number,
  now: Date,
): Promise<string[]> {
  const orphans: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await files.list("tasks/", { maxKeys: 500, continuationToken });
    orphans.push(...page.objects
      .filter((object) => now.getTime() - object.lastModified.getTime() > graceMs)
      .map((object) => object.key));
    continuationToken = page.continuationToken;
  } while (continuationToken);

  const referenced = await attachments.referencedKeys();
  const toDelete = orphans.filter((key) => !referenced.has(key));
  for (const key of toDelete) await files.delete(key);
  return toDelete;
}
```

The referenced keys are read *after* the listing. An upload that finishes during the sweep is then either too young to be listed as a candidate, or already recorded when the keys are read.

try-sweeper.tsNode.js only

```ts
import { AttachmentService } from "./attachment.service.js";
import { setup } from "./setup.js";
import { sweepOrphans } from "./sweeper.js";

const { db, files, attachments } = await setup();
const service = new AttachmentService(files, attachments);
const pdf = new TextEncoder().encode("%PDF-1.7\n% brief\n");
await service.uploadAll(1, [{ filename: "brief.pdf", contentType: "application/pdf", data: pdf }]);

await files.put("tasks/1/crashed-before-insert", pdf, { contentType: "application/pdf" });
console.log("objects:", (await files.list("tasks/")).objects.length, "rows:", await attachments.count());

const inAnHour = new Date(Date.now() + 60 * 60 * 1000);
console.log("sweep with a 2 hour grace:", await sweepOrphans(files, attachments, 2 * 60 * 60 * 1000, inAnHour));
console.log("sweep with a 10 minute grace:", await sweepOrphans(files, attachments, 10 * 60 * 1000, inAnHour));
console.log("objects:", (await files.list("tasks/")).objects.length, "rows:", await attachments.count());
await db.disconnect();
```

Output of `npx tsx try-sweeper.ts`

```ts
objects: 2 rows: 1
sweep with a 2 hour grace: []
sweep with a 10 minute grace: [ 'tasks/1/crashed-before-insert' ]
objects: 1 rows: 1
```

The object left by the "crash" is an hour old in the sweeper's view. With a 2-hour grace period it is still considered possibly in progress and kept; with 10 minutes, it is deleted, and the recorded brief is untouched. Run the sweeper on a schedule, for example every night, with [the scheduler](https://zudojs.oyinlola.site/learn/zudo-scheduler) or a cron job, and log what it deletes: a sweeper that suddenly deletes thousands of objects is telling you about a bug.

## Testing with injected failures

The happy path is easy to test. The code that matters here is the code that runs when something breaks, and storage rarely breaks on demand. So make it: `ObjectStorage` is an interface, and a test can wrap the real storage in one that fails exactly when told to. This is called **fault injection**:

failures.test.tsNode.js only

```ts
import { strict as assert } from "node:assert";
import type { ObjectStorage } from "@zudojs/storage";
import { AttachmentService } from "./attachment.service.js";
import { setup } from "./setup.js";

function failing(real: ObjectStorage, failOn: { put?: number }): ObjectStorage {
  let puts = 0;
  return {
    put: async (key, data, options) => {
      puts += 1;
      if (puts === failOn.put) throw new Error("storage unavailable");
      return real.put(key, data, options);
    },
    get: (key) => real.get(key),
    delete: (key) => real.delete(key),
    exists: (key) => real.exists(key),
    metadata: (key) => real.metadata(key),
    list: (prefix, options) => real.list(prefix, options),
  };
}

const pdf = new TextEncoder().encode("%PDF-1.7\n% brief\n");
const file = (name: string) => ({ filename: name, contentType: "application/pdf", data: pdf });

async function test(name: string, body: () => Promise<void>) {
  try {
    await body();
    console.log("PASS", name);
  } catch (error) {
    console.log("FAIL", name, "-", (error as Error).message);
  }
}

await test("a failed second put leaves nothing behind", async () => {
  const { db, files, attachments } = await setup();
  const service = new AttachmentService(failing(files, { put: 2 }), attachments);
  await assert.rejects(service.uploadAll(1, [file("a.pdf"), file("b.pdf")]), /storage unavailable/);
  assert.equal((await files.list("tasks/")).objects.length, 0);
  assert.equal(await attachments.count(), 0);
  await db.disconnect();
});

await test("a missing task leaves no object", async () => {
  const { db, files, attachments } = await setup();
  await assert.rejects(new AttachmentService(files, attachments).uploadAll(42, [file("a.pdf")]), { statusCode: 404 });
  assert.equal((await files.list("tasks/")).objects.length, 0);
  await db.disconnect();
});

await test("stored bytes match their recorded hash", async () => {
  const { db, files, attachments } = await setup();
  const [saved] = await new AttachmentService(files, attachments).uploadAll(1, [file("a.pdf")]);
  const row = (await attachments.findById(saved!.id))!;
  const bytes = new Uint8Array(await (await files.get(row.object_key))!.arrayBuffer());
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
  assert.equal(hash, row.sha256);
  await db.disconnect();
});
```

Output of `npx tsx failures.test.ts`

```ts
PASS a failed second put leaves nothing behind
PASS a missing task leaves no object
PASS stored bytes match their recorded hash
```

The first test proves the "all or nothing" promise of `uploadAll` when the *second* storage write fails, a case you would never see by clicking around. The third checks that the `sha256` column really is the hash of the stored bytes; a nightly job can run the same check over all objects to detect corruption.

In your project, put these in Vitest: the policy cases as a table test (`it.each`), and the service tests with fresh `setup()` data in `beforeEach`. Also test the route with `fetch` for each status code in the flow diagram, as `try-limits.ts` did.

## Production concerns

- **Big files skip your server.** A buffered body costs memory for every upload in progress. For anything larger than a few megabytes, let the client upload straight to object storage (Amazon S3, Cloudflare R2, Google Cloud Storage) with a **presigned URL**: a short-lived URL your server signs, which allows one `PUT` of one key. The client then tells your API "done", and the API checks the object (size, sniffed type) before writing the row. [ZudoJS crypto](https://zudojs.oyinlola.site/learn/zudo-crypto) shows how signed, expiring values work.
- **A cloud `ObjectStorage`.** `LocalObjectStorage` is for development and single servers. With several servers, implement the same six methods over your cloud bucket; the service, sweeper and tests do not change.
- **Who may upload and download.** The routes here check nothing about the caller. Before going live, require a logged-in user ([authentication](https://zudojs.oyinlola.site/learn/zudo-auth)) and check they may see or change the task ([permissions](https://zudojs.oyinlola.site/learn/zudo-permissions)). An attachment id is not a secret.
- **Quotas and rate limits.** Limit uploads per user per minute and total bytes per task or per account, or one user can fill your disk legally, 2 MB at a time.
- **Malware scanning.** Files that other people download (shared documents, invoices) should be scanned, for example with ClamAV, before they are marked available. That is the "pending row" pattern: record the file as `pending`, scan it in a background job, then mark it `ready`.
- **Logs.** Log the task id, the object key, the size and the sniffed type. Never log file contents.

## Practice

TRY IT YOURSELF

### Accept GIF images

Add GIF to the allow-list. A GIF starts with the text `GIF87a` or `GIF89a`, so it needs two signatures. Write the new `SIGNATURES` entries and show that `sniff` recognises both versions and still refuses `GIF90a`.

**Show a solution**

gif.tsNode.js only

```ts
interface Signature {
  readonly type: string;
  readonly ext: string;
  readonly magic: readonly number[];
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const SIGNATURES: readonly Signature[] = [
  { type: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/gif", ext: "gif", magic: ascii("GIF87a") },
  { type: "image/gif", ext: "gif", magic: ascii("GIF89a") },
];

function sniff(data: Uint8Array): Signature | undefined {
  return SIGNATURES.find((s) => s.magic.every((byte, i) => data[i] === byte));
}

for (const start of ["GIF87a", "GIF89a", "GIF90a"]) {
  const bytes = new TextEncoder().encode(start + "\x01\x00\x01\x00");
  console.log(start, "->", sniff(bytes)?.type ?? "refused");
}
```

Output of `npx tsx gif.ts`

```ts
GIF87a -> image/gif
GIF89a -> image/gif
GIF90a -> refused
```

Writing the magic number as text with `ascii()` keeps it readable. Animated GIFs can be large and slow to decode; if you accept them, keep the size limit strict.

TRY IT YOURSELF

### A per-task quota

Limit each task to 5 attachments. Add a check to `AttachmentService.uploadAll` that counts the task's existing attachments and answers **409** with a clear message when the new files would go over. Which race does a count-then-insert check still have, and how would you close it?

**Show a solution**

quota.tsNode.js only

```ts
import { ConflictError } from "@zudojs/errors";
import { AttachmentService } from "./attachment.service.js";
import type { AttachmentResponse } from "./attachment.service.js";
import type { AttachmentRepository } from "./attachments.js";
import { setup } from "./setup.js";
import type { IncomingFile } from "./upload-policy.js";

const MAX_PER_TASK = 5;

class QuotaAttachmentService extends AttachmentService {
  constructor(files: ConstructorParameters<typeof AttachmentService>[0], private readonly repo: AttachmentRepository) {
    super(files, repo);
  }

  override async uploadAll(taskId: number, incoming: readonly IncomingFile[]): Promise<AttachmentResponse[]> {
    const existing = await this.repo.count({ task_id: taskId });
    if (existing + incoming.length > MAX_PER_TASK) {
      throw new ConflictError(`Task ${taskId} already has ${existing} of ${MAX_PER_TASK} attachments`);
    }
    return super.uploadAll(taskId, incoming);
  }
}

const { db, files, attachments } = await setup();
const service = new QuotaAttachmentService(files, attachments);
const pdf = new TextEncoder().encode("%PDF-1.7\n");
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ filename: `page-${i}.pdf`, contentType: "application/pdf", data: pdf }));

console.log((await service.uploadAll(1, many(3))).length, "saved");
try {
  await service.uploadAll(1, many(3));
} catch (error) {
  if (error instanceof ConflictError) console.log(error.statusCode, error.message);
}
console.log((await service.uploadAll(1, many(2))).length, "saved, total", await attachments.count({ task_id: 1 }));
await db.disconnect();
```

Output of `npx tsx quota.ts`

```ts
3 saved
409 Task 1 already has 3 of 5 attachments
2 saved, total 5
```

Two requests for the same task can both count 3 and both add 2, ending at 7. To close the race, take the count under a lock on the task (the per-task cover lock above, or `SELECT … FOR UPDATE` on the task row in a transaction), or keep an `attachment_count` column updated atomically with a `CHECK (attachment_count <= 5)`, so the database refuses the sixth.

TRY IT YOURSELF

### Delete an attachment

Add a `DELETE /attachments/:id` route that removes the row and the object and answers **204**, and 404 for an unknown id. Show that the object is gone afterwards.

**Show a solution**

delete-route.tsNode.js only

```ts
import { createNodeHttpAdapter, createResponseContext } from "@zudojs/http";
import { AttachmentService } from "./attachment.service.js";
import { createUploadRouter } from "./server.js";
import { setup } from "./setup.js";

const { db, files, attachments } = await setup();
const service = new AttachmentService(files, attachments);
const router = createUploadRouter(service);

router.delete("/attachments/:id", async (ctx) => {
  await service.remove(Number(ctx.params.id));
  return createResponseContext().setStatus(204);
});

const adapter = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 0,
  handler: async (request) => (await router.dispatch(request)).response,
});
await adapter.start();
const url = `http://127.0.0.1:${adapter.address?.port}`;

const [saved] = await service.uploadAll(1, [{ filename: "old.pdf", contentType: "application/pdf", data: new TextEncoder().encode("%PDF-1.7\n") }]);
console.log((await fetch(url + saved!.url, { method: "DELETE" })).status);
console.log((await fetch(url + saved!.url, { method: "DELETE" })).status);
console.log("objects left:", (await files.list("tasks/")).objects.length);
await adapter.stop();
await db.disconnect();
```

Output of `npx tsx delete-route.ts`

```ts
204
404
objects left: 0
```

The second `DELETE` gets 404 from `service.remove`. `Number("abc")` would be `NaN` here; in the real router, use `parseId` from `server.ts` so a bad id is a 400.

## Summary

- Everything in an upload is client input: name, type, size and bytes. Trust only what you check.
- Limit at three levels: `maxBodySize` in the adapter (before memory), parser limits in `parseMultipartBuffer` (files, fields), and your policy. Too big is 413, empty or malformed 400, a wrong type 415.
- Decide the type from the bytes (magic numbers), allow a short list, refuse files whose claim contradicts their content, and never allow formats that are code (SVG, HTML).
- Generate object keys; keep the cleaned user name only as a label. Store the bytes, then record them, and delete the bytes if the record fails. Remove in the other order.
- Serve downloads with the checked type, `nosniff`, `Content-Disposition: attachment` from `createAttachmentDisposition`, and `Cache-Control: private`.
- A lock with a TTL can expire under a slow holder. Give the lock's fence to the resource and let it refuse stale writes, in the same statement as the write.
- Crashes leave orphans; a sweeper with a grace period removes them. Test the failure paths by injecting failures into the storage interface.

That completes the data part of the course. Next, [ZudoJS crypto](https://zudojs.oyinlola.site/learn/zudo-crypto) opens the security and identity module with hashes, encryption and signed tokens.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
