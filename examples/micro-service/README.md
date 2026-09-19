# CampusFlow - Microservice Architecture Example

A University Learning & Assessment Platform demonstrating Zudojs's distributed microservice architecture with 5 independently deployable services.

## Architecture

```
┌─────────┐     ┌───────────┐     ┌──────────────┐
│  Client  │────▶│  Gateway  │────▶│   Identity   │
│          │     │  :3000    │     │    :3001     │
└─────────┘     └─────┬─────┘     └──────────────┘
                      │
              ┌───────┼───────┐
              ▼       ▼       ▼
        ┌─────────┐ ┌─────────┐ ┌──────────────┐
        │Enrollment│ │Assessment│ │ Notification │
        │  :3002   │ │  :3003   │ │    :3004     │
        └─────────┘ └─────────┘ └──────────────┘
```

## Services

| Service          | Port | Purpose                               | Database  |
| ---------------- | ---- | ------------------------------------- | --------- |
| **Gateway**      | 3000 | Public API entry point, auth, routing | None      |
| **Identity**     | 3001 | User management, authentication, JWT  | SQLite    |
| **Enrollment**   | 3002 | Student course enrollments            | SQLite    |
| **Assessment**   | 3003 | Exams, quizzes, submissions, results  | SQLite    |
| **Notification** | 3004 | Event-driven notifications, queues    | In-memory |

## Key Patterns

- **CQRS** — Commands write state, queries read state (`@zudojs/cqrs`)
- **Event-Driven** — Services emit events via `@zudojs/events` (`defineEvent`, `EventBus`)
- **Database Isolation** — Each service owns its SQLite database
- **Queue-Based Processing** — Notification service uses `@zudojs/queue` for async job processing
- **JWT Authentication** — Gateway validates tokens, services trust authenticated requests
- **Request Tracing** — Request IDs propagate across services

## Quick Start

The gateway and identity services refuse to start without a `JWT_SECRET` of at least 32 characters, and there is no built-in default:

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
```

```bash
# Install dependencies
npm install

# Run all services (requires concurrently)
npm run dev

# Or run individual services
npm run dev:identity
npm run dev:enrollment
npm run dev:assessment
npm run dev:notification
npm run dev:gateway
```

## Docker Compose

```bash
docker compose up
```

## API Endpoints

### Gateway (3000)

| Method | Path                        | Description         |
| ------ | --------------------------- | ------------------- |
| GET    | /health                     | Health check        |
| POST   | /api/identity/register      | Register user       |
| POST   | /api/identity/authenticate  | Login               |
| GET    | /api/identity/users/:id     | Get user            |
| POST   | /api/enrollments            | Enroll in course    |
| DELETE | /api/enrollments/:id        | Withdraw            |
| GET    | /api/enrollments?studentId= | List enrollments    |
| POST   | /api/assessments            | Create assessment   |
| POST   | /api/assessments/submit     | Submit assessment   |
| POST   | /api/assessments/publish    | Publish results     |
| GET    | /api/notifications          | List notifications  |
| POST   | /api/notifications          | Create notification |
| POST   | /api/notifications/read     | Mark as read        |

## Demo Flow

1. Register a user via `POST /api/identity/register`
2. Authenticate via `POST /api/identity/authenticate` (returns JWT)
3. Use JWT in `Authorization: Bearer <token>` header
4. Enroll student in a course
5. Create and submit an assessment
6. Publish results (triggers notification event)
7. Check notifications for the student

## Typecheck

```bash
npm run typecheck
```
