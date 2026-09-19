---
title: "Package Rules"
description: "Conventions and constraints that all @zudojs packages must follow. File naming, folder organization, code style, imports, testing, and dependency direction."
source: https://zudojs.oyinlola.site/docs/rules
---

v1.0.0

# Package Rules

Internal development standards — file naming, folder organization, code style, and type ownership.

RULES STANDARDS CONVENTIONS

## File Naming Rules (Dot Notation)

All source files use dot notation to separate the domain prefix from the concern.

| Pattern | Example | Wrong |
| --- | --- | --- |
| Single-word prefix | http.error.ts | http-error.ts |
| Multi-word prefix | externalService.error.ts | external-service-error.ts |
| Types/interfaces | configManager.type.ts | config-manager-type.ts |
| Utilities | cryptoRandom.helper.ts | crypto-random-helper.ts |

```ts
<prefix>.<concern>.ts

prefix: Domain entity. PascalCase if multi-word.
concern: What the file contains: error, type, factory, helper,
  constant, interface, schema, utils, service, handler,
  manager, builder, validator, serializer.
```

## Folder Organization

> **Hard Limits**
>
> **Max 5 files per folder** (excluding index.ts). **Max 150 lines per file.** Violations must be fixed before merge.

Required

- Every src/ dir organized into related folders
- Every folder gets an index.ts barrel with JSDoc
- Folders may contain subfolders recursively
- camelCase for folder names

Split When

- File exceeds 150 lines → split by concern
- Folder exceeds 5 files → create subfolder
- Related files in same folder → group into subfolder

## Code Style Rules

Required

- Named exports only (no default exports)
- readonly on all interface properties
- Object.freeze() for immutable data
- JSDoc on all public API surfaces
- async/await exclusively

Forbidden

- No any — use unknown
- No var — use const/let
- No inline comments unless necessary
- No business logic in barrel index.ts
- No default exports

## Import Order Rules

```ts
// 1. Node.js built-ins
import { randomBytes } from "node:crypto";

// 2. External packages
import { z } from "zod";

// 3. Shared @zudojs/* packages
import { BaseError, ErrorCode } from "@zudojs/errors.js";

// 4. Internal imports (same package, with .js extension)
import { createEventBus } from "./eventBus/index.js";
```

## Testing Requirements

Framework

Vitest for all testing. Unit tests in packages/<name>/tests/. Integration tests in tests/integration/.

Required

All new code MUST include unit tests. Run typecheck and tests before every commit.

## Dependency Direction Rules

Dependencies flow inward. Foundation packages have no internal dependencies. Higher-level packages depend only on lower tiers.

```ts
errors, constants        ← Leaf packages (no internal deps)
    ↑
container, logger, events, crypto, validation, schema, config, middleware, types
    ↑
cqrs (depends on messaging, events)
    ↑
core (depends on all above)
```

> **Rule**
>
> Never create circular dependencies between packages. If you need functionality from a higher-layer package, move it to a lower-layer package.

## Type Ownership Rules

Every type has exactly one owner package. All consuming packages import from the owner — never duplicate types.

| Type | Owner | Import From |
| --- | --- | --- |
| EntityId, UserId, EventId | @zudojs/constants | import type { EventId } from "@zudojs/constants" |
| BaseError, ErrorCode | @zudojs/errors | import { ApplicationError } from "@zudojs/errors" |
| Logger, LogLevel | @zudojs/logger | import type { Logger } from "@zudojs/logger" |
| EventBus, EventHandler | @zudojs/events | import type { EventBus } from "@zudojs/events" |
| Container, Token | @zudojs/container | import type { Container } from "@zudojs/container" |
| Middleware, MiddlewareContext | @zudojs/middleware | import type { Middleware } from "@zudojs/middleware" |
| Maybe, DeepReadonly, isPlainObject | @zudojs/types | import { isPlainObject } from "@zudojs/types" |

> **Critical Rule**
>
> Before defining ANY type in a new package, check if it already exists in a shared package. If it does, import from the owner — never redefine.
