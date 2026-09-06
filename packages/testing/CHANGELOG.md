# @zudojs/testing

## 0.0.3

### Patch Changes

- Updated dependencies [[`641c4c5`](https://github.com/oyinlola-tech/zudo/commit/641c4c5f9616d73e150b1598ae1b4abf05de23e4)]:
  - @zudojs/http@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [[`8d91db6`](https://github.com/oyinlola-tech/zudo/commit/8d91db68f93219803db971f2f855ec55af6c8dbf)]:
  - @zudojs/http@0.0.2

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
  - @zudojs/config@1.0.0
  - @zudojs/constants@1.0.0
  - @zudojs/container@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/events@1.0.0
  - @zudojs/http@1.0.0
  - @zudojs/logger@1.0.0
  - @zudojs/messaging@1.0.0
  - @zudojs/middleware@1.0.0
  - @zudojs/queue@1.0.0
  - @zudojs/security@1.0.0
  - @zudojs/serialization@1.0.0
  - @zudojs/storage@1.0.0
  - @zudojs/types@1.0.0
  - @zudojs/validation@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/config@0.1.2
  - @zudojs/logger@0.1.2
  - @zudojs/container@0.1.2
  - @zudojs/events@0.1.2
  - @zudojs/messaging@0.1.2
  - @zudojs/middleware@0.1.2
  - @zudojs/validation@0.1.2
  - @zudojs/serialization@0.1.2
  - @zudojs/http@0.1.2
  - @zudojs/queue@0.1.2
  - @zudojs/security@0.1.2
  - @zudojs/storage@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/config@0.1.1
  - @zudojs/logger@0.1.1
  - @zudojs/container@0.1.1
  - @zudojs/events@0.1.1
  - @zudojs/messaging@0.1.1
  - @zudojs/middleware@0.1.1
  - @zudojs/validation@0.1.1
  - @zudojs/serialization@0.1.1
  - @zudojs/http@0.1.1
  - @zudojs/queue@0.1.1
  - @zudojs/security@0.1.1
  - @zudojs/storage@0.1.1
