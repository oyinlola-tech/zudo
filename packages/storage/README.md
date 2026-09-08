# @zudojs/storage

Storage abstractions including database, object storage, repository, serialization, locking, and lifecycle.

## Installation

```bash
npm install @zudojs/storage
```

## Quick Start

```typescript
import { BaseRepository, LocalObjectStorage } from "@zudojs/storage";
import type { Database } from "@zudojs/storage";

interface User extends Record<string, unknown> {
  id: string;
  email: string;
}

// Pass `columns` so a request body cannot introduce a column name of its own.
const users = new BaseRepository<User, string>(database, {
  tableName: "users",
  columns: ["id", "email"],
});

const user = await users.findById("u_1");
const page = await users.findAll({ orderBy: "email", limit: 20, offset: 0 });

const files = new LocalObjectStorage("/var/data/uploads");
await files.put("avatars/u_1.png", bytes, { contentType: "image/png" });
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
- `LocalObjectStorage` resolves its base path once and checks containment by
  path rather than by string prefix, then verifies the real path so a symlink
  inside the store cannot redirect a read or write out of it.
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
