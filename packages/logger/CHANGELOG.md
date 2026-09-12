# @zudojs/logger

## 1.1.0

### Minor Changes

- - A `redact.pattern` carrying the `g` or `y` flag no longer alternates between redacting and leaking a secret-named field on consecutive entries.
  - Per-call `context` passed to `logger.log(level, message, { context })` is merged into the entry's metadata, so it reaches text formatters instead of being silently dropped; it is redacted like any other metadata.
  - `entry.context` now carries the active context's identifiers (`requestId`, `traceId`, ...) that its type always declared; the text formatter never prints an identifier twice.
  - `throwTransportErrors: true` now surfaces failures from asynchronous transports (and from `asynchronous: true` loggers): they are rethrown by the next `flush()` or `close()`, which still flush and close the transports first. Previously such failures were swallowed.
  - The buffered transport's flush timer is `unref`'d, so a finished process no longer stays alive for a full `flushInterval`.
  - Concurrent `logger.close()` calls share one closure instead of flushing and closing every transport twice.
  - README: the log-injection example contained a raw ESC control byte where the text `\u001b` was meant.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1

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
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
