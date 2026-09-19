# @zudojs/docs

## 1.0.2

### Patch Changes

- Round 10 audit fixes.

  - `stripMarkdown` runs in linear time; 2 KB of newlines used to block for ~6 s (tooling/DOCS-01).
  - `validateLinks` scans in linear time; a 99 KB document used to take ~30 s under the 100 KB scan cap (tooling/DOCS-02).
  - Frontmatter `tags` always parses to a string array (`tags: http` → `["http"]`, `tags:` → `[]`, `tags: [a, b]` → `["a", "b"]`); `createDocument` no longer spreads a string tag into characters. Empty arrays/objects serialize as `[]`/`{}` and round-trip (tooling/DOCS-03).
  - Structured-node markdown generation HTML-escapes text (`&`, `<`, `>`) outside code blocks and writes links whose scheme is not http, https, mailto, tel, ftp or ftps as plain text; `validateLinks`/`validateAll` report such links as `UNSAFE_LINK` errors (tooling/DOCS-04).
  - Visibility filtering fails closed: only an unset or exactly `"CLIENT"` visibility reaches the `"CLIENT"` filter and `generateIndex`; every other value (e.g. `"server"`) is treated as server-only (tooling/DOCS-05).
  - `parseFrontmatter` removes only the single blank separator line after the block, keeping body indentation and further blank lines; numeric literals become numbers only when the conversion is lossless (`1e+21` and `1.5e-7` round-trip, `007` stays a string) (tooling/DOCS-06).

  Behaviour changes: structured paragraphs/tables/quotes/lists/headings are HTML-escaped; `javascript:`/`data:` links become plain text and fail validation; `getAll({ visibility: "SERVER" })` also returns documents with unrecognised visibility; frontmatter bodies are no longer left-trimmed.

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - `nodesToMarkdown` no longer resolves an unknown callout `kind` such as `"constructor"` through `Object.prototype`; the label is the upper-cased kind instead of a function's source text.
  - `deepFreezeClone` (and therefore `createDocument` and the registry) no longer freezes the caller's nested objects in place when the value cannot be structured-cloned; the fallback now copies plain objects, arrays and Dates recursively.
  - `validateNavigation` reports `NAVIGATION_DUPLICATE_DOCUMENT` when the same navigation node object is mounted in more than one place.
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
