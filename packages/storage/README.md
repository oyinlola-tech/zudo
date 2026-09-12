# @zudojs/storage

Storage abstractions including database, object storage, repository, serialization, locking, and lifecycle.

## Installation

```bash
npm install @zudojs/storage
```

## Quick Start

Object storage, locking and health checking need no driver, so this runs as
written:

```typescript
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryLockManager, LocalObjectStorage } from "@zudojs/storage";

const files = new LocalObjectStorage(await mkdtemp(join(tmpdir(), "uploads-")));

// Attributes are persisted, so `get` and `list` report them too.
await files.put("avatars/u_1.png", new TextEncoder().encode("PNG…"), {
  contentType: "image/png",
  metadata: { uploadedBy: "u_1" },
});

const avatar = await files.metadata("avatars/u_1.png");
console.log(avatar?.contentType, avatar?.metadata, avatar?.etag);

const page = await files.list("avatars/", { maxKeys: 50 });
console.log(page.objects.map((object) => object.key), page.isTruncated);

// A lock hands back a fence token: pass it to the resource you protect and
// reject writes carrying a stale one, in case the lock expired mid-work.
const locks = new InMemoryLockManager();
const lock = await locks.acquire("billing:u_1", { ttl: 5_000 });
try {
  console.log("holding lock", lock.lockId, "fence", lock.fence);
} finally {
  await lock.release();
}
```

### Repositories

`BaseRepository` builds parameterised SQL against any `Database` you supply —
the package ships the contract, your driver supplies the connection:

```typescript
import { BaseRepository } from "@zudojs/storage";
import type { Database } from "@zudojs/storage";

interface User extends Record<string, unknown> {
  id: string;
  email: string;
}

declare const database: Database;

// Pass `columns` so a request body cannot introduce a column name of its own.
const users = new BaseRepository<User, string>(database, {
  tableName: "users",
  columns: ["id", "email"],
});

const user = await users.findById("u_1");
const page = await users.findAll({ orderBy: "email", limit: 20, offset: 0 });
```

## Features

- Unified storage abstraction with driver-independent interfaces
- Connection pooling with backpressure and a bounded wait queue
- Repository pattern with SQL identifier validation
- Object storage with path containment, size limits, and atomic writes
- Serialization support
- Distributed-style locking with fencing tokens
- Lifecycle and health-check coordination

## Safety Notes

- Every SQL identifier — table, primary key, column, sort column — is validated
  before it reaches a query. `limit` and `offset` are bound as parameters.
  Supply `columns` to narrow writes and filters to an explicit allowlist.
- `LocalObjectStorage` persists `contentType`, `cacheControl` and user
  metadata alongside the object and computes a SHA-256 `etag`, so `get`,
  `metadata` and `list` report what was stored rather than nothing. The
  attributes live under the reserved `.zudo-object-meta` directory, which is
  excluded from listings and refused as an object key.
- `LocalObjectStorage` resolves its base path once and checks containment by
  path rather than by string prefix, then verifies the real path so a symlink
  inside the store cannot redirect a read or write out of it. A base directory
  that is itself reached through a symlink (macOS's `tmpdir()`, a mounted
  volume) is fine: containment is checked against its real location.
- `ConnectionPool` reserves a slot before awaiting the factory, so concurrent
  `acquire()` calls cannot overshoot `max`, and ignores a connection released
  twice rather than handing it to two callers.
- A lock can expire while its holder is still working. Pass `Lock.fence` to the
  protected resource and reject writes carrying a stale one.

## Use Cases

- Unified data access layer
- File and object storage
- Locking for distributed systems
- Coordinated startup, drain, and shutdown
