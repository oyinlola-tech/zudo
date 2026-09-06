# Zudojs

A modular TypeScript framework for building scalable, maintainable, and production-ready applications — backend, frontend, or fullstack.

---

## What is Zudojs?

Zudojs is a modular TypeScript application framework designed to provide a consistent foundation for building backend services, APIs, distributed systems, frontend applications, and fullstack platforms.

Instead of forcing applications into a single architecture, Zudojs provides independent packages for common infrastructure concerns such as dependency injection, configuration, HTTP, events, messaging, database access, queues, security, observability, and runtime lifecycle management.

Applications can use only the packages they need while maintaining consistent contracts across the ecosystem.

---

## Why Zudojs?

Modern applications often need more than an HTTP server.

As systems grow, concerns such as configuration, dependency injection, background jobs, events, messaging, transactions, observability, security, storage, multi-tenancy, and feature flags need to work together consistently.

Zudojs provides a modular foundation for these concerns without requiring every application to adopt the same runtime or deployment model.

---

## Core Philosophy

### Modular

Use only what the application needs. Every package is independent.

```
Application
     |
     +-- @zudojs/core
     +-- @zudojs/http
     +-- @zudojs/database
     +-- @zudojs/events
```

No need to install everything.

### Explicit

Dependencies and lifecycle behavior should be visible. Avoid invisible magic.

### Composable

Packages work independently but integrate naturally.

```
HTTP
 |
 v
Runtime
 |
 +-- Container
 +-- Configuration
 +-- Logger
 +-- Events
 +-- Observability
```

### Infrastructure-Neutral

The application is not tightly coupled to a specific database, queue, cloud provider, or storage backend. The `@zudojs/adapters` package defines the boundary between Zudojs and external platforms.

---

## Features

- Modular package architecture
- Dependency injection container
- Application lifecycle management
- Type-safe configuration
- Structured logging
- HTTP primitives and routing
- Event-driven architecture
- CQRS primitives
- Database abstractions
- Background jobs and queues
- Messaging infrastructure
- Storage adapters
- Cryptographic utilities
- Serialization
- Schema contracts
- Security primitives
- Observability and tracing
- Multi-tenancy
- Feature flags
- **Fullstack project generation**
- **11 frontend framework adapters**

---

## Architecture

```
                           Application
                                |
                                v
                            Runtime
                                |
             +------------------+------------------+
             |                  |                  |
             v                  v                  v
         Container          Lifecycle           Config
             |                  |                  |
             +------------------+------------------+
                                |
           +-------------------+-------------------+
           |                   |                   |
           v                   v                   v
          HTTP              Database             Queue
           |                   |                   |
           v                   v                   v
         Router             Storage           Messaging
```

Zudojs is organized as an npm workspaces monorepo. Each package has a focused responsibility and a clear dependency boundary.

---

## Packages

### Foundation

| Package               | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `@zudojs/core`       | Lifecycle, context, runtime, modules                  |
| `@zudojs/runtime`    | Application lifecycle orchestrator                    |
| `@zudojs/container`  | DI container with token-based registration            |
| `@zudojs/config`     | Layered configuration with sources                    |
| `@zudojs/errors`     | Shared error base class and utilities                 |
| `@zudojs/validation` | Schema validation with Zod                            |
| `@zudojs/logger`     | Structured logging with transports                    |
| `@zudojs/lifecycle`  | State machine, dependency ordering, graceful shutdown |
| `@zudojs/constants`  | Shared constants, enums, and type-safe literals       |
| `@zudojs/types`      | Shared type guards and utility types                  |
| `@zudojs/middleware` | Composable middleware pipeline                        |

### Application

| Package                  | Description                                |
| ------------------------ | ------------------------------------------ |
| `@zudojs/http`          | HTTP primitives, request handling, routing |
| `@zudojs/schema`        | Schema definition and parsing engine       |
| `@zudojs/serialization` | Data translation layer                     |
| `@zudojs/cqrs`          | Command query responsibility segregation   |
| `@zudojs/cli`           | Command-line interface                     |

### Data and Infrastructure

