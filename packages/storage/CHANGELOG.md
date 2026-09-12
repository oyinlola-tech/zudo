# @zudojs/storage

## 1.1.0

### Minor Changes

- - `LocalObjectStorage` now works when its base directory is reached through a symlink (macOS `tmpdir()`, mounted volumes). Containment compares the real path of the base with the real path of the target; previously every key was rejected as a path traversal.
  - `ConnectionPool.release()` no longer strands a parked waiter when the released connection is retired for exceeding `maxLifetime`: a fresh connection is created and handed to the waiter, or the waiter is rejected with the factory's error instead of timing out.
  - `BaseRepository.update()` throws `NotFoundError` (`STORAGE_ENTITY_NOT_FOUND`) when no row matched, instead of resolving `undefined` typed as the entity.
  - `LocalObjectStorage.exists()` returns `false` and `metadata()` returns `null` for the directory created by a nested key (`put("a/b.txt")` no longer makes `exists("a")` true).
  - An oversized streamed `put()` now cancels the source stream when the byte budget is exceeded, instead of only releasing the reader.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/serialization@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Close SQL injection and path traversal, and make the connection pool actually bound itself.

  These are behavioural changes. Code that compiles unchanged may now throw where
  it previously built a query or touched a file.

  **`BaseRepository` no longer interpolates untrusted identifiers.** `create`,
  `update` and `count` concatenated the _keys_ of the object they were given
  straight into SQL, and `findAll` interpolated `orderBy`, `limit` and `offset`
  raw. Values were parameterised, which made the code look safe, but the
  identifier positions were not — and the idiomatic call for all four is
  `repo.create(req.body)` or `repo.findAll({ orderBy: req.query.sort })`. Every
  identifier now passes a strict `^[A-Za-z_][A-Za-z0-9_]*$` check and `limit` /
  `offset` must be safe non-negative integers, bound as parameters rather than
  interpolated. Pass `columns` to the constructor to narrow it further to an
  explicit allowlist. Repositories whose column names contain anything outside
  that character class must now quote them explicitly.

  **`LocalObjectStorage` containment is separator-aware.** The traversal guard
  compared `resolved.startsWith(basePath)`, which admits any sibling directory
  whose name merely begins with the base name: with a base of `/data/store`, the
  key `../store-secrets/creds.txt` resolved inside `/data/store-secrets` and
  passed. Containment is now a path comparison, the base is resolved to an
  absolute path at construction, and the real path is checked so a symlink
  planted inside the store cannot redirect a read or write out of it.

  **Object writes are bounded and atomic.** `put` buffered an entire stream into
  memory with no limit; it now enforces `maxObjectBytes` (64 MiB by default,
  configurable) and commits through a temp-file rename, so a crash or a
  concurrent write can no longer leave a truncated object under a live key. An
  oversized payload throws with a 413.

  **`list` paginates.** `continuationToken` was accepted and ignored, so callers
  looping on `isTruncated` received the first page forever. Listing is now
  key-ordered and cursor-based, and `maxKeys` bounds returned objects rather than
  raw directory entries.

  **The connection pool respects `max`.** The limit was checked before the
  factory was awaited and the slot was only claimed afterwards, so concurrent
  `acquire()` calls all saw the same under-limit count — 20 concurrent acquires
  against `max: 3` opened 20 connections. Slots are now reserved across the
  await, and callers beyond the limit queue in FIFO order and are handed a
  connection directly by `release()` instead of failing to be bounded at all.
  `acquire()` past `acquireTimeout` now rejects with a `StorageError`.

  **`release()` validates ownership.** Releasing a connection twice, or releasing
  one this pool never issued, pushed it into the idle list again and handed the
  same connection to two concurrent callers. Such a release is now ignored.

  **Other corrections.** `initialize()` is idempotent; `healthCheck()` no longer
  grows the pool; `delete()` on a missing key is a no-op instead of throwing
  `ENOENT`; `StorageLifecycleManager` restores its phase when initialization
  fails and reports an `AggregateError` rather than abandoning a drain on the
  first rejection; an empty `HealthChecker` reports unhealthy instead of green.

  **`Lock` gained `fence` and `isHeld()`, and `LockOptions` fields are optional.**
  A lock can expire while its holder is still working; the fence is a
  monotonically increasing token to pass to the protected resource so a
  superseded holder's write can be rejected. `extend()` now throws once the lock
  is lost rather than silently doing nothing, and waiters are woken on release
  instead of polling to their deadline.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/serialization@0.2.0
  - @zudojs/types@0.2.0

## 1.0.0

### Major Changes

- [`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - BREAKING CHANGE: Rename all packages from `@zudojs/*` to `@zudojs/*` and `@zudojs/cli` to `zudojs-cli`.

  - Scoped packages: `@zudojs/adapters`, `@zudojs/api`, `@zudojs/auth`, etc.
  - CLI package: `zudojs-cli` (unscoped)
  - All internal imports, docs, CI, and examples updated

  Migration:

  ```bash
  # Old
  npm install @zudojs/cli
  npm install @zudojs/errors

  # New
  npm install zudojs-cli
  npm install @zudojs/errors
  ```

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/constants@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/serialization@1.0.0
  - @zudojs/types@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/serialization@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/serialization@0.1.1
