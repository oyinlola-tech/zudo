# @zudojs/container

## 1.1.0

### Minor Changes

- - A `useExisting` alias of a cached (`SINGLETON`/`SCOPED`) target is no longer tracked as a second owner of the target's instance: the instance is disposed exactly once on `container.dispose()`, and a `SCOPED` alias of a `SINGLETON` no longer lets `scope.dispose()` dispose the container-owned singleton. A `TRANSIENT` target captured by a cached alias is still tracked through the alias.
  - `replace()`/`remove()` of a token now also evicts every cached `useExisting` alias that points at it, so `resolve(alias)` returns the new instance instead of the old, already-disposed one.
  - `container.dispose()` marks the container disposed before any cleanup runs: a `resolve()` racing the disposal throws instead of creating a singleton that was then dropped without disposal, and concurrent `dispose()` calls (container and scope) share the in-flight disposal instead of settling early. `ContainerLifecycle.dispose()` likewise refuses `track()` while a full disposal is in flight.
  - `CircularDependencyError`, `DuplicateRegistrationError`, `RegistrationNotFoundError` and `ProviderResolutionError` are re-exported from `@zudojs/container`, as the README implied.

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