| Package                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `@zudojs/database`     | Database clients, repositories, transactions |
| `@zudojs/storage`      | Storage abstractions and lifecycle           |
| `@zudojs/queue`        | Background job infrastructure                |
| `@zudojs/messaging`    | In-process message bus                       |
| `@zudojs/transactions` | Transaction lifecycle and coordination       |
| `@zudojs/cache`        | Cache abstraction with adapters              |

### Security

| Package                | Description                                 |
| ---------------------- | ------------------------------------------- |
| `@zudojs/security`    | Input validation, CORS, CSRF, rate limiting |
| `@zudojs/crypto`      | Cryptographic primitives                    |
| `@zudojs/auth`        | JWT, sessions, password hashing             |
| `@zudojs/permissions` | RBAC, ABAC, resource authorization          |

### Platform

| Package                  | Description                           |
| ------------------------ | ------------------------------------- |
| `@zudojs/observability` | Metrics, tracing, context propagation |
| `@zudojs/tenancy`       | Multi-tenant context and isolation    |
| `@zudojs/feature-flags` | Feature flag evaluation and rollouts  |
| `@zudojs/adapters`      | Boundary layer for external platforms |

### Development

| Package            | Description                   |
| ------------------ | ----------------------------- |
| `@zudojs/testing` | Test helpers, fixtures, mocks |
| `@zudojs/docs`    | Documentation infrastructure  |

---

## CLI — Project Generation

Zudojs includes a CLI for scaffolding projects, adding features, and managing architecture.

### Installation

```bash
npm install -g zudojs-cli
```

### Supported Frontend Frameworks

Zudojs can generate frontend and fullstack projects with any of the following frameworks:

| Framework    | Adapter        | Build Tool  | Language |
| ------------ | -------------- | ----------- | -------- |
| React        | `react`        | Vite        | TS / JS  |
| Next.js      | `next`         | Next.js     | TS / JS  |
| Vue          | `vue`          | Vite        | TS / JS  |
| Nuxt         | `nuxt`         | Nuxt 3      | TS / JS  |
| Angular      | `angular`      | Angular CLI | TS / JS  |
| Svelte       | `svelte`       | Vite        | TS / JS  |
| SvelteKit    | `sveltekit`    | SvelteKit   | TS / JS  |
| Astro        | `astro`        | Astro       | TS / JS  |
| Vanilla HTML | `vanilla`      | Vite        | TS / JS  |
| Flutter      | `flutter`      | Flutter SDK | Dart     |
| React Native | `react-native` | Expo        | TS / JS  |

### Frontend Architectures

Each framework supports multiple project structures:

- **Zudojs Standard** — Global concerns organized by domain (`components/`, `services/`, `utils/`, `types/`, etc.)
- **Feature Based** — Domain-driven feature folders with shared global utilities
- **Minimal** — Only essential folders for small projects
- **Framework Default** — Let the framework decide the structure

### How Frontend Generation Works

When you create a frontend or fullstack project, Zudojs:

1. **Scaffolds the framework** using the official project template (Vite, Next.js CLI, Angular CLI, etc.)
2. **Applies Zudojs structure** on top of the generated project:
   - Standardized folder layout based on the selected architecture
   - Type-safe service layer with dependency injection
   - API client configuration (REST, GraphQL, or RPC)
   - Environment variable management
   - Build and development scripts
3. **Configures the workspace** for fullstack projects:
   - Monorepo structure with `apps/backend` and `apps/web`
   - Shared TypeScript configuration
   - Proxy configuration for local API development
   - Shared type definitions between frontend and backend

### How Fullstack Generation Works

Fullstack projects combine a backend API with a frontend application in a single workspace:

```bash
zudojs create my-system \
  --type fullstack \
  --architecture modular-monolith \
  --frontend next \
  --database postgresql \
  --api rest \
  --package-manager pnpm
```

This creates:

