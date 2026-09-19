---
"@zudojs/storage": patch
---

Round 10 fixes:

- INF-02: `LocalObjectStorage` keys are opaque. A key with a `.`, `..` or empty path segment (`tenantA/../tenantB/x`, `./x`, `a//b`, including `\`-separated forms) is refused with `STORAGE_PATH_TRAVERSAL` / `STORAGE_INVALID_KEY` instead of being normalised, so `${tenant}/${userKey}` can no longer cross into another tenant's prefix.
- INF-03: the reserved `.zudo-object-meta` directory is checked after resolution as well as on the raw key, so metadata sidecars can no longer be forged (for example, flipping another object's `contentType` to `text/html`).
- INF-14: `get`, `exists` and `metadata` return `null`/`false` only for ENOENT, ENOTDIR and EISDIR. Any other I/O error (EACCES, EIO, ELOOP, EMFILE) throws `StorageError` with code `ERR_STORAGE_READ`, with the original error as its cause.

Behaviour changes: keys containing dot or empty segments now throw. Non-"missing" I/O errors now throw from `get`/`exists`/`metadata` instead of reading as absent.
