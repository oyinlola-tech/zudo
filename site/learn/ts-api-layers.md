---
title: "Type-safe API layers — ZudoJS Academy"
description: "Refactor the BookStore into typed layers: entities, DTOs, mappers, controllers, services and repositories, with typed errors, cursor paging and role checks."
source: https://zudojs.oyinlola.site/learn/ts-api-layers
---

LEVEL 7 · LESSON 11 OF 15

TypeScript on the server Core

# Type-safe API layers

Refactor the BookStore into typed layers: entities, DTOs, mappers, controllers, services and repositories, with typed errors, cursor paging and role checks.

- **60 min** to read and try
- **You need:** "BookStore API: authentication and tests", and Utility types
- **You build:** The BookStore's users and books rebuilt in typed layers on PostgreSQL (PGlite), with DTOs, mappers, typed error responses, cursor pagination, role-based permissions and unit tests with a fake repository

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Tell entities, request DTOs, response DTOs and database rows apart, and write the mapper between each pair
- Parse unknown request bodies into Create and Update DTOs that refuse fields the client may not set
- Model failures as a discriminated union and map them to HTTP statuses exhaustively
- Page through results with an opaque cursor and a Page type
- Enforce authentication and role-based authorization in the service layer
- Make services depend on interfaces so the database and crypto can be swapped for fakes in tests

## One type for everything

The BookStore from the last three lessons works. Now the team adds user profiles, and a developer writes the two new routes the quick way: one `User` type, used for the database, for the code and for the JSON that goes back to the client. Run it:

quick-way.ts

```ts
interface User {
  id: number;
  email: string;
  passwordHash: string;
  role: "customer" | "admin";
  displayName: string | null;
}

const users = new Map<number, User>([
  [2, { id: 2, email: "ada@example.com", passwordHash: "scrypt$c2FsdA$aGFzaA", role: "customer", displayName: null }],
]);

function getUser(id: number) {
  return { status: 200, body: users.get(id) };
}

function updateUser(id: number, changes: Partial<User>) {
  const updated = { ...users.get(id)!, ...changes };
  users.set(id, updated);
  return { status: 200, body: updated };
}

console.log(getUser(2).body);

const body: unknown = JSON.parse('{"displayName":"Ada","role":"admin"}');
console.log(updateUser(2, body as Partial<User>).body);
```

Output of `npx tsx quick-way.ts` and of the browser terminal

```json
{
  id: 2,
  email: 'ada@example.com',
  passwordHash: 'scrypt$c2FsdA$aGFzaA',
  role: 'customer',
  displayName: null
}
{
  id: 2,
  email: 'ada@example.com',
  passwordHash: 'scrypt$c2FsdA$aGFzaA',
  role: 'admin',
  displayName: 'Ada'
}
```

Two serious bugs, and the compiler saw neither:

- **A leak.** `GET` sends the password hash to anyone who asks. The type of the response *is* the type of the stored record, so whatever you store, you publish.
- **A privilege escalation.** `PATCH` spreads the client's body over the user, so Ada made herself an admin by adding one field. This is called **mass assignment**: copying every field a client sends into your data. The `as Partial<User>` told the compiler "trust this", and it did.

Both bugs have the same root: one type plays four roles. This lesson gives each role its own type, gives each job its own layer, and lets TypeScript check the joints between them. The pieces have standard names (controller, service, repository, DTO, mapper), and here you build them with types, for the BookStore's users and books, on PostgreSQL. [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture), later in the course, goes deeper into the rules between the layers.

## Who may send and see what?

REASON IT OUT

### The four shapes of a user

Before writing any type, answer these for the BookStore's users. Write your answers down:

- Which fields does the database store? Which of them must never leave the server?
- When someone registers, which fields may they choose? Who decides the `id`, the `role` and the creation time?
- When someone edits a profile, which fields may change? Does "not sent" mean the same as "sent as `null`"?
- Who may change a *role*? Who may edit *someone else's* profile?
- What should the client see for a date: a JavaScript `Date`, or text?

**Show the reasoning**

The database stores the id, e-mail, password hash, role, display name and creation time. The **hash never leaves the server**, not even to its owner.

At registration the client chooses only its e-mail, password and optionally a display name. The **database** picks the id, the **server** sets the role to `customer` and the time from its own clock. A client that sends `role` or `id` is either confused or attacking; refusing with 400 is better than silently dropping the field, because a confused client learns about its mistake.

An edit may change the display name and, for admins only, the role. "Not sent" means "leave it alone"; `null` means "clear it". Those must be different in the type and in the SQL.

Only an admin may change a role or edit another user. That is a rule about *who is asking*, so it cannot live in the body parser, which only knows *what* was sent. It belongs in the service, which knows both.

JSON has no date type. The client gets an ISO 8601 string such as `"2026-09-24T10:00:00.000Z"`, and the conversion happens in exactly one place.

Those answers give you four types for one user, and a name for each:

| Type | What it is | Who creates it |
| --- | --- | --- |
| `UserRow` | A database row: `snake_case` columns, exactly as PostgreSQL returns them | the repository's SQL |
| `User` | The **entity**: the full record your code works with, including the hash | the repository, from a row |
| `CreateUserDTO`, `UpdateUserDTO` | **Request DTOs**: only what a client may send for one action | a parser, from an `unknown` body |
| `UserResponse` | The **response DTO**: only what a client may see, in JSON-friendly types | a mapper, from the entity |

A **mapper** is a small function that turns one of these shapes into another. Every arrow between two shapes is one mapper, and it is the only place that knows both.

```ts
  JSON body ──parse──▶ CreateUserDTO ─┐
                                      ├─▶ service ─▶ repository ──SQL──▶ UserRow
  JSON body ──parse──▶ UpdateUserDTO ─┘      │            │
                                             ▼            ▼
  JSON reply ◀──map── UserResponse ◀──map── User ◀──map── UserRow
```

Each arrow is one function. The entity `User` never crosses the network in either direction.

## Entities and DTOs

The project's folders follow the table: shared pieces, one folder per feature (users, books), the infrastructure that talks to PostgreSQL and crypto, and the HTTP layer:

```ts
src/
├── shared/        types, errors, validation, pagination, policy
├── users/         user.ts (entity), user.dto.ts, user.service.ts, user.controller.ts
├── books/         book.ts (entity), book.dto.ts, book.service.ts, book.controller.ts
├── infra/         database.ts, user.repository.ts, book.repository.ts, security.ts
├── http/          http.ts (request, response, errors, authentication), run.ts, server.ts
├── ports.ts       the interfaces the services need
└── app.ts         the composition root: builds and connects everything
```

First the types every layer shares. `Principal` is "who is asking": the user id and role that authentication produced. `Page` is generic, so one type describes a page of books, of users or of orders:

src/shared/types.tsNode.js only

```ts
export type Role = "customer" | "admin";

export interface Principal {
  readonly userId: number;
  readonly role: Role;
}

export interface PageQuery {
  readonly limit: number;
  readonly afterId: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export function mapPage<T, U>(page: Page<T>, map: (item: T) => U): Page<U> {
  return { items: page.items.map(map), nextCursor: page.nextCursor };
}
```

The user entity. `NewUser` is "a user before the database gave it an id", and `UserChanges` is what the repository can update:

src/users/user.tsNode.js only

```ts
import type { Role } from "../shared/types.js";

export interface User {
  readonly id: number;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly displayName: string | null;
  readonly createdAt: Date;
}

export type NewUser = Omit<User, "id">;

export interface UserChanges {
  readonly displayName?: string | null;
  readonly role?: Role;
}
```

### Failures as data