```
my-system/
├── apps/
│   ├── web/              # Frontend application
│   │   ├── src/
│   │   ├── package.json
│   │   └── ...
│   └── gateway/          # Backend API gateway (microservice)
│       ├── src/
│       ├── package.json
│       └── ...
├── packages/
│   └── shared/           # Shared types and utilities
├── package.json          # Workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

For **modular-monolith** and **monolith** architectures, the backend lives under `apps/backend/` instead of `apps/gateway/`.

### Frontend-Backend Integration

Zudojs configures the generated frontend to communicate with the backend:

- **Development proxy** — API requests are proxied to the backend during development
- **Type-safe client** — Generated API client from backend schema (when using OpenAPI)
- **Shared types** — Common TypeScript types in the workspace `packages/shared/` directory
- **Environment management** — Separate `.env` files for development, staging, and production

### Creating a Project

#### Backend Only

```bash
zudojs create my-api
```

Options:

```bash
zudojs create my-api \
  --architecture monolith \
  --package-manager pnpm \
  --database postgresql \
  --api rest
```

#### Frontend Only

```bash
zudojs create my-web \
  --type frontend \
  --frontend react \
  --frontend-architecture zudojs-standard
```

#### Full Stack

```bash
zudojs create my-system \
  --type fullstack \
  --architecture modular-monolith \
  --frontend next \
  --database postgresql \
  --api rest \
  --package-manager pnpm
```

### Adding Features

After project creation, add capabilities:

```bash
zudojs add queue
zudojs add database
zudojs add cache
zudojs add storage
```

### Development Server

```bash
zudojs dev
```

Starts all applications in the workspace with a single command.

- **Backend only** — Starts the API server with hot reload
- **Frontend only** — Starts the frontend dev server
- **Fullstack** — Starts both backend and frontend concurrently

Options:

```bash
zudojs dev --frontend-only   # Start only the frontend
zudojs dev --backend-only    # Start only the backend
zudojs dev --port 3000       # Custom port for backend
```

---

## Quick Start

### Backend

```ts
import { createApplication } from "@zudojs/runtime";
import { createHTTPServer } from "@zudojs/http";

const app = await createApplication();

const server = createHTTPServer({ app });

server.get("/", () => {
  return { message: "Hello from Zudojs" };
});

await app.start();
```

### Fullstack

```bash
# Create a fullstack project
zudojs create my-fullstack-app \
  --type fullstack \
  --frontend react \
  --architecture monolith

# Navigate and start
cd my-fullstack-app
pnpm dev
```

---

## Project Status

Zudojs is currently under active development.

The public API may change before the first stable release. Use packages with caution in production.

| Status       | Description                     |
| ------------ | ------------------------------- |
| Built        | Package implementation complete |
| Beta         | API may change                  |
| Experimental | Not recommended for production  |

All published packages are at version `0.1.x` and marked as **Built**.

---

## Installation

Zudojs packages can be installed individually.

```bash
pnpm add @zudojs/core
```

Install additional packages depending on the application requirements.

```bash
pnpm add @zudojs/http @zudojs/config @zudojs/logger
```

---

## Development

### Prerequisites

- Node.js >= 24
- pnpm >= 11

### Setup

```bash
git clone https://github.com/oyinlola-tech/zudo.git
cd zudojs
pnpm install
pnpm run build
```

### Useful Commands

```bash
pnpm run build          # Build all packages
pnpm run typecheck      # Typecheck all packages
pnpm run format         # Format code with Prettier
pnpm run test           # Run architect tests
```

### Per-Package Commands

```bash
pnpm run --filter=@zudojs/http typecheck
pnpm run --filter=@zudojs/http build
```

---

## Contributing

Contributions are welcome.

Before submitting a contribution, please read the contribution guidelines.

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Security

If you discover a security vulnerability, please do not open a public issue.

See [SECURITY.md](./SECURITY.md) for instructions on responsible vulnerability disclosure.

---

## Supporting ZudoJS

ZudoJS is an open-source framework maintained by independent developers and contributors. It provides a modular foundation for building production-ready applications across backend, frontend, and fullstack architectures.

Sponsorship helps support:

- Core framework development
- CLI tooling and developer experience
- Official packages and integrations
- Documentation and guides
- Bug fixes and maintenance
- Security updates and patches
- Performance improvements
- Community infrastructure
- Long-term sustainability of the ecosystem

If ZudoJS helps your project, consider supporting its development.

[Become a Sponsor](https://github.com/sponsors/oyinlola-tech)

---

## License

Zudojs is licensed under the MIT License.

See [LICENSE](./LICENSE) for details.