Parsers, services and repositories all need to say "this went wrong" without knowing HTTP. In [BookStore API: validation and PostgreSQL](https://zudojs.oyinlola.site/learn/bookstore-data) you used one error class per case. Here every expected failure is one member of a **discriminated union** ([Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions)), carried by a single error class. The `kind` tells them apart, and each kind has exactly the data it needs:

src/shared/errors.tsNode.js only

```ts
export type Failure =
  | { readonly kind: "validation"; readonly issues: readonly string[] }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "forbidden"; readonly action: string }
  | { readonly kind: "not_found"; readonly resource: string; readonly id: number }
  | { readonly kind: "conflict"; readonly message: string };

export class AppError extends Error {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(failure.kind);
    this.name = "AppError";
    this.failure = failure;
  }
}
```

The validation helpers are the ones from the data lesson, with one change: `objectBody` takes a list of **allowed** keys and reports every other key as an issue. That is the fix for mass assignment. Unknown fields are not ignored silently; they are refused, together with every other problem in the body:

src/shared/validation.tsNode.js only

```ts
import { AppError } from "./errors.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function objectBody(input: unknown, allowed: readonly string[], issues: string[]): Record<string, unknown> {
  if (!isRecord(input)) throw new AppError({ kind: "validation", issues: ["the body must be a JSON object"] });
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) issues.push(`${key} cannot be set`);
  }
  return input;
}

export function text(value: unknown, name: string, max: number, issues: string[]): string {
  if (typeof value === "string" && value.trim() !== "" && value.length <= max) return value.trim();
  issues.push(`${name} must be text of 1 to ${max} characters`);
  return "";
}

export function whole(value: unknown, name: string, min: number, max: number, issues: string[]): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max) return value;
  issues.push(`${name} must be a whole number from ${min} to ${max}`);
  return min;
}

export function done<T>(value: T, issues: readonly string[]): T {
  if (issues.length > 0) throw new AppError({ kind: "validation", issues });
  return value;
}
```

Now the three user DTOs and their functions. Read the two parsers side by side:

src/users/user.dto.tsNode.js only

```ts
import type { Role } from "../shared/types.js";
import { done, objectBody, text } from "../shared/validation.js";
import type { User } from "./user.js";

export interface CreateUserDTO {
  readonly email: string;
  readonly password: string;
  readonly displayName: string | null;
}

export interface UpdateUserDTO {
  readonly displayName?: string | null;
  readonly role?: Role;
}

export interface UserResponse {
  readonly id: number;
  readonly email: string;
  readonly role: Role;
  readonly displayName: string | null;
  readonly createdAt: string;
}

export function parseCreateUser(input: unknown): CreateUserDTO {
  const issues: string[] = [];
  const body = objectBody(input, ["email", "password", "displayName"], issues);
  const email = text(body["email"], "email", 254, issues).toLowerCase();
  if (email !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) issues.push("email is not an e-mail address");
  const password = typeof body["password"] === "string" ? body["password"] : "";
  if (password.length < 10 || password.length > 200) issues.push("password must be 10 to 200 characters");
  const displayName = body["displayName"] === undefined ? null : text(body["displayName"], "displayName", 60, issues);
  return done({ email, password, displayName }, issues);
}

export function parseUpdateUser(input: unknown): UpdateUserDTO {
  const issues: string[] = [];
  const body = objectBody(input, ["displayName", "role"], issues);
  const dto: { displayName?: string | null; role?: Role } = {};
  if ("displayName" in body) {
    dto.displayName = body["displayName"] === null ? null : text(body["displayName"], "displayName", 60, issues);
  }
  if ("role" in body) {
    const role = body["role"];
    if (role === "customer" || role === "admin") dto.role = role;
    else issues.push("role must be customer or admin");
  }
  if (Object.keys(body).length === 0) issues.push("send at least one field to change");
  return done(dto, issues);
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}
```

- `CreateUserDTO` has no `id`, no `role` and no `createdAt`. The allowed-keys list in `parseCreateUser` matches it, so a body with `role` gets a 400.
- `UpdateUserDTO` has only optional fields, and `displayName` may be `null`. The parser only sets a property when the key was **in the body** (`"displayName" in body`), so "not sent" stays absent and `null` stays `null`.
- `UpdateUserDTO` *does* allow `role`, because an admin may change it. Whether *this* caller may is decided later, by the service. The DTO describes what can be asked for; the policy decides who may ask.
- `toUserResponse` copies each field it wants **by name** and turns the `Date` into text. The hash is not there, because nobody wrote it there.

try-user-dto.tsNode.js only

```ts
import { AppError } from "./src/shared/errors.js";
import type { User } from "./src/users/user.js";
import { parseCreateUser, parseUpdateUser, toUserResponse } from "./src/users/user.dto.js";

function attempt(label: string, action: () => unknown): void {
  try {
    console.log(label, JSON.stringify(action()));
  } catch (error) {
    if (!(error instanceof AppError) || error.failure.kind !== "validation") throw error;
    console.log(label, "invalid:", error.failure.issues.join("; "));
  }
}

attempt("create", () => parseCreateUser({ email: " Ada@Example.com", password: "a long passphrase" }));
attempt("create", () => parseCreateUser({ email: "ada@example.com", password: "short", role: "admin" }));
attempt("update", () => parseUpdateUser({ displayName: "Ada O." }));
attempt("update", () => parseUpdateUser({ displayName: null }));
attempt("update", () => parseUpdateUser({}));
attempt("update", () => parseUpdateUser({ role: "owner" }));

const user: User = {
  id: 2, email: "ada@example.com", passwordHash: "scrypt$c2FsdA$aGFzaA", role: "customer",
  displayName: "Ada O.", createdAt: new Date("2026-09-24T10:00:00Z"),
};
attempt("response", () => toUserResponse(user));
```

Output of `npx tsx try-user-dto.ts`

```ts
create {"email":"ada@example.com","password":"a long passphrase","displayName":null}
create invalid: role cannot be set; password must be 10 to 200 characters
update {"displayName":"Ada O."}
update {"displayName":null}
update invalid: send at least one field to change
update invalid: role must be customer or admin
response {"id":2,"email":"ada@example.com","role":"customer","displayName":"Ada O.","createdAt":"2026-09-24T10:00:00.000Z"}
```

The e-mail was trimmed and lower-cased, the bad create got both of its problems at once, and `{"displayName":null}` survived as a real `null` instead of vanishing.

### Why the mapper names every field

A shorter mapper is tempting: take the entity and remove the secret with `Omit` and a rest spread. Watch what happens a month later, when someone adds a password-reset feature to the entity:

deny-vs-allow.ts

```ts
interface User {
  readonly id: number;
  readonly email: string;
  readonly passwordHash: string;
  readonly resetTokenHash: string | null;
}

type UserResponseByOmit = Omit<User, "passwordHash">;

function toResponseByOmit(user: User): UserResponseByOmit {
  const { passwordHash: _hidden, ...rest } = user;
  return rest;
}

interface UserResponse {
  readonly id: number;
  readonly email: string;
}

function toResponseByName(user: User): UserResponse {
  return { id: user.id, email: user.email };
}

const user: User = { id: 2, email: "ada@example.com", passwordHash: "scrypt$c2FsdA$aGFzaA", resetTokenHash: "9f86d081884c7d65" };
console.log(toResponseByOmit(user));
console.log(toResponseByName(user));
```

Output of `npx tsx deny-vs-allow.ts` and of the browser terminal

```json
{ id: 2, email: 'ada@example.com', resetTokenHash: '9f86d081884c7d65' }
{ id: 2, email: 'ada@example.com' }
```

`Omit` is a **deny-list**: everything except what you named. Every new field on the entity is published automatically, and the new reset-token hash leaked without a single line of the mapper changing. Naming the fields, as `toUserResponse` does, is an **allow-list**: a new field stays private until someone decides to publish it. For anything that crosses a trust boundary, prefer allow-lists. (`Pick` is the allow-list version of `Omit`; the books below use it for a request type.)

## Books, prices and pages

The book entity and its DTOs follow the same pattern. `BookChanges` is built with `Partial<Pick<…>>` from [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types): an allow-list of the three fields an edit may touch, all optional. `authorId` is not among them, so a book cannot be moved to another author by an edit:

src/books/book.tsNode.js only

```ts
export interface Book {
  readonly id: number;
  readonly title: string;
  readonly authorId: number;
  readonly priceCents: number;
  readonly stock: number;
  readonly createdAt: Date;
}

export type NewBook = Omit<Book, "id">;

export type BookChanges = Partial<Pick<Book, "title" | "priceCents" | "stock">>;
```

Lists are paged with a **cursor**, as in [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design#pagination): "give me the books after the last one I saw". The cursor is **opaque**: the client gets a token and sends it back, and must not build or read it. Inside, it is just the last id, base64url-encoded. Because a cursor comes back from the client, it is untrusted input and is checked like everything else:

src/shared/pagination.tsNode.js only

```ts
import { AppError } from "./errors.js";
import type { PageQuery } from "./types.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function encodeCursor(lastId: number): string {
  return Buffer.from(`after:${lastId}`).toString("base64url");
}

function decodeCursor(cursor: string): number {
  const match = /^after:(\d{1,10})$/.exec(Buffer.from(cursor, "base64url").toString("utf8"));
  if (match === null) throw new AppError({ kind: "validation", issues: ["cursor is not valid"] });
  return Number(match[1]);
}

export function parsePageQuery(query: URLSearchParams): PageQuery {
  const rawLimit = query.get("limit");
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new AppError({ kind: "validation", issues: [`limit must be a whole number from 1 to ${MAX_LIMIT}`] });
  }
  const cursor = query.get("cursor");
  return { limit, afterId: cursor === null ? 0 : decodeCursor(cursor) };
}
```

The response DTO shapes the price for the client: the exact amount in cents for computing, and a display string for showing. `inStock` tells the shop page what it needs, without publishing the exact stock level to competitors:

src/books/book.dto.tsNode.js only

```ts
import { done, objectBody, text, whole } from "../shared/validation.js";
import type { Book, BookChanges } from "./book.js";

export interface CreateBookDTO {
  readonly title: string;
  readonly authorId: number;
  readonly priceCents: number;
  readonly stock: number;
}

export type UpdateBookDTO = BookChanges;

export interface BookResponse {
  readonly id: number;
  readonly title: string;
  readonly authorId: number;
  readonly price: { readonly cents: number; readonly display: string };
  readonly inStock: boolean;
}

export function parseCreateBook(input: unknown): CreateBookDTO {
  const issues: string[] = [];
  const body = objectBody(input, ["title", "authorId", "priceCents", "stock"], issues);
  const dto = {
    title: text(body["title"], "title", 200, issues),
    authorId: whole(body["authorId"], "authorId", 1, 2_147_483_647, issues),
    priceCents: whole(body["priceCents"], "priceCents", 0, 1_000_000, issues),
    stock: whole(body["stock"], "stock", 0, 10_000, issues),
  };
  return done(dto, issues);
}

export function parseUpdateBook(input: unknown): UpdateBookDTO {
  const issues: string[] = [];
  const body = objectBody(input, ["title", "priceCents", "stock"], issues);
  const dto: { title?: string; priceCents?: number; stock?: number } = {};
  if ("title" in body) dto.title = text(body["title"], "title", 200, issues);
  if ("priceCents" in body) dto.priceCents = whole(body["priceCents"], "priceCents", 0, 1_000_000, issues);
  if ("stock" in body) dto.stock = whole(body["stock"], "stock", 0, 10_000, issues);
  if (Object.keys(body).length === 0) issues.push("send at least one field to change");
  return done(dto, issues);
}

export function toBookResponse(book: Book): BookResponse {
  return {
    id: book.id,
    title: book.title,
    authorId: book.authorId,
    price: { cents: book.priceCents, display: (book.priceCents / 100).toFixed(2) },
    inStock: book.stock > 0,
  };
}
```

## Services and dependency inversion

A service carries out the use cases: "register a user", "change a book's price". It needs a database, a password hasher and a clock. If it imported PGlite and `node:crypto` directly, every test of a business rule would need a database and would run real scrypt. So the service states what it needs as **interfaces**, and the infrastructure implements them. The high-level code (the service) and the low-level code (PostgreSQL) both depend on the interface, and neither depends on the other. That is **dependency inversion**. The interfaces are often called **ports**:

src/ports.tsNode.js only

```ts
import type { Book, BookChanges, NewBook } from "./books/book.js";
import type { NewUser, User, UserChanges } from "./users/user.js";

export interface UserRepository {
  create(user: NewUser): Promise<User>;
  findById(id: number): Promise<User | undefined>;
  update(id: number, changes: UserChanges): Promise<User | undefined>;
}

export interface BookRepository {
  listAfter(afterId: number, limit: number): Promise<Book[]>;
  create(book: NewBook): Promise<Book>;
  update(id: number, changes: BookChanges): Promise<Book | undefined>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export interface TokenReader {
  readUserId(token: string): number | undefined;
}
```

Notice `Clock`. "The current time" is a dependency too: a service that calls `new Date()` itself cannot be tested for "created at 10:00", and its output changes on every run.

### Authentication and authorization

Two different questions, often confused:

- **Authentication** (authn): *who* is asking? A valid token for user 2. The answer is a `Principal`, or nobody. Failure means **401 Unauthorized**.
- **Authorization** (authz): *may* they do this? User 2 is a customer and wants to create a book. Failure means **403 Forbidden**.

Permissions are a typed union of actions, and each role gets a list of them. This is **role-based access control** (RBAC). Because `GRANTS` is typed `Record<Role, readonly Action[]>`, adding a role without deciding its permissions, or granting an action that does not exist, is a compile error:

src/shared/policy.tsNode.js only

```ts
import { AppError } from "./errors.js";
import type { Principal, Role } from "./types.js";

export type Action = "book:create" | "book:update" | "user:update-any" | "user:change-role";

const GRANTS: Readonly<Record<Role, readonly Action[]>> = {
  customer: [],
  admin: ["book:create", "book:update", "user:update-any", "user:change-role"],
};

export function requirePrincipal(actor: Principal | undefined): Principal {
  if (actor === undefined) throw new AppError({ kind: "unauthenticated" });
  return actor;
}

export function authorize(actor: Principal | undefined, action: Action): Principal {
  const principal = requirePrincipal(actor);
  if (!GRANTS[principal.role].includes(action)) throw new AppError({ kind: "forbidden", action });
  return principal;
}
```

The services. Each check sits at the top of the method, before any work is done:

src/users/user.service.tsNode.js only

```ts
import type { Clock, PasswordHasher, UserRepository } from "../ports.js";
import { AppError } from "../shared/errors.js";
import { authorize, requirePrincipal } from "../shared/policy.js";
import type { Principal } from "../shared/types.js";
import type { User } from "./user.js";
import type { CreateUserDTO, UpdateUserDTO } from "./user.dto.js";

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async register(dto: CreateUserDTO): Promise<User> {
    return this.users.create({
      email: dto.email,
      passwordHash: await this.hasher.hash(dto.password),
      role: "customer",
      displayName: dto.displayName,
      createdAt: this.clock.now(),
    });
  }

  async update(actor: Principal | undefined, id: number, dto: UpdateUserDTO): Promise<User> {
    const principal = requirePrincipal(actor);
    if (principal.userId !== id) authorize(principal, "user:update-any");
    if (dto.role !== undefined) authorize(principal, "user:change-role");
    const user = await this.users.update(id, dto);
    if (user === undefined) throw new AppError({ kind: "not_found", resource: "user", id });
    return user;
  }
}
```

- `register` sets `role: "customer"` itself. The role never comes from the client at registration, whatever the DTO contains.
- `update` has two rules. Editing someone else's profile needs `user:update-any`; changing a role needs `user:change-role`. The second rule applies even to your own profile: that is the rule that would have stopped Ada.
- Rules live in the service, not in the controller, because a service is also called from places that are not HTTP: an admin script, a queue job, a test. A rule in the controller protects only one door.

src/books/book.service.tsNode.js only

```ts
import type { BookRepository, Clock } from "../ports.js";
import { AppError } from "../shared/errors.js";
import { encodeCursor } from "../shared/pagination.js";
import { authorize } from "../shared/policy.js";
import type { Page, PageQuery, Principal } from "../shared/types.js";
import type { Book } from "./book.js";
import type { CreateBookDTO, UpdateBookDTO } from "./book.dto.js";

export class BookService {
  constructor(
    private readonly books: BookRepository,
    private readonly clock: Clock,
  ) {}

  async list(query: PageQuery): Promise<Page<Book>> {
    const rows = await this.books.listAfter(query.afterId, query.limit + 1);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    const nextCursor = rows.length > query.limit && last !== undefined ? encodeCursor(last.id) : null;
    return { items, nextCursor };
  }

  async create(actor: Principal | undefined, dto: CreateBookDTO): Promise<Book> {
    authorize(actor, "book:create");
    return this.books.create({ ...dto, createdAt: this.clock.now() });
  }

  async update(actor: Principal | undefined, id: number, dto: UpdateBookDTO): Promise<Book> {
    authorize(actor, "book:update");
    const book = await this.books.update(id, dto);
    if (book === undefined) throw new AppError({ kind: "not_found", resource: "book", id });
    return book;
  }
}
```

`list` asks the repository for **one more** row than the page size. If that extra row exists, there is a next page and the cursor points after the last item shown; if not, `nextCursor` is `null`. This avoids a separate `COUNT(*)` query, which gets slow on big tables.

## Repositories: rows in, entities out

The infrastructure layer. The database module is the one from the data lesson, with the `users` table from the authentication lesson (now with a role and a display name) and creation times added. The `CHECK` on `role` means the database itself refuses a role that does not exist:

src/infra/database.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS authors (id serial PRIMARY KEY, name text NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS books (
     id serial PRIMARY KEY,
     title text NOT NULL,
     author_id integer NOT NULL REFERENCES authors (id),
     price_cents integer NOT NULL CHECK (price_cents >= 0),
     stock integer NOT NULL CHECK (stock >= 0),
     created_at timestamptz NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS users (
     id serial PRIMARY KEY,
     email text NOT NULL UNIQUE,
     password_hash text NOT NULL,
     role text NOT NULL CHECK (role IN ('customer', 'admin')),
     display_name text,
     created_at timestamptz NOT NULL
   )`,
];

export async function openDatabase(): Promise<PGlite> {
  const db = new PGlite();
  for (const sql of MIGRATIONS) await db.query(sql);
  return db;
}

export function pgErrorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
```

The user repository implements `UserRepository`. Its private `UserRow` type is the shape PostgreSQL returns, and `toUser` is the row-to-entity mapper. Note that a row is **outside data** too: `role` arrives as a plain `string`, and `isRole` proves it before the entity may claim `Role`:

src/infra/user.repository.tsNode.js only

```ts
import type { UserRepository } from "../ports.js";
import { AppError } from "../shared/errors.js";
import type { Role } from "../shared/types.js";
import type { NewUser, User, UserChanges } from "../users/user.js";
import type { Queryable } from "./database.js";
import { pgErrorCode } from "./database.js";

interface UserRow {
  readonly id: number;
  readonly email: string;
  readonly password_hash: string;
  readonly role: string;
  readonly display_name: string | null;
  readonly created_at: Date;
}

function isRole(value: string): value is Role {
  return value === "customer" || value === "admin";
}

function toUser(row: UserRow): User {
  if (!isRole(row.role)) throw new Error(`user ${row.id} has an unknown role in the database`);
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

const COLUMNS = "id, email, password_hash, role, display_name, created_at";

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: Queryable) {}

  async create(user: NewUser): Promise<User> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (email, password_hash, role, display_name, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        [user.email, user.passwordHash, user.role, user.displayName, user.createdAt],
      );
      return toUser(rows[0]!);
    } catch (error) {
      if (pgErrorCode(error) === "23505") throw new AppError({ kind: "conflict", message: "That e-mail is already registered" });
      throw error;
    }
  }

  async findById(id: number): Promise<User | undefined> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] === undefined ? undefined : toUser(rows[0]);
  }

  async update(id: number, changes: UserChanges): Promise<User | undefined> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users SET
         display_name = CASE WHEN $2 THEN $3 ELSE display_name END,
         role = COALESCE($4, role)
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, "displayName" in changes, changes.displayName ?? null, changes.role ?? null],
    );
    return rows[0] === undefined ? undefined : toUser(rows[0]);
  }
}
```

The `UPDATE` handles the two meanings of "missing" from the reasoning section. `$2` is `true` only when `displayName` was in the changes, so `CASE WHEN $2 THEN $3 ELSE display_name END` sets it (possibly to `NULL`) or leaves it. `role` can never be `NULL`, so `COALESCE($4, role)`, "the new value, or the old one", is enough.

src/infra/book.repository.tsNode.js only

```ts
import type { Book, BookChanges, NewBook } from "../books/book.js";
import type { BookRepository } from "../ports.js";
import { AppError } from "../shared/errors.js";
import type { Queryable } from "./database.js";
import { pgErrorCode } from "./database.js";

interface BookRow {
  readonly id: number;
  readonly title: string;
  readonly author_id: number;
  readonly price_cents: number;
  readonly stock: number;
  readonly created_at: Date;
}

function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    authorId: row.author_id,
    priceCents: row.price_cents,
    stock: row.stock,
    createdAt: row.created_at,
  };
}

const COLUMNS = "id, title, author_id, price_cents, stock, created_at";

export class PgBookRepository implements BookRepository {
  constructor(private readonly db: Queryable) {}

  async listAfter(afterId: number, limit: number): Promise<Book[]> {
    const { rows } = await this.db.query<BookRow>(
      `SELECT ${COLUMNS} FROM books WHERE id > $1 ORDER BY id LIMIT $2`,
      [afterId, limit],
    );
    return rows.map(toBook);
  }

  async create(book: NewBook): Promise<Book> {
    try {
      const { rows } = await this.db.query<BookRow>(
        `INSERT INTO books (title, author_id, price_cents, stock, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        [book.title, book.authorId, book.priceCents, book.stock, book.createdAt],
      );
      return toBook(rows[0]!);
    } catch (error) {
      if (pgErrorCode(error) === "23503") {
        throw new AppError({ kind: "validation", issues: [`authorId ${book.authorId} does not exist`] });
      }
      throw error;
    }
  }

  async update(id: number, changes: BookChanges): Promise<Book | undefined> {
    const { rows } = await this.db.query<BookRow>(
      `UPDATE books SET
         title = COALESCE($2, title),
         price_cents = COALESCE($3, price_cents),
         stock = COALESCE($4, stock)
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, changes.title ?? null, changes.priceCents ?? null, changes.stock ?? null],
    );
    return rows[0] === undefined ? undefined : toBook(rows[0]);
  }
}
```

Last, the crypto adapters. `ScryptHasher` is the password hashing from [BookStore API: authentication and tests](https://zudojs.oyinlola.site/learn/bookstore-auth#passwords) behind the `PasswordHasher` port. `HmacTokens` is a cut-down version of that lesson's signed tokens: to keep this lesson short it has no expiry time, which your real project must keep.

src/infra/security.tsNode.js only

```ts
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { PasswordHasher, TokenReader } from "../ports.js";

export class ScryptHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    return new Promise((resolve, reject) => {
      scrypt(password, salt, 64, (error, key) => {
        if (error) reject(error);
        else resolve(`scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`);
      });
    });
  }
}

export class HmacTokens implements TokenReader {
  constructor(private readonly secret: string) {}

  private sign(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }

  issue(userId: number): string {
    const data = Buffer.from(String(userId)).toString("base64url");
    return `${data}.${this.sign(data)}`;
  }

  readUserId(token: string): number | undefined {
    const [data, signature] = token.split(".");
    if (data === undefined || signature === undefined) return undefined;
    const expected = Buffer.from(this.sign(data));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    const id = Number(Buffer.from(data, "base64url").toString("utf8"));
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
  }
}
```

## Controllers and typed responses

The HTTP layer knows about requests, status codes and headers, and nothing about SQL. `ApiResponse<T>` is generic: a controller that promises `ApiResponse<UserResponse>` can only return a response DTO. The error mapping lives here too:

src/http/http.tsNode.js only

```ts
import type { TokenReader, UserRepository } from "../ports.js";
import { AppError } from "../shared/errors.js";
import type { Failure } from "../shared/errors.js";
import type { Principal } from "../shared/types.js";

export interface ApiRequest {
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: unknown;
}

export interface ApiResponse<T> {
  readonly status: number;
  readonly body: T;
}

export interface ErrorBody {
  readonly error: {
    readonly code: Failure["kind"] | "internal";
    readonly message: string;
    readonly issues?: readonly string[];
  };
}

const STATUS = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
} as const satisfies Record<Failure["kind"], number>;

function messageFor(failure: Failure): string {
  switch (failure.kind) {
    case "validation": return "The request is not valid";
    case "unauthenticated": return "Log in and send your token";
    case "forbidden": return `Missing permission: ${failure.action}`;
    case "not_found": return `No ${failure.resource} with id ${failure.id}`;
    case "conflict": return failure.message;
  }
}

export function toErrorResponse(error: unknown): ApiResponse<ErrorBody> {
  if (!(error instanceof AppError)) {
    console.error(error);
    return { status: 500, body: { error: { code: "internal", message: "Something went wrong" } } };
  }
  const { failure } = error;
  const issues = failure.kind === "validation" ? { issues: failure.issues } : {};
  return { status: STATUS[failure.kind], body: { error: { code: failure.kind, message: messageFor(failure), ...issues } } };
}

export function toId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError({ kind: "validation", issues: ["id must be a positive whole number"] });
  return id;
}

export class Authenticator {
  constructor(
    private readonly tokens: TokenReader,
    private readonly users: UserRepository,
  ) {}

  async principalFrom(request: ApiRequest): Promise<Principal | undefined> {
    const header = request.headers["authorization"];
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return undefined;
    const userId = this.tokens.readUserId(header.slice(7));
    if (userId === undefined) return undefined;
    const user = await this.users.findById(userId);
    return user === undefined ? undefined : { userId: user.id, role: user.role };
  }
}
```

- `STATUS` uses `satisfies Record<Failure["kind"], number>`: every failure kind must have a status, and TypeScript still knows each exact number.
- `messageFor` has a `switch` with no `default`. With `strict` on, a function whose return type is `string` must return on every path, so the compiler checks that every kind is handled.
- Only an `AppError` produces a detailed answer. Anything else is a bug: it is logged on the server and the client gets a bare 500.
- `Authenticator` is authentication: it turns a header into a `Principal` or `undefined`. It loads the user, so the role is always the *current* one: an admin who is demoted loses admin rights on the next request, not when their token expires.

Here is what the compiler says when you add a new failure kind, `rate_limited`, and forget the HTTP layer:

new-failure.tsNode.js only

```ts
type Failure =
  | { readonly kind: "validation"; readonly issues: readonly string[] }
  | { readonly kind: "not_found"; readonly resource: string }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number };

const STATUS = {
  validation: 400,
  not_found: 404,
} as const satisfies Record<Failure["kind"], number>;

function messageFor(failure: Failure): string {
  switch (failure.kind) {
    case "validation": return "The request is not valid";
    case "not_found": return `No such ${failure.resource}`;
  }
}
```

What `npx tsc --noEmit` prints

```ts
new-failure.ts:9:12 - error TS2741: Property 'rate_limited' is missing in type '{ readonly validation: 400; readonly not_found: 404; }' but required in type 'Record<"not_found" | "rate_limited" | "validation", number>'.

9 } as const satisfies Record<Failure["kind"], number>;
             ~~~~~~~~~

new-failure.ts:11:40 - error TS2366: Function lacks ending return statement and return type does not include 'undefined'.

11 function messageFor(failure: Failure): string {
                                          ~~~~~~


Found 2 errors in the same file, starting at: new-failure.ts:9
```

Two errors, pointing at the two places to update. A new kind of failure cannot quietly become a 500.

The controllers are thin: read the principal, parse the DTO, call the service, map the result:

src/users/user.controller.tsNode.js only

```ts
import type { ApiRequest, ApiResponse, Authenticator } from "../http/http.js";
import { toId } from "../http/http.js";
import type { UserService } from "./user.service.js";
import { parseCreateUser, parseUpdateUser, toUserResponse } from "./user.dto.js";
import type { UserResponse } from "./user.dto.js";

export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly auth: Authenticator,
  ) {}

  async register(request: ApiRequest): Promise<ApiResponse<UserResponse>> {
    const user = await this.users.register(parseCreateUser(request.body));
    return { status: 201, body: toUserResponse(user) };
  }

  async update(request: ApiRequest): Promise<ApiResponse<UserResponse>> {
    const actor = await this.auth.principalFrom(request);
    const user = await this.users.update(actor, toId(request.params["id"]), parseUpdateUser(request.body));
    return { status: 200, body: toUserResponse(user) };
  }
}
```

src/books/book.controller.tsNode.js only

```ts
import type { ApiRequest, ApiResponse, Authenticator } from "../http/http.js";
import { toId } from "../http/http.js";
import { parsePageQuery } from "../shared/pagination.js";
import { mapPage } from "../shared/types.js";
import type { Page } from "../shared/types.js";
import type { BookService } from "./book.service.js";
import { parseCreateBook, parseUpdateBook, toBookResponse } from "./book.dto.js";
import type { BookResponse } from "./book.dto.js";

export class BookController {
  constructor(
    private readonly books: BookService,
    private readonly auth: Authenticator,
  ) {}

  async list(request: ApiRequest): Promise<ApiResponse<Page<BookResponse>>> {
    const page = await this.books.list(parsePageQuery(request.query));
    return { status: 200, body: mapPage(page, toBookResponse) };
  }

  async create(request: ApiRequest): Promise<ApiResponse<BookResponse>> {
    const actor = await this.auth.principalFrom(request);
    const book = await this.books.create(actor, parseCreateBook(request.body));
    return { status: 201, body: toBookResponse(book) };
  }

  async update(request: ApiRequest): Promise<ApiResponse<BookResponse>> {
    const actor = await this.auth.principalFrom(request);
    const book = await this.books.update(actor, toId(request.params["id"]), parseUpdateBook(request.body));
    return { status: 200, body: toBookResponse(book) };
  }
}
```

The return types protect the boundary. Try to return the entity where a response DTO is promised:

controller-mistake.tsNode.js only

```ts
import type { ApiResponse } from "./src/http/http.js";
import type { User } from "./src/users/user.js";
import type { UserResponse } from "./src/users/user.dto.js";

export function show(user: User): ApiResponse<UserResponse> {
  return { status: 200, body: user };
}
```

What `npx tsc --noEmit` prints

```ts
controller-mistake.ts:6:25 - error TS2322: Type 'User' is not assignable to type 'UserResponse'.
  Types of property 'createdAt' are incompatible.
    Type 'Date' is not assignable to type 'string'.

6   return { status: 200, body: user };
                          ~~~~

  src/http/http.ts:15:12 - The expected type comes from property 'body' which is declared here on type 'ApiResponse<UserResponse>'
    15   readonly body: T;
                  ~~~~


Found 1 error in controller-mistake.ts:6
```

Be honest about what saved you here: it was the `Date`. TypeScript's types are **structural**: an object with *extra* fields fits a type with fewer ([Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects)). If `createdAt` were a string in both types, `body: user` would compile and leak the hash. The return type catches some mistakes; the explicit mapper is what actually keeps the hash in.

## Wiring it together

The **composition root** is the one function that knows every concrete class. It creates them in order and hands each one its dependencies. Nothing else in the project writes `new PgUserRepository`:

src/app.tsNode.js only

```ts
import { BookController } from "./books/book.controller.js";
import { BookService } from "./books/book.service.js";
import { Authenticator } from "./http/http.js";
import { PgBookRepository } from "./infra/book.repository.js";
import type { Queryable } from "./infra/database.js";
import { HmacTokens, ScryptHasher } from "./infra/security.js";
import { PgUserRepository } from "./infra/user.repository.js";
import type { Clock } from "./ports.js";
import { UserController } from "./users/user.controller.js";
import { UserService } from "./users/user.service.js";

export interface AppOptions {
  readonly db: Queryable;
  readonly tokenSecret: string;
  readonly clock: Clock;
}

export function createApp({ db, tokenSecret, clock }: AppOptions) {
  const userRepository = new PgUserRepository(db);
  const tokens = new HmacTokens(tokenSecret);
  const auth = new Authenticator(tokens, userRepository);
  return {
    tokens,
    users: new UserController(new UserService(userRepository, new ScryptHasher(), clock), auth),
    books: new BookController(new BookService(new PgBookRepository(db), clock), auth),
  };
}
```

To try the controllers without a network, a small helper builds an `ApiRequest`, runs a handler and turns any error into its response, exactly as the HTTP server will:

src/http/run.tsNode.js only

```ts
import type { ApiRequest, ApiResponse } from "./http.js";
import { toErrorResponse } from "./http.js";

export interface Call {
  readonly params?: Record<string, string>;
  readonly query?: string;
  readonly token?: string;
  readonly body?: unknown;
}

export async function run<T>(handler: (request: ApiRequest) => Promise<ApiResponse<T>>, call: Call = {}): Promise<string> {
  const request: ApiRequest = {
    params: call.params ?? {},
    query: new URLSearchParams(call.query ?? ""),
    headers: call.token === undefined ? {} : { authorization: `Bearer ${call.token}` },
    body: call.body,
  };
  try {
    const response = await handler(request);
    return `${response.status} ${JSON.stringify(response.body)}`;
  } catch (error) {
    const response = toErrorResponse(error);
    return `${response.status} ${JSON.stringify(response.body)}`;
  }
}
```

Now the user stories from the start of the lesson, against real PostgreSQL. The first admin is inserted with SQL: admins are created by a migration or an operator, never through the public API. The clock is fixed so the output is the same on every run:

try-users.tsNode.js only

```ts
import { randomBytes } from "node:crypto";

import { createApp } from "./src/app.js";
import type { ApiRequest } from "./src/http/http.js";
import { run } from "./src/http/run.js";
import { openDatabase } from "./src/infra/database.js";

const db = await openDatabase();
await db.exec(`INSERT INTO users (email, password_hash, role, created_at)
  VALUES ('admin@bookstore.test', 'scrypt$not$used', 'admin', '2026-01-05T08:00:00Z')`);
const clock = { now: () => new Date("2026-09-24T10:00:00Z") };
const app = createApp({ db, tokenSecret: randomBytes(32).toString("hex"), clock });
const register = (request: ApiRequest) => app.users.register(request);
const update = (request: ApiRequest) => app.users.update(request);

console.log(await run(register, { body: { email: "Ada@Example.com", password: "a long passphrase", displayName: "Ada" } }));
console.log(await run(register, { body: { email: "eve@example.com", password: "a long passphrase", role: "admin" } }));

const ada = app.tokens.issue(2);
console.log(await run(update, { params: { id: "2" }, token: ada, body: { displayName: "Ada O." } }));
console.log(await run(update, { params: { id: "2" }, token: ada, body: { role: "admin" } }));
console.log(await run(update, { params: { id: "1" }, token: ada, body: { displayName: "hacked" } }));
console.log(await run(update, { params: { id: "2" }, body: { displayName: "anyone" } }));
console.log(await run(update, { params: { id: "2" }, token: app.tokens.issue(1), body: { role: "admin" } }));
await db.close();
```

Output of `npx tsx try-users.ts`

```ts
201 {"id":2,"email":"ada@example.com","role":"customer","displayName":"Ada","createdAt":"2026-09-24T10:00:00.000Z"}
400 {"error":{"code":"validation","message":"The request is not valid","issues":["role cannot be set"]}}
200 {"id":2,"email":"ada@example.com","role":"customer","displayName":"Ada O.","createdAt":"2026-09-24T10:00:00.000Z"}
403 {"error":{"code":"forbidden","message":"Missing permission: user:change-role"}}
403 {"error":{"code":"forbidden","message":"Missing permission: user:update-any"}}
401 {"error":{"code":"unauthenticated","message":"Log in and send your token"}}
200 {"id":2,"email":"ada@example.com","role":"admin","displayName":"Ada O.","createdAt":"2026-09-24T10:00:00.000Z"}
```

Line by line: Ada registered and got no hash back. Eve's attempt to register as admin was refused as a bad request. Ada renamed herself; her attempt to become admin got 403; so did her attempt to edit the admin. With no token, 401. The admin could change Ada's role. Methods are wrapped in arrow functions (`(request) => app.users.register(request)`) because a method passed on its own loses its `this` ([this in depth](https://zudojs.oyinlola.site/learn/js-this)).

And the books: creation rights, a foreign-key error turned into a 400, and paging through three books two at a time:

try-books.tsNode.js only

```ts
import { randomBytes } from "node:crypto";

import { createApp } from "./src/app.js";
import type { ApiRequest } from "./src/http/http.js";
import { run } from "./src/http/run.js";
import { openDatabase } from "./src/infra/database.js";

const db = await openDatabase();
await db.exec(`
  INSERT INTO authors (name) VALUES ('Chinua Achebe'), ('Chimamanda Ngozi Adichie');
  INSERT INTO users (email, password_hash, role, created_at) VALUES
    ('admin@bookstore.test', 'scrypt$not$used', 'admin', '2026-01-05T08:00:00Z'),
    ('ada@example.com', 'scrypt$not$used', 'customer', '2026-02-01T08:00:00Z');`);
const app = createApp({ db, tokenSecret: randomBytes(32).toString("hex"), clock: { now: () => new Date("2026-09-24T10:00:00Z") } });
const admin = app.tokens.issue(1);
const ada = app.tokens.issue(2);
const list = (request: ApiRequest) => app.books.list(request);
const create = (request: ApiRequest) => app.books.create(request);
const update = (request: ApiRequest) => app.books.update(request);

const titles = ["Things Fall Apart", "Arrow of God", "Purple Hibiscus"];
for (const [i, title] of titles.entries()) {
  await run(create, { token: admin, body: { title, authorId: i < 2 ? 1 : 2, priceCents: 1299 - i * 100, stock: i } });
}
console.log(await run(create, { token: ada, body: { title: "My Own Book", authorId: 1, priceCents: 1, stock: 1 } }));
console.log(await run(create, { token: admin, body: { title: "Ghost", authorId: 9, priceCents: 500, stock: 1 } }));

const first = await run(list, { query: "limit=2" });
console.log(first);
const cursor = (JSON.parse(first.slice(4)) as { nextCursor: string }).nextCursor;
console.log(await run(list, { query: `limit=2&cursor=${cursor}` }));
console.log(await run(list, { query: "cursor=bm9wZQ" }));
console.log(await run(list, { query: "limit=500" }));

console.log(await run(update, { token: admin, params: { id: "3" }, body: { stock: 4 } }));
console.log(await run(update, { token: admin, params: { id: "99" }, body: { stock: 4 } }));
console.log(await run(update, { token: admin, params: { id: "1" }, body: { id: 7 } }));
await db.close();
```

Output of `npx tsx try-books.ts`

```ts
403 {"error":{"code":"forbidden","message":"Missing permission: book:create"}}
400 {"error":{"code":"validation","message":"The request is not valid","issues":["authorId 9 does not exist"]}}
200 {"items":[{"id":1,"title":"Things Fall Apart","authorId":1,"price":{"cents":1299,"display":"12.99"},"inStock":false},{"id":2,"title":"Arrow of God","authorId":1,"price":{"cents":1199,"display":"11.99"},"inStock":true}],"nextCursor":"YWZ0ZXI6Mg"}
200 {"items":[{"id":3,"title":"Purple Hibiscus","authorId":2,"price":{"cents":1099,"display":"10.99"},"inStock":true}],"nextCursor":null}
400 {"error":{"code":"validation","message":"The request is not valid","issues":["cursor is not valid"]}}
400 {"error":{"code":"validation","message":"The request is not valid","issues":["limit must be a whole number from 1 to 50"]}}
200 {"id":3,"title":"Purple Hibiscus","authorId":2,"price":{"cents":1099,"display":"10.99"},"inStock":true}
404 {"error":{"code":"not_found","message":"No book with id 99"}}
400 {"error":{"code":"validation","message":"The request is not valid","issues":["id cannot be set"]}}
```

The first page has two books and a cursor. Following the cursor gives the last book and `nextCursor: null`: the end. A made-up cursor and a limit of 500 are both refused. And a body that tries to change a book's `id` is refused by the allow-list, not silently ignored.

## On the network

The controllers take an `ApiRequest` and return an `ApiResponse`, so any HTTP server can drive them. The router from [BookStore API: HTTP and routing](https://zudojs.oyinlola.site/learn/bookstore-http#router) works; here is a compact adapter so this lesson runs on its own. The route table is typed, so a handler that returns something other than a promised `ApiResponse` does not compile:

src/http/server.tsNode.js only

```ts
import { createServer } from "node:http";
import type { Server } from "node:http";

import { AppError } from "../shared/errors.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { toErrorResponse } from "./http.js";

export type Route = readonly [method: string, pattern: string, handler: (request: ApiRequest) => Promise<ApiResponse<unknown>>];

function match(pattern: string, path: string): Record<string, string> | undefined {
  const want = pattern.split("/").filter(Boolean);
  const got = path.split("/").filter(Boolean);
  if (want.length !== got.length) return undefined;
  const params: Record<string, string> = {};
  for (const [i, part] of want.entries()) {
    if (part.startsWith(":")) params[part.slice(1)] = got[i]!;
    else if (part !== got[i]) return undefined;
  }
  return params;
}

function invalid(issue: string): AppError {
  return new AppError({ kind: "validation", issues: [issue] });
}

async function readJson(req: AsyncIterable<unknown>): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    if (!Buffer.isBuffer(chunk)) throw invalid("the body must be bytes");
    size += chunk.length;
    if (size > 100_000) throw invalid("the body must be at most 100000 bytes");
    chunks.push(chunk);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw invalid("the body is not valid JSON");
  }
}

export function serve(routes: readonly Route[]): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let response: ApiResponse<unknown>;
    try {
      const found = routes
        .filter(([method]) => method === req.method)
        .map(([, pattern, handler]) => ({ handler, params: match(pattern, url.pathname) }))
        .find((candidate) => candidate.params !== undefined);
      if (found === undefined) response = { status: 404, body: { error: { code: "not_found", message: "No such route" } } };
      else response = await found.handler({ params: found.params ?? {}, query: url.searchParams, headers: req.headers, body: await readJson(req) });
    } catch (error) {
      response = toErrorResponse(error);
    }
    res.writeHead(response.status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(response.body));
  });
}
```

try-http.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { once } from "node:events";

import { createApp } from "./src/app.js";
import { openDatabase } from "./src/infra/database.js";
import { serve } from "./src/http/server.js";

const db = await openDatabase();
await db.exec(`INSERT INTO authors (name) VALUES ('Chinua Achebe');
  INSERT INTO books (title, author_id, price_cents, stock, created_at)
  VALUES ('Things Fall Apart', 1, 1299, 3, '2026-09-01T09:00:00Z');`);
const app = createApp({ db, tokenSecret: randomBytes(32).toString("hex"), clock: { now: () => new Date("2026-09-24T10:00:00Z") } });

const server = serve([
  ["POST", "/users", (request) => app.users.register(request)],
  ["PATCH", "/users/:id", (request) => app.users.update(request)],
  ["GET", "/books", (request) => app.books.list(request)],
  ["POST", "/books", (request) => app.books.create(request)],
  ["PATCH", "/books/:id", (request) => app.books.update(request)],
]).listen(0);
await once(server, "listening");
const address = server.address();
if (address === null || typeof address === "string") throw new Error("expected a TCP address");
const base = `http://localhost:${address.port}`;

async function call(method: string, path: string, body?: string): Promise<void> {
  const response = await fetch(base + path, { method, body, headers: { "content-type": "application/json" } });
  const text = await response.text();
  console.log(method, path, response.status, text);
}

await call("POST", "/users", '{"email":"ada@example.com","password":"a long passphrase"}');
await call("POST", "/users", '{"email":"ada@example.com","password":"a long passphrase"}');
await call("POST", "/users", "{oops");
await call("GET", "/books?limit=1");
await call("POST", "/books", '{"title":"Kindred","authorId":1,"priceCents":1099,"stock":2}');
server.close();
await db.close();
```

Output of `npx tsx try-http.ts`

```ts
POST /users 201 {"id":1,"email":"ada@example.com","role":"customer","displayName":null,"createdAt":"2026-09-24T10:00:00.000Z"}
POST /users 409 {"error":{"code":"conflict","message":"That e-mail is already registered"}}
POST /users 400 {"error":{"code":"validation","message":"The request is not valid","issues":["the body is not valid JSON"]}}
GET /books?limit=1 200 {"items":[{"id":1,"title":"Things Fall Apart","authorId":1,"price":{"cents":1299,"display":"12.99"},"inStock":true}],"nextCursor":null}
POST /books 401 {"error":{"code":"unauthenticated","message":"Log in and send your token"}}
```

Broken JSON is a 400, not a crash; a duplicate e-mail is a 409 from the repository; creating a book without a token is a 401. Every error body has the same typed shape, `ErrorBody`, so a client can handle all of them with one piece of code.

## Testing a service with a fake

Dependency inversion pays off in tests. `BookService` only knows the `BookRepository` interface, so a test can hand it a **fake**: a small, real implementation that keeps books in an array. No database, no startup time, and `implements BookRepository` makes the compiler check that the fake really fits the port:

tests/book.service.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { Book, BookChanges, NewBook } from "../src/books/book.js";
import { BookService } from "../src/books/book.service.js";
import type { BookRepository } from "../src/ports.js";
import { AppError } from "../src/shared/errors.js";

class MemoryBookRepository implements BookRepository {
  readonly books: Book[] = [];

  async listAfter(afterId: number, limit: number): Promise<Book[]> {
    return this.books.filter((book) => book.id > afterId).slice(0, limit);
  }

  async create(book: NewBook): Promise<Book> {
    const saved = { ...book, id: this.books.length + 1 };
    this.books.push(saved);
    return saved;
  }

  async update(id: number, changes: BookChanges): Promise<Book | undefined> {
    const index = this.books.findIndex((book) => book.id === id);
    if (index === -1) return undefined;
    const updated = { ...this.books[index]!, ...changes };
    this.books[index] = updated;
    return updated;
  }
}

const clock = { now: () => new Date("2026-09-24T10:00:00Z") };
const admin = { userId: 1, role: "admin" } as const;
const customer = { userId: 2, role: "customer" } as const;
const dto = { title: "Things Fall Apart", authorId: 1, priceCents: 1299, stock: 3 };

describe("BookService", () => {
  let repository: MemoryBookRepository;
  let service: BookService;

  beforeEach(() => {
    repository = new MemoryBookRepository();
    service = new BookService(repository, clock);
  });

  it("lets an admin create a book", async () => {
    const book = await service.create(admin, dto);
    assert.equal(book.id, 1);
    assert.deepEqual(book.createdAt, clock.now());
  });

  it("refuses customers and anonymous callers", async () => {
    await assert.rejects(service.create(customer, dto), (error: unknown) =>
      error instanceof AppError && error.failure.kind === "forbidden");
    await assert.rejects(service.create(undefined, dto), (error: unknown) =>
      error instanceof AppError && error.failure.kind === "unauthenticated");
    assert.equal(repository.books.length, 0);
  });

  it("pages without gaps or repeats", async () => {
    for (let i = 0; i < 5; i++) await service.create(admin, { ...dto, title: `Book ${i + 1}` });
    const first = await service.list({ limit: 2, afterId: 0 });
    const second = await service.list({ limit: 2, afterId: 2 });
    const last = await service.list({ limit: 2, afterId: 4 });
    assert.deepEqual([first, second, last].map((page) => page.items.map((book) => book.id)), [[1, 2], [3, 4], [5]]);
    assert.equal(last.nextCursor, null);
    assert.notEqual(first.nextCursor, null);
  });
});
```

Output of `npx tsx tests/book.service.test.ts`

```ts
▶ BookService
  ✔ lets an admin create a book (6.473254ms)
  ✔ refuses customers and anonymous callers (8.765458ms)
  ✔ pages without gaps or repeats (16.971839ms)
✔ BookService (36.284989ms)
ℹ tests 3
ℹ suites 1
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 574.325759
```

The fast tests check the rules (permissions, paging). The PGlite demos above are the slower integration check that the SQL and the mappers are right. [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies), next, goes much further with fakes, stubs, spies and contract tests.

## What still goes wrong

- **Validation before authorization.** The controller parses the body before the service checks permissions, so a customer who sends a broken book gets 400 with the list of issues, not 403. That tells a stranger a little about your rules. If that matters, check the permission in the controller first as well; keep the check in the service anyway, because the service has other callers.
- **403 or 404 for someone else's record?** A 403 on `/users/1` confirms that user 1 exists. For private resources, answer 404 to anyone who may not see it, so ids cannot be probed. The first exercise does this.
- **Casts at the edges.** `JSON.parse(…) as T`, `rows as User[]` and a quick `as Principal` each turn off the checks this lesson built. Every `as` at a boundary should have a guard or a parser instead.
- **Drift between the parser and the DTO.** The allowed-keys list in `parseUpdateBook` and the fields of `UpdateBookDTO` are written twice and can disagree. Schema libraries fix that by deriving the type from the schema: [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation).
- **Offset pages and changing data.** Cursor paging by id stays correct while books are added. Sorting by price or title needs a cursor that holds the sort key and the id, so ties are broken; [Pagination and versioning in depth](https://zudojs.oyinlola.site/learn/api-pagination-versioning) builds that.

In production, keep the error mapping and the permission table in one place each, log the `Principal` with every request (never the token), and review every new response field as a publishing decision. [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture) later separates the domain rules from the application layer further, and [Permissions](https://zudojs.oyinlola.site/learn/zudo-permissions), in the ZudoJS course, replaces the hand-written `GRANTS` table with a full policy engine.

## Practice

TRY IT YOURSELF

### A private profile

Add `GET /users/:id`. A user may read their own profile and an admin may read anyone's. Anyone else gets **404**, not 403, so ids cannot be probed. Write it as a function that uses the project's repository, and try it as Ada, as the admin and with no token.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Start with `const principal = requirePrincipal(await auth.principalFrom(request));` and `const id = toId(request.params["id"]);`. Those two lines alone give you the 401 case.

HINT 2

`const user = principal.userId === id || principal.role === "admin" ? await users.findById(id) : undefined;`, then `if (user === undefined) throw new AppError({ kind: "not_found", resource: "user", id });`.

SOLUTION

try-get-user.tsNode.js only

```ts
import { randomBytes } from "node:crypto";

import { Authenticator, toId } from "./src/http/http.js";
import type { ApiRequest, ApiResponse } from "./src/http/http.js";
import { run } from "./src/http/run.js";
import { openDatabase } from "./src/infra/database.js";
import { HmacTokens } from "./src/infra/security.js";
import { PgUserRepository } from "./src/infra/user.repository.js";
import { AppError } from "./src/shared/errors.js";
import { requirePrincipal } from "./src/shared/policy.js";
import { toUserResponse } from "./src/users/user.dto.js";
import type { UserResponse } from "./src/users/user.dto.js";

const db = await openDatabase();
await db.exec(`INSERT INTO users (email, password_hash, role, created_at) VALUES
  ('admin@bookstore.test', 'x', 'admin', '2026-01-05T08:00:00Z'),
  ('ada@example.com', 'x', 'customer', '2026-02-01T08:00:00Z'),
  ('bola@example.com', 'x', 'customer', '2026-03-01T08:00:00Z')`);
const users = new PgUserRepository(db);
const tokens = new HmacTokens(randomBytes(32).toString("hex"));
const auth = new Authenticator(tokens, users);

async function getUser(request: ApiRequest): Promise<ApiResponse<UserResponse>> {
  const principal = requirePrincipal(await auth.principalFrom(request));
  const id = toId(request.params["id"]);
  const user = principal.userId === id || principal.role === "admin" ? await users.findById(id) : undefined;
  if (user === undefined) throw new AppError({ kind: "not_found", resource: "user", id });
  return { status: 200, body: toUserResponse(user) };
}

const ada = tokens.issue(2);
console.log(await run(getUser, { params: { id: "2" }, token: ada }));
console.log(await run(getUser, { params: { id: "3" }, token: ada }));
console.log(await run(getUser, { params: { id: "99" }, token: ada }));
console.log(await run(getUser, { params: { id: "3" }, token: tokens.issue(1) }));
console.log(await run(getUser, { params: { id: "3" } }));
await db.close();
```

Output of `npx tsx try-get-user.ts`

```ts
200 {"id":2,"email":"ada@example.com","role":"customer","displayName":null,"createdAt":"2026-02-01T08:00:00.000Z"}
404 {"error":{"code":"not_found","message":"No user with id 3"}}
404 {"error":{"code":"not_found","message":"No user with id 99"}}
200 {"id":3,"email":"bola@example.com","role":"customer","displayName":null,"createdAt":"2026-03-01T08:00:00.000Z"}
401 {"error":{"code":"unauthenticated","message":"Log in and send your token"}}
```

Ada gets the same 404 for Bola (who exists) and for user 99 (who does not), so she cannot tell them apart. Anonymous callers still get 401: telling them to log in reveals nothing.

TRY IT YOURSELF

### Add a failure kind

Add `{ kind: "rate_limited"; retryAfterSeconds: number }` to a copy of the failure union, and make the mapping compile again: status 429, a message that says when to retry, and the response should carry a `Retry-After` header value.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Add the member to the `Failure` union first; TypeScript will then point at `STATUS` and the `switch`, which both need a `"rate_limited"` entry.

HINT 2

`case "rate_limited": return \`Too many requests, try again in ${failure.retryAfterSeconds} seconds\`;` and `const headers = failure.kind === "rate_limited" ? { "retry-after": String(failure.retryAfterSeconds) } : {};`.

SOLUTION

rate-limited.ts

```ts
type Failure =
  | { readonly kind: "validation"; readonly issues: readonly string[] }
  | { readonly kind: "not_found"; readonly resource: string }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number };

const STATUS = {
  validation: 400,
  not_found: 404,
  rate_limited: 429,
} as const satisfies Record<Failure["kind"], number>;

function messageFor(failure: Failure): string {
  switch (failure.kind) {
    case "validation": return "The request is not valid";
    case "not_found": return `No such ${failure.resource}`;
    case "rate_limited": return `Too many requests, try again in ${failure.retryAfterSeconds} seconds`;
  }
}

function toResponse(failure: Failure) {
  const headers = failure.kind === "rate_limited" ? { "retry-after": String(failure.retryAfterSeconds) } : {};
  return { status: STATUS[failure.kind], headers, message: messageFor(failure) };
}

console.log(toResponse({ kind: "rate_limited", retryAfterSeconds: 30 }));
console.log(toResponse({ kind: "not_found", resource: "book" }));
```

Output of `npx tsx rate-limited.ts` and of the browser terminal

```json
{
  status: 429,
  headers: { 'retry-after': '30' },
  message: 'Too many requests, try again in 30 seconds'
}
{ status: 404, headers: {}, message: 'No such book' }
```

The compiler listed exactly the two places to change. Inside `failure.kind === "rate_limited"`, TypeScript knows `retryAfterSeconds` exists; you learned that narrowing in [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing).

TRY IT YOURSELF

### Which layer owns it?

Place each job in a layer (DTO parser, mapper, service, repository, controller): (a) "the price must be a whole number of cents"; (b) "only admins may change prices"; (c) "turn `price_cents` into `priceCents`"; (d) "show the price as `12.99`"; (e) "a customer's second order today gets free delivery"; (f) "read the `Authorization` header".

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Ask, for each job: does it only care about the shape of the input, about column names, about presentation, or about a business rule that needs data?

HINT 2

(b) and (e) both need a decision that depends on who is asking or on other data; which layer is the only one that knows nothing about HTTP or SQL, yet is allowed to hold that logic?

SOLUTION

(a) The DTO parser: it is about the shape of the input. (b) The service: it depends on who is asking. (c) The repository's row mapper: only it knows column names. (d) The response mapper: presentation for the client. (e) The service: a business rule that needs data (today's orders) and knows nothing about HTTP or SQL. (f) The HTTP layer, the `Authenticator`: headers are an HTTP idea, and the service only ever sees the resulting `Principal`.

## Recap

- One record has several shapes: the database row, the entity, request DTOs (create, update) and a response DTO. Give each its own type, and write one mapper per arrow between them.
- Request parsers use allow-lists and refuse unknown fields, which stops mass assignment. Update DTOs keep "not sent" and `null` apart, all the way into the SQL.
- Response mappers name every field they publish. `Omit` is a deny-list and leaks every new field; structural typing will not stop an entity with extra fields.
- Expected failures are a discriminated union. One exhaustive mapping turns each kind into a status and a typed error body.
- Cursor pages use a generic `Page<T>`, fetch one extra row to find the next page, and treat the cursor as untrusted input.
- Authentication produces a `Principal`; authorization checks a typed permission table in the service, where every caller passes.
- Services depend on interfaces (repositories, hasher, clock), so tests use fakes and the composition root is the only place that knows the concrete classes.

Next: [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies), where you test this kind of layered code at every level, from pure functions to the whole API under load.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
