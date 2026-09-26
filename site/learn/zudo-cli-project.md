---
title: "A whole project through the CLI — ZudoJS Academy"
description: "Build a hall-booking API from zudojs create to a Docker image, generating each layer with the CLI and writing the business rules and tests the generator can't."
source: https://zudojs.oyinlola.site/learn/zudo-cli-project
---

LEVEL 19 · LESSON 7 OF 10

Capstone Production

# A whole project through the CLI

Build a hall-booking API from zudojs create to a Docker image, generating each layer with the CLI and writing the business rules and tests the generator can't.

- **70 min** to read and try
- **You need:** The ZudoJS CLI in depth, Anatomy of a ZudoJS project and Deploying a ZudoJS app
- **You build:** bookings-api, a modular-monolith hall-booking API made with the CLI, with real booking rules, OpenAPI docs, tests that cover what generated tests miss, and a Docker image

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Take a project from zudojs create to a running Docker container using only commands the CLI really has
- Turn generated resources and paginated in-memory stores into real business rules without breaking the generator's wiring
- Know which schematic fits a given job, and when none of them do
- Write the tests generated tests cannot: races, wiring and the double-booking rule
- Say which delivery steps belong to the CLI, which to npm scripts and which to your deployment

## The problem: an API by Friday

An events company in Lagos rents out halls for weddings, conferences and birthday parties. Today a receptionist keeps the bookings in a notebook, and twice this year the same hall was promised to two families for the same Saturday. They want an API that their new website can call:

- Staff add halls, each with a **capacity** (how many guests fit) and a **daily rate** in naira.
- A customer can ask "is Eko Hall free on 24 December, and what does it cost?"
- A customer books a hall for one date. **A hall is never booked twice for the same date**, and never for more guests than it holds.
- The website team needs API documentation, and the operations team wants a container image it can run.

In [The ZudoJS CLI in depth](https://zudojs.oyinlola.site/learn/zudo-cli) you learned every command one at a time, and in [Anatomy of a ZudoJS project](https://zudojs.oyinlola.site/learn/zudo-project-anatomy) you traced the files `zudojs create` writes. This lesson puts both to work: one project, from an empty folder to a container, using the CLI for everything it can do and your own code for everything it cannot. A recent audit of the generator ([issues #7 to #19, #64, #135, #141](https://github.com/oyinlola-tech/zudo/issues/7)) fixed most of the sharp edges an earlier version of this lesson had to teach you to work around — unexpected errors are logged now, list endpoints paginate, `/docs` is off in production, tests are type-checked, and more. What is left is smaller and more honest: one schematic whose shape does not fit this job, a missing-markers mistake you can still make, and the delivery steps the CLI was never going to have.

Every shell output below is from a real run of `zudojs-cli` 2.2.0 on Node.js 24, in a folder that is written as `~/code`. Every code output comes from running the code on this page.

### The plan

| Step | Command | Who does the work |
| --- | --- | --- |
| Create | `zudojs create` | The CLI |
| Module, resources, schema, validator | `zudojs generate module \| resource \| dto \| validator` | The CLI writes the files; you write the rules |
| A service inside a module | none that works (see below) | You |
| Tests | no `generate test`; `resource` writes one test file | You write the tests that matter |
| Run | `zudojs dev` | The CLI runs your `dev` script |
| API docs | `--capabilities openapi` at create time | The CLI mounts them; your schemas fill them |
| Build, test | `zudojs build`, `npm test` | Your npm scripts (`tsc`, Vitest) |
| Deploy | `zudojs add docker`, then Docker | The CLI writes a Dockerfile; there is no `deploy` command |

## Step 1: create the project

The company expects more areas later (invoices, staff rotas), so start as a **modular monolith**: one process, with each area in its own module folder, as in [the modular monolith lesson](https://zudojs.oyinlola.site/learn/zudo-modular-monolith). Ask for the OpenAPI capability now, so the docs are wired from the start. The spinner lines are shortened here:

Terminal on your computer

```bash
$ zudojs create bookings-api --architecture modular-monolith --package-manager npm --capabilities openapi
│
◇  Project structure created
│
◇  Backend project generated (41 files)
Capabilities build on: http

added 65 packages, and audited 66 packages in 13s
…
◆  Dependencies installed
◇  Project validated
◇  Git repository initialized
│
└  Project created successfully.
$ cd bookings-api
$ zudojs doctor
Zudojs Doctor - Project Diagnostics

✔ Node.js version: Node.js v24.19.0 (meets minimum v24)
✔ Git: git version 2.53.0
✔ Package manager (npm): 11.19.0
✔ Zudojs project: backend (modular-monolith) from .zudojs/manifest.json
✔ Package manager: npm (lock file present)
✔ Dependencies installed: node_modules present
✔ TypeScript configuration: tsconfig.json found in every app
✔ Zudojs dependencies: 17 Zudojs package(s) declared
✔ Features: Every declared feature has its package
✔ Capabilities: The manifest and package.json record the same capabilities

All checks passed!
$ git add -A && git commit -qm "zudojs create"
```

That last line matters more than it looks. `create` initialised a git repository but made no commit, and every `generate` from now on edits several files at once. With a commit before each step, `git diff` shows exactly what the generator did, and `git restore .` plus `git clean -fd` undo it. Make it a habit: **commit, generate, read the diff**.

## Step 2: a module and two resources

All the booking work lives in one module, `scheduling`. Preview it, then generate it:

Terminal on your computer

```bash
$ zudojs generate module scheduling --dry-run
Detected architecture: modular-monolith
Dry run: 8 files would be generated (nothing written):
  - src/modules/scheduling/scheduling.module.ts
  - src/modules/scheduling/index.ts
  - src/modules/index.ts
  - src/modules/scheduling/features/scheduling.feature.ts
  - src/modules/scheduling/features/index.ts
  - src/modules/scheduling/routes/index.ts
  - src/routes/index.ts
  - src/app.ts
$ zudojs generate module scheduling
Detected architecture: modular-monolith
Generated 8 files:
  - src/modules/scheduling/scheduling.module.ts
  - src/modules/scheduling/index.ts
  - src/modules/index.ts
  - src/modules/scheduling/features/scheduling.feature.ts
  - src/modules/scheduling/features/index.ts
  - src/modules/scheduling/routes/index.ts
  - src/app.ts
  - src/routes/index.ts
$ git diff --stat
 src/app.ts           | 2 ++
 src/modules/index.ts | 1 +
 src/routes/index.ts  | 2 ++
 3 files changed, 5 insertions(+)
```

Dry run and real run now agree: both list eight files, including `src/app.ts`, which is where `generate module` adds `new SchedulingModule()` to the runtime's list. A dry run used to promise seven and the real run wrote eight, which meant reading the diff was the only way to find out what else changed; that gap is closed (issue #10). Reading the diff after every `generate` is still worth doing — several commands edit a shared file, and the diff is what tells you which lines are yours to keep. The module's own `routes/index.ts` has an empty pair of `// zudojs:routes` markers, and the app's `src/routes/index.ts` now calls it.

Now the two resources, inside the module:

Terminal on your computer

```bash
$ zudojs generate resource halls --module scheduling
Detected architecture: modular-monolith
Generated 8 files:
  - src/modules/scheduling/dtos/halls.dto.ts
  - src/modules/scheduling/repositories/halls.repository.ts
  - src/modules/scheduling/services/halls.service.ts
  - src/modules/scheduling/controllers/halls.controller.ts
  - src/modules/scheduling/routes/halls.routes.ts
  - tests/modules/scheduling/halls.test.ts
  - src/modules/scheduling/routes/index.ts
  - src/container.ts
$ zudojs generate resource bookings --module scheduling
Detected architecture: modular-monolith
Generated 8 files:
  - src/modules/scheduling/dtos/bookings.dto.ts
  - src/modules/scheduling/repositories/bookings.repository.ts
  - src/modules/scheduling/services/bookings.service.ts
  - src/modules/scheduling/controllers/bookings.controller.ts
  - src/modules/scheduling/routes/bookings.routes.ts
  - tests/modules/scheduling/bookings.test.ts
  - src/modules/scheduling/routes/index.ts
  - src/container.ts
$ npm run typecheck && npm test
…
 Test Files  3 passed (3)
      Tests  12 passed (12)
```

Each resource is a working CRUD endpoint (create, read, update, delete) with a `name` field, a paginated in-memory repository and a test. "Paginated" is new: `GET /api/v1/halls` used to answer every record it held (up to 10,000) in one array; it now takes `?limit=` (1–200, default 50) and `?cursor=` and answers `{ items, nextCursor }`, `nextCursor` being `null` on the last page (issue #141). The repository's contract changed to match: `list(page)` instead of `findAll()`. None of that is a booking system yet: a "booking" with only a name knows nothing about halls, dates or guests. The rest of the lesson turns the skeleton into the product. The three test files are the two new ones (now filed under `tests/modules/scheduling/`, so two modules can each have a same-named resource without their tests colliding — issue #9) plus the example resource's `tests/examples.test.ts`; you will delete the example resource in [Step 6](#wiring).

## Step 3: a schematic that doesn't fit the job

Booking needs one piece of logic that belongs to neither resource: "is this hall free on this date, and what does it cost?" That is a **service**, a class holding a use case, and the CLI has a `service` schematic. In a modular monolith it used to ignore `--module` entirely and create a whole second top-level module named after the service, registered with the runtime and the router, exit code 0. That bug is fixed (issue #8): `--module <existing>` now means "a service layer inside that module". Try it:

Terminal on your computer

```bash
$ zudojs generate service availability --module scheduling --dry-run
Detected architecture: modular-monolith
Dry run: 3 files would be generated (nothing written):
  - src/modules/scheduling/dtos/availability.dto.ts
  - src/modules/scheduling/repositories/availability.repository.ts
  - src/modules/scheduling/services/availability.service.ts
$ zudojs generate service availability --module scheduling
Detected architecture: modular-monolith
Generated 3 files:
  - src/modules/scheduling/dtos/availability.dto.ts
  - src/modules/scheduling/repositories/availability.repository.ts
  - src/modules/scheduling/services/availability.service.ts
$ echo $?
0
```

Everything landed inside `src/modules/scheduling/` this time, and nothing was registered with the router — `service` was never one of the schematics that wires itself in. But open the three files: they give `Availability` its own `id`, its own in-memory store, and a service with the same `list`/`get`/`create`/`update`/`remove` shape as halls and bookings. That is the right shape for a new entity you plan to persist. Availability is not an entity: it is a question answered by reading the hall and the booking repositories that already exist. Generating a fourth store here would be a working `create`/`list`/`delete` that nothing in the app would ever call — dead code that compiles and passes its own generated test. Undo it:

Terminal on your computer

```bash
$ git restore . && git clean -fd src/modules/scheduling/dtos/availability.dto.ts src/modules/scheduling/repositories/availability.repository.ts src/modules/scheduling/services/availability.service.ts
Removing src/modules/scheduling/dtos/availability.dto.ts
Removing src/modules/scheduling/repositories/availability.repository.ts
Removing src/modules/scheduling/services/availability.service.ts
$ git status --short
```

Nothing is left. Every resource-family schematic now respects `--module`; these dry runs all write inside `src/modules/scheduling/`:

| Command (with `--module scheduling`) | Writes |
| --- | --- |
| `generate repository payments` | `dtos/payments.dto.ts`, `repositories/payments.repository.ts` |
| `generate controller invoices` | dto, repository, `services/invoices.service.ts`, controller |
| `generate dto quotes` | `dtos/quotes.dto.ts` |
| `generate validator booking` | `validators/booking.validator.ts` |
| `generate command confirm-booking` | `commands/confirm-booking/`: command, handler, index |

None of them scaffold "a class that composes two existing repositories", because there is no generic shape for that — it is exactly the kind of use case every schematic in this table leaves for you to design. So there are two honest ways to get a service that fits: generate the closest layer (`controller`, which cascades down to a service) and cut it down to what you need, or write the file yourself in `src/modules/scheduling/services/`. The availability service depends on two existing repositories rather than owning one, so you will write it by hand in [Step 6](#services).

## Step 4: decide the rules, then write the schemas

Before you touch a DTO, decide what a valid booking is. This is where most real bugs are born, not in the code.

REASON IT OUT

### What can go wrong with a booking?

A customer sends `{ hallId, date, customerEmail, guests }`. Think through each question before reading on:

1. Two families press "Book" for Eko Hall on 24 December at the same moment. What must happen?
2. What does "today" mean for a company in Lagos when the server's clock runs in UTC? Can someone book yesterday?
3. The date arrives as a string. Is `"2026-02-30"` a date? Is `"24/12/2026"`?
4. How do you store ₦500,000 so that no rounding ever loses a kobo?
5. Who decides the price: the request, or the hall?
6. `Ada@Example.com` and `ada@example.com`: one customer or two?
7. The `hallId` is a well-formed UUID, but no hall has it. Which status code?

**Show the reasoning**

1. Exactly one wins; the other gets **409 Conflict**. That rule must hold inside the storage layer, not only in a check before it, because two requests can both pass a check before either writes. You will see this race for real in [Step 5](#repository).
2. The business runs on Lagos time, so "today" is the date in `Africa/Lagos`, whatever the server's clock says. A date before today is refused with **400**. The service gets its "today" from a function you can replace in tests.
3. Neither. Accept only `YYYY-MM-DD`, and check that it is a real calendar day: 30 February is not.
4. As whole **kobo** in an integer (₦1 = 100 kobo), the same reason ShopFlow stores cents. ₦500,000 is `50_000_000`.
5. The hall. The request never carries a price; the service copies the hall's daily rate into the booking, so a later price change does not alter old bookings.
6. One. Trim and lower-case the e-mail in the schema.
7. **404**, from the service, which is the layer that knows halls exist. Bad shape (not a UUID at all) is **400** from the controller's schema.

### Money and time, checked first

Two of those answers are easy to get wrong in plain JavaScript, so check them before building on them. Displaying kobo as naira is a job for `Intl.NumberFormat`, never for string concatenation:

naira.js

```ts
const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
const formatKobo = (kobo) => naira.format(kobo / 100);

const dailyRateKobo = 50_000_000;
console.log(formatKobo(dailyRateKobo));
console.log(formatKobo(3 * dailyRateKobo));
console.log(Number.isSafeInteger(dailyRateKobo * 365));
```

Output of `node naira.js` and of the browser terminal

```ts
₦500,000.00
₦1,500,000.00
true
```

Division by 100 happens only for display; every sum stays in integer kobo. And "today" depends on where you are standing. At 23:30 UTC on 24 September it is already 25 September in Lagos (UTC+1):

lagos-today.js

```ts
const lagosDate = (instant) => instant.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

const lateEvening = new Date("2026-09-24T23:30:00Z");
console.log("UTC date:  ", lateEvening.toISOString().slice(0, 10));
console.log("Lagos date:", lagosDate(lateEvening));
console.log("24 Dec is not in the past:", "2026-12-24" >= lagosDate(lateEvening));
```

Output of `node lagos-today.js` and of the browser terminal

```ts
UTC date:   2026-09-24
Lagos date: 2026-09-25
24 Dec is not in the past: true
```

The `en-CA` locale writes dates as `YYYY-MM-DD`, and dates in that form compare correctly as plain strings, which is why the last line needs no date parsing.

### The validator

For "is this a real calendar date" the CLI has a schematic:

Terminal on your computer

```bash
$ zudojs generate validator booking-date --module scheduling
Detected architecture: modular-monolith
Generated 1 file:
  - src/modules/scheduling/validators/booking-date.validator.ts
$ cat src/modules/scheduling/validators/booking-date.validator.ts
import { schema, type Infer, type SchemaResult } from "@zudojs/schema";

/** Shape of a valid booking-date. Replace the fields with your own. */
export const BookingDateSchema = schema.object({
  id: schema.string().min(1),
});

export type BookingDate = Infer<typeof BookingDateSchema>;

/**
 * Validates `input` against {@link BookingDateSchema}. On failure the result
 * carries the issues (path and message) instead of throwing.
 */
export function validateBookingDate(input: unknown): SchemaResult<BookingDate> {
  return BookingDateSchema.safeParse(input);
}
```

It used to write `validate<Name>(input) { return true; }`, a stub that compiled, had a convincing name and accepted everything with no warning; that is fixed (issue #12) — what it writes now is a real, working validator. Just not for this job. The schematic assumes you are validating a whole record (an object with fields, the way a DTO looks), so it gives `BookingDate` an `id` and hands back a `SchemaResult`. What `.refine()` needs below is one boolean answer to "is this string a real calendar day", not an object schema. Replace the whole body:

src/modules/scheduling/validators/booking-date.validator.ts

```ts
/**
 * booking-date validator.
 */

const PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `input` is a real calendar date written as YYYY-MM-DD. */
export function validateBookingDate(input: unknown): boolean {
  if (typeof input !== "string" || !PATTERN.test(input)) return false;
  const date = new Date(`${input}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === input;
}
```

validator-check.ts

```ts
import { validateBookingDate } from "./src/modules/scheduling/validators/booking-date.validator.js";

const regexOnly = (input: unknown): boolean => typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input);

for (const input of ["2026-12-24", "2026-02-30", "2028-02-29", "24/12/2026", "2026-12-24T10:00", 20261224]) {
  console.log(String(input).padEnd(17), "regex only:", regexOnly(input), " real:", validateBookingDate(input));
}
```

Output of `npx tsx validator-check.ts` and of the browser terminal

```ts
2026-12-24        regex only: true  real: true
2026-02-30        regex only: true  real: false
2028-02-29        regex only: true  real: true
24/12/2026        regex only: false  real: false
2026-12-24T10:00  regex only: false  real: false
20261224          regex only: false  real: false
```

The regex alone gets the shape right and stops there: `2026-02-30` matches four digits, a dash, two digits, a dash, two digits, and regex has no idea February has 28 or 29 days. The trick is the round trip: JavaScript quietly turns 30 February into 2 March, so a date is real only if printing it back gives the same text. 2028 is a leap year, so 29 February passes.

### The schemas

The generated DTO files hold the **schemas**: one `@zudojs/schema` definition gives both the runtime check and the TypeScript type, as in [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation). Replace the `name` fields with the real ones:

src/modules/scheduling/dtos/halls.dto.ts

```ts
import { schema, type Infer } from "@zudojs/schema";

/** A hall as the API returns it. Money is in kobo (₦1 = 100 kobo). */
export const HallSchema = schema.object({
  id: schema.string().uuid(),
  name: schema.string(),
  capacity: schema.number().int(),
  dailyRateKobo: schema.number().int(),
  createdAt: schema.string(),
  updatedAt: schema.string(),
});

/** Body of `POST /api/v1/halls`. Unknown fields are dropped. */
export const CreateHallSchema = schema.object({
  name: schema.string().trim().min(1).max(100),
  capacity: schema.number().int().min(1).max(5000),
  dailyRateKobo: schema.number().int().min(100).max(1_000_000_000),
});

/** Body of `PATCH /api/v1/halls/:id`. Every field is optional. */
export const UpdateHallSchema = CreateHallSchema.partial();

/** Path parameters of the `/api/v1/halls/:id` routes. */
export const HallParamsSchema = schema.object({
  id: schema.string().uuid(),
});

/** Page size when `limit` is not given, and the most a client may ask for. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Query of `GET /api/v1/halls`: page size and the id to continue after. */
export const ListHallsQuerySchema = schema.object({
  limit: schema.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: schema.string().uuid().optional(),
});

/** One page of hall records; `nextCursor` is null on the last page. */
export const HallPageSchema = schema.object({
  items: schema.array(HallSchema),
  nextCursor: schema.nullable(schema.string().uuid()),
});

/** What a repository is asked for: a page size and where to continue. */
export interface HallPageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

export type Hall = Infer<typeof HallSchema>;
export type CreateHallInput = Infer<typeof CreateHallSchema>;
export type UpdateHallInput = Infer<typeof UpdateHallSchema>;
export type ListHallsQuery = Infer<typeof ListHallsQuerySchema>;
export type HallPage = Infer<typeof HallPageSchema>;
```

The generated DTO already carried the pagination schemas above (`DEFAULT_PAGE_SIZE`, `ListHallsQuerySchema`, `HallPageSchema`, `HallPageRequest`); only `capacity` and `dailyRateKobo` are new.

src/modules/scheduling/dtos/bookings.dto.ts

```ts
import { schema, type Infer } from "@zudojs/schema";

import { validateBookingDate } from "../validators/booking-date.validator.js";

/** A booking as the API returns it. */
export const BookingSchema = schema.object({
  id: schema.string().uuid(),
  hallId: schema.string().uuid(),
  date: schema.string(),
  customerEmail: schema.string(),
  guests: schema.number().int(),
  amountKobo: schema.number().int(),
  createdAt: schema.string(),
  updatedAt: schema.string(),
});

/** Body of `POST /api/v1/bookings`. Unknown fields are dropped. */
export const CreateBookingSchema = schema.object({
  hallId: schema.string().uuid(),
  date: schema.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validateBookingDate, "Expected a real date written as YYYY-MM-DD"),
  customerEmail: schema.string().trim().toLowerCase().email(),
  guests: schema.number().int().min(1),
});

/** Body of `PATCH /api/v1/bookings/:id`. Every field is optional. */
export const UpdateBookingSchema = schema.object({
  guests: schema.number().int().min(1).optional(),
});

/** Path parameters of the `/api/v1/bookings/:id` routes. */
export const BookingParamsSchema = schema.object({
  id: schema.string().uuid(),
});

/** Page size when `limit` is not given, and the most a client may ask for. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Query of `GET /api/v1/bookings`: page size and the id to continue after. */
export const ListBookingsQuerySchema = schema.object({
  limit: schema.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: schema.string().uuid().optional(),
});

/** One page of booking records; `nextCursor` is null on the last page. */
export const BookingPageSchema = schema.object({
  items: schema.array(BookingSchema),
  nextCursor: schema.nullable(schema.string().uuid()),
});

/** What a repository is asked for: a page size and where to continue. */
export interface BookingPageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

export type Booking = Infer<typeof BookingSchema>;
export type CreateBookingInput = Infer<typeof CreateBookingSchema>;
export type UpdateBookingInput = Infer<typeof UpdateBookingSchema>;
export type ListBookingsQuery = Infer<typeof ListBookingsQuerySchema>;
export type BookingPage = Infer<typeof BookingPageSchema>;
/** What the repository stores: the input plus the price the service worked out. */
export type NewBooking = CreateBookingInput & { readonly amountKobo: number };
```

Notice what is *not* in `CreateBookingSchema`: no price, no status. The date has both a `regex` and the validator: the regex is visible in the API documentation as a `pattern` (you will see it in [Step 7](#docs)), while the `refine` is a check the documentation cannot describe. The halls repository keeps the generated `list`, which already pages by cursor, and needs two new lines in `create` and two in `update`, so it copies `capacity` and `dailyRateKobo`; here is the file after that edit:

src/modules/scheduling/repositories/halls.repository.ts

```ts
import { randomUUID } from "node:crypto";

import { ConflictError } from "@zudojs/errors";

import type { CreateHallInput, Hall, HallPage, HallPageRequest, UpdateHallInput } from "../dtos/halls.dto.js";

/** Storage contract for hall records; the service depends on this only. */
export interface HallsRepository {
  /** One page in creation order, continuing after `cursor` when given. */
  list(page: HallPageRequest): Promise<HallPage>;
  findById(id: string): Promise<Hall | undefined>;
  create(input: CreateHallInput): Promise<Hall>;
  update(id: string, input: UpdateHallInput): Promise<Hall | undefined>;
  delete(id: string): Promise<boolean>;
}

/** Most records the in-memory store keeps, so it cannot exhaust memory. */
const MAX_RECORDS = 10_000;

/**
 * Keeps hall records in process memory: for development and tests.
 * Data is lost on restart. Swap the implementation in container.ts.
 */
export class InMemoryHallsRepository implements HallsRepository {
  private readonly records = new Map<string, Hall>();

  public async list(page: HallPageRequest): Promise<HallPage> {
    // A Map iterates in insertion order, which is creation order here.
    const all = [...this.records.values()];
    let start = 0;
    if (page.cursor !== undefined) {
      const at = all.findIndex((record) => record.id === page.cursor);
      if (at === -1) return { items: [], nextCursor: null };
      start = at + 1;
    }
    const items = all.slice(start, start + page.limit);
    const last = items.at(-1);
    const nextCursor = last !== undefined && start + page.limit < all.length ? last.id : null;
    return { items, nextCursor };
  }

  public async findById(id: string): Promise<Hall | undefined> {
    return this.records.get(id);
  }

  public async create(input: CreateHallInput): Promise<Hall> {
    if (this.records.size >= MAX_RECORDS) {
      throw new ConflictError("The in-memory hall store is full.");
    }
    const now = new Date().toISOString();
    const record: Hall = {
      id: randomUUID(),
      name: input.name,
      capacity: input.capacity,
      dailyRateKobo: input.dailyRateKobo,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  public async update(
    id: string,
    input: UpdateHallInput,
  ): Promise<Hall | undefined> {
    const existing = this.records.get(id);
    if (existing === undefined) return undefined;
    const updated: Hall = {
      ...existing,
      name: input.name ?? existing.name,
      capacity: input.capacity ?? existing.capacity,
      dailyRateKobo: input.dailyRateKobo ?? existing.dailyRateKobo,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}
```

## Step 5: the repository and the double booking

The bookings repository needs a lookup by hall and date, and its `create` must refuse a hall that is already taken. The first version most people write looks like this: ask, then insert.

src/modules/scheduling/repositories/bookings.repository.ts

```ts
import { randomUUID } from "node:crypto";

import { ConflictError } from "@zudojs/errors";

import type { Booking, BookingPage, BookingPageRequest, NewBooking, UpdateBookingInput } from "../dtos/bookings.dto.js";

/** Storage contract for booking records; the service depends on this only. */
export interface BookingsRepository {
  /** One page in creation order, continuing after `cursor` when given. */
  list(page: BookingPageRequest): Promise<BookingPage>;
  findById(id: string): Promise<Booking | undefined>;
  findByHallAndDate(hallId: string, date: string): Promise<Booking | undefined>;
  /** Throws ConflictError when the hall is already booked on that date. */
  create(input: NewBooking): Promise<Booking>;
  update(id: string, input: UpdateBookingInput): Promise<Booking | undefined>;
  delete(id: string): Promise<boolean>;
}

/** Most records the in-memory store keeps, so it cannot exhaust memory. */
const MAX_RECORDS = 10_000;

/**
 * Keeps booking records in process memory: for development and tests.
 * Data is lost on restart. Swap the implementation in container.ts.
 */
export class InMemoryBookingsRepository implements BookingsRepository {
  private readonly records = new Map<string, Booking>();

  public async list(page: BookingPageRequest): Promise<BookingPage> {
    // A Map iterates in insertion order, which is creation order here.
    const all = [...this.records.values()];
    let start = 0;
    if (page.cursor !== undefined) {
      const at = all.findIndex((record) => record.id === page.cursor);
      if (at === -1) return { items: [], nextCursor: null };
      start = at + 1;
    }
    const items = all.slice(start, start + page.limit);
    const last = items.at(-1);
    const nextCursor = last !== undefined && start + page.limit < all.length ? last.id : null;
    return { items, nextCursor };
  }

  public async findById(id: string): Promise<Booking | undefined> {
    return this.records.get(id);
  }

  public async findByHallAndDate(hallId: string, date: string): Promise<Booking | undefined> {
    return this.taken(hallId, date);
  }

  public async create(input: NewBooking): Promise<Booking> {
    if (this.records.size >= MAX_RECORDS) {
      throw new ConflictError("The in-memory booking store is full.");
    }
    // Check and insert with no await in between, so two requests cannot both pass.
    if (this.taken(input.hallId, input.date) !== undefined) {
      throw new ConflictError(`The hall is already booked on ${input.date}.`);
    }
    const now = new Date().toISOString();
    const record: Booking = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.records.set(record.id, record);
    return record;
  }

  public async update(id: string, input: UpdateBookingInput): Promise<Booking | undefined> {
    const existing = this.records.get(id);
    if (existing === undefined) return undefined;
    const updated: Booking = {
      ...existing,
      guests: input.guests ?? existing.guests,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  private taken(hallId: string, date: string): Booking | undefined {
    for (const record of this.records.values()) {
      if (record.hallId === hallId && record.date === date) return record;
    }
    return undefined;
  }
}
```

The file above is the *finished* version. The comment in `create` is the whole story: the check uses the private, synchronous `taken`, not `await this.findByHallAndDate(…)`. That one `await` makes the difference between one booking and two. Here are both versions, each asked to book the same hall twice at the same moment:

race.tsNode.js only

```ts
import { ConflictError } from "@zudojs/errors";

import type { Booking, NewBooking } from "./src/modules/scheduling/dtos/bookings.dto.js";
import { InMemoryBookingsRepository } from "./src/modules/scheduling/repositories/bookings.repository.js";

// The first draft: look up with await, then insert.
class AwaitThenInsertRepository {
  private readonly records: Booking[] = [];

  async findByHallAndDate(hallId: string, date: string): Promise<Booking | undefined> {
    return this.records.find((record) => record.hallId === hallId && record.date === date);
  }

  async create(input: NewBooking): Promise<Booking> {
    if ((await this.findByHallAndDate(input.hallId, input.date)) !== undefined) {
      throw new ConflictError(`The hall is already booked on ${input.date}.`);
    }
    const record: Booking = { id: crypto.randomUUID(), ...input, createdAt: "", updatedAt: "" };
    this.records.push(record);
    return record;
  }
}

const ada: NewBooking = {
  hallId: "0b6f3c1e-8d4a-4f7e-9a2b-5c6d7e8f9a0b",
  date: "2026-12-24",
  customerEmail: "ada@example.com",
  guests: 150,
  amountKobo: 50_000_000,
};
const tunde: NewBooking = { ...ada, customerEmail: "tunde@example.com", guests: 80 };

for (const repository of [new AwaitThenInsertRepository(), new InMemoryBookingsRepository()]) {
  const results = await Promise.allSettled([repository.create(ada), repository.create(tunde)]);
  console.log(repository.constructor.name.padEnd(27), results.map((result) => result.status).join(", "));
}
```

Output of `npx tsx race.ts`

```ts
AwaitThenInsertRepository   fulfilled, fulfilled
InMemoryBookingsRepository  fulfilled, rejected
```

Follow the first line step by step. Ada's `create` calls `findByHallAndDate` and hits `await`, which pauses it until the next microtask. Tunde's `create` now starts, looks, finds nothing (Ada has not inserted yet) and pauses too. Then Ada inserts, then Tunde inserts. Two families, one hall. In the finished version there is no pause between looking and inserting, so JavaScript's single thread runs Ada's check-and-insert to the end before Tunde's begins. This is the [race condition](https://zudojs.oyinlola.site/learn/js-concurrency) from the concurrency lesson, and the in-memory version of what a database `UNIQUE (hall_id, date)` constraint gives you for free.

> THIS ONLY HOLDS IN ONE PROCESS
>
> A `Map` in memory is correct for one process. Run two copies of the app behind a load balancer and each has its own `Map`, so both can accept the same date. When you move to PostgreSQL, put the rule in the database: `UNIQUE (hall_id, date)`, and turn the unique-violation error into a `ConflictError`.

## Step 6: services and wiring

Now the service the CLI could not generate. It reads from both repositories and answers "free, and at what price". Its `today` is a parameter with the Lagos clock as the default, so a test can pin it to a fixed day:

src/modules/scheduling/services/availability.service.ts

```ts
import { NotFoundError, ValidationError } from "@zudojs/errors";

import type { Hall } from "../dtos/halls.dto.js";
import type { BookingsRepository } from "../repositories/bookings.repository.js";
import type { HallsRepository } from "../repositories/halls.repository.js";

/** Today's date in Lagos as YYYY-MM-DD. */
export const lagosToday = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

/** Whether a hall is free on a date, and what it costs. */
export interface Quote {
  readonly hallId: string;
  readonly date: string;
  readonly available: boolean;
  readonly capacity: number;
  readonly amountKobo: number;
}

/** Answers "can this hall be booked on this date?" for the bookings module. */
export class AvailabilityService {
  public constructor(
    private readonly halls: HallsRepository,
    private readonly bookings: BookingsRepository,
    private readonly today: () => string = lagosToday,
  ) {}

  public async hall(hallId: string): Promise<Hall> {
    const hall = await this.halls.findById(hallId);
    if (hall === undefined) throw new NotFoundError(`Hall "${hallId}" was not found.`);
    return hall;
  }

  public async quote(hallId: string, date: string): Promise<Quote> {
    const hall = await this.hall(hallId);
    if (date < this.today()) throw new ValidationError(`${date} is in the past.`);
    const booking = await this.bookings.findByHallAndDate(hallId, date);
    return { hallId, date, available: booking === undefined, capacity: hall.capacity, amountKobo: hall.dailyRateKobo };
  }
}
```

The generated `BookingsService.create` passed input straight to the repository, and its `list` just forwarded the query. `list` is unchanged — the generated paging already does what a list endpoint needs — but `create` now asks for a quote, checks the guest count, and stores the hall's price, and `update` re-checks the guest count against the hall's real capacity:

src/modules/scheduling/services/bookings.service.ts

```ts
import { NotFoundError, ValidationError } from "@zudojs/errors";

import { DEFAULT_PAGE_SIZE } from "../dtos/bookings.dto.js";
import type { Booking, BookingPage, CreateBookingInput, ListBookingsQuery, UpdateBookingInput } from "../dtos/bookings.dto.js";
import type { BookingsRepository } from "../repositories/bookings.repository.js";
import type { AvailabilityService } from "./availability.service.js";

/** Booking use cases. Throws NotFoundError (404), ValidationError (400), ConflictError (409). */
export class BookingsService {
  public constructor(
    private readonly repository: BookingsRepository,
    private readonly availability: AvailabilityService,
  ) {}

  /** One page of booking records (`limit` defaults to DEFAULT_PAGE_SIZE). */
  public list(query: ListBookingsQuery): Promise<BookingPage> {
    return this.repository.list({
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
  }

  public async get(id: string): Promise<Booking> {
    const record = await this.repository.findById(id);
    if (record === undefined) throw notFound(id);
    return record;
  }

  public async create(input: CreateBookingInput): Promise<Booking> {
    const quote = await this.availability.quote(input.hallId, input.date);
    checkGuests(input.guests, quote.capacity);
    return this.repository.create({ ...input, amountKobo: quote.amountKobo });
  }

  public async update(id: string, input: UpdateBookingInput): Promise<Booking> {
    const existing = await this.get(id);
    if (input.guests !== undefined) {
      checkGuests(input.guests, (await this.availability.hall(existing.hallId)).capacity);
    }
    const record = await this.repository.update(id, input);
    if (record === undefined) throw notFound(id);
    return record;
  }

  public async remove(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw notFound(id);
  }
}

function checkGuests(guests: number, capacity: number): void {
  if (guests > capacity) throw new ValidationError(`The hall holds ${capacity} guests, not ${guests}.`);
}

function notFound(id: string): NotFoundError {
  return new NotFoundError(`Booking "${id}" was not found.`);
}
```

`create` does not check `quote.available`: the repository is the one place that can decide that without a race, so the service lets it. Every rule from the reasoning block now has a home. Run them all against the real classes, with "today" pinned to 1 October:

booking-rules.tsNode.js only

```ts
import { InMemoryBookingsRepository } from "./src/modules/scheduling/repositories/bookings.repository.js";
import { InMemoryHallsRepository } from "./src/modules/scheduling/repositories/halls.repository.js";
import { AvailabilityService } from "./src/modules/scheduling/services/availability.service.js";
import { BookingsService } from "./src/modules/scheduling/services/bookings.service.js";
import type { CreateBookingInput } from "./src/modules/scheduling/dtos/bookings.dto.js";

const halls = new InMemoryHallsRepository();
const bookings = new InMemoryBookingsRepository();
const availability = new AvailabilityService(halls, bookings, () => "2026-10-01");
const service = new BookingsService(bookings, availability);
const eko = await halls.create({ name: "Eko Hall", capacity: 200, dailyRateKobo: 50_000_000 });

async function attempt(label: string, input: CreateBookingInput): Promise<void> {
  try {
    const booking = await service.create(input);
    console.log(`${label.padEnd(9)} 201 booked for ${booking.amountKobo} kobo`);
  } catch (error) {
    const { statusCode, name, message } = error as Error & { statusCode: number };
    console.log(`${label.padEnd(9)} ${statusCode} ${name}: ${message}`);
  }
}

const ada = { hallId: eko.id, date: "2026-12-24", customerEmail: "ada@example.com", guests: 150 };
await attempt("ada", ada);
await attempt("tunde", { ...ada, customerEmail: "tunde@example.com", guests: 80 });
await attempt("too many", { ...ada, date: "2026-12-26", guests: 350 });
await attempt("past", { ...ada, date: "2026-09-30" });
await attempt("no hall", { ...ada, hallId: "7a1c7a0e-5d7e-4f5b-9c1d-2b3e4f5a6b7c" });

const quote = await availability.quote(eko.id, "2026-12-24");
console.log("24 Dec available:", quote.available, "| 25 Dec available:", (await availability.quote(eko.id, "2026-12-25")).available);
```

Output of `npx tsx booking-rules.ts`

```ts
ada       201 booked for 50000000 kobo
tunde     409 ConflictError: The hall is already booked on 2026-12-24.
too many  400 ValidationError: The hall holds 200 guests, not 350.
past      400 ValidationError: 2026-09-30 is in the past.
no hall   404 NotFoundError: Hall "7a1c7a0e-5d7e-4f5b-9c1d-2b3e4f5a6b7c" was not found.
24 Dec available: false | 25 Dec available: true
```

Each rule answers with the status the reasoning block chose, and the error classes from `@zudojs/errors` carry that status themselves, so the controller and `dispatch` need no mapping table. The quote at the end sees Ada's booking because the service and the availability check share one repository object. Making them share it in the running app is the next job.

### Wiring at the composition root

The generator wired each resource with its own repository: `new BookingsService(new InMemoryBookingsRepository())`. Now two services must *share* the same repositories, which the generator cannot know. Build them once in `src/container.ts`, **outside** the markers, and delete the example resource while you are there (its five files, its test, and its lines):

src/container.ts (part)

```ts
export function createDependencies(options: DependencyOptions = {}) {
  const health: HealthCheck =
    options.health ?? (async () => ({ ready: true, checks: {} }));

  // Shared by two services, so built once, outside the markers.
  const hallsRepository = new InMemoryHallsRepository();
  const bookingsRepository = new InMemoryBookingsRepository();
  const availability = new AvailabilityService(hallsRepository, bookingsRepository);

  return {
    health,
    availability,
    hallsController: new HallsController(new HallsService(hallsRepository)),
    bookingsController: new BookingsController(new BookingsService(bookingsRepository, availability)),
    // zudojs:container:start
    // zudojs:container:end
  };
}
```

The availability route is yours too. It uses the small HTTP helpers every generated controller uses, from `src/utils/http.ts`. That file is unchanged from `zudojs create` (the [anatomy lesson](https://zudojs.oyinlola.site/learn/zudo-project-anatomy#request) explains each function); it is repeated here because the examples below run against it. `errorResponse` and `errorDetails` are what `src/server.ts` uses to log and answer unexpected errors by default — Step 8 puts them to work directly:

src/utils/http.ts

```ts
import {
  badRequest,
  createResponseContext,
  type HttpMiddleware,
  type HttpResponseContext,
  type HttpRouterContext,
} from "@zudojs/http";
import type { SchemaIssue } from "@zudojs/schema";
import { generateSecurityHeaders } from "@zudojs/security";

/** A JSON response with `status`. */
export function json(status: number, data: unknown): HttpResponseContext {
  return createResponseContext({ status }).json(data);
}

/** A response with no body (for example 204). */
export function empty(status: number): HttpResponseContext {
  return createResponseContext({ status });
}

/** 400 listing where the input failed validation, without echoing it back. */
export function validationFailed(issues: readonly SchemaIssue[]): HttpResponseContext {
  return json(400, {
    error: "Validation failed",
    issues: issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}

/**
 * The request body parsed as JSON; `undefined` when there is none.
 * Malformed JSON is answered with 400.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
}

/**
 * The response for an error that carries an exposed HTTP status
 * (NotFoundError, badRequest(), an exposed 503, ...): its status, message
 * and code. `undefined` for anything else; server.ts then logs the error
 * and answers a generic 500 that never leaks the message.
 */
export function errorResponse(error: unknown): HttpResponseContext | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    readonly statusCode?: unknown;
    readonly expose?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
  };
  const status = candidate.statusCode;
  if (typeof status !== "number" || status < 400 || status > 599) return undefined;
  if (candidate.expose !== true || typeof candidate.message !== "string") return undefined;
  return json(status, {
    error: candidate.message,
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
  });
}

/** What the log records about an unexpected error: name, message, code, stack. */
export function errorDetails(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { error: String(error) };
  const { code } = error as { readonly code?: unknown };
  return {
    error: error.message,
    name: error.name,
    ...(typeof code === "string" ? { code } : {}),
    ...(error.stack === undefined ? {} : { stack: error.stack }),
  };
}

/**
 * Adds the @zudojs/security default headers (CSP, HSTS, nosniff,
 * X-Frame-Options DENY, ...) to every response that does not set its own:
 * the /docs page, for instance, sends a CSP that allows its assets.
 */
export function securityHeaders(): HttpMiddleware {
  const defaults = Object.entries(generateSecurityHeaders());
  return async (_context, next) => {
    const response = (await next()).clone();
    const present = new Set(Object.keys(response.headers).map((name) => name.toLowerCase()));
    for (const [name, value] of defaults) {
      if (!present.has(name.toLowerCase())) response.setHeader(name, value);
    }
    return response;
  };
}
```

The route lives next to the generated routes and is registered, again, above the markers in the module's `routes/index.ts`:

src/modules/scheduling/routes/availability.routes.ts

```ts
import type { HttpRouter } from "@zudojs/http";
import { schema } from "@zudojs/schema";

import { json, validationFailed } from "../../../utils/http.js";
import { HallParamsSchema } from "../dtos/halls.dto.js";
import type { AvailabilityService } from "../services/availability.service.js";
import { validateBookingDate } from "../validators/booking-date.validator.js";

const AvailabilityQuerySchema = schema.object({
  date: schema.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validateBookingDate, "Expected a real date written as YYYY-MM-DD"),
});

/** GET /api/v1/halls/:id/availability?date=YYYY-MM-DD, written by hand. */
export function registerAvailabilityRoutes(router: HttpRouter, availability: AvailabilityService): void {
  router.get(
    "/api/v1/halls/:id/availability",
    async (ctx) => {
      const params = HallParamsSchema.safeParse(ctx.params);
      if (!params.success) return validationFailed(params.issues);
      const query = AvailabilityQuerySchema.safeParse(ctx.query);
      if (!query.success) return validationFailed(query.issues);
      return json(200, await availability.quote(params.data.id, query.data.date));
    },
    {
      openapi: {
        summary: "Check whether a hall is free on a date",
        tags: ["halls"],
        params: HallParamsSchema,
        query: AvailabilityQuerySchema,
        responses: { "200": { description: "Availability and price" }, "400": { description: "Bad id or date" }, "404": { description: "No such hall" } },
      },
    },
  );
}
```

src/modules/scheduling/routes/index.ts

```ts
import type { HttpRouter } from "@zudojs/http";

import type { AppDependencies } from "../../../container.js";
import { registerAvailabilityRoutes } from "./availability.routes.js";
// zudojs:route-imports:start
import { registerHallsRoutes } from "./halls.routes.js";
import { registerBookingsRoutes } from "./bookings.routes.js";
// zudojs:route-imports:end

/** Registers this module's routes; called from the app's routes/index.ts. */
export function registerSchedulingModuleRoutes(router: HttpRouter, deps: AppDependencies): void {
  registerAvailabilityRoutes(router, deps.availability);
  // zudojs:routes:start
  registerHallsRoutes(router, deps.hallsController);
  registerBookingsRoutes(router, deps.bookingsController);
  // zudojs:routes:end
}
```

The controller and routes files the generator wrote for bookings need no change at all: they validate with the DTO schemas, which you changed, and call the service, which you changed. That is the layering paying off.

### What `--force` would do now

You moved the bookings wiring out of the markers on purpose. What happens if a teammate later regenerates the resource "to get the latest template"?

Terminal on your computer

```bash
$ zudojs generate resource bookings --module scheduling --force
Detected architecture: modular-monolith
Generated 7 files:
  - src/modules/scheduling/dtos/bookings.dto.ts
  - src/modules/scheduling/repositories/bookings.repository.ts
  - src/modules/scheduling/services/bookings.service.ts
  - src/modules/scheduling/controllers/bookings.controller.ts
  - src/modules/scheduling/routes/bookings.routes.ts
  - tests/modules/scheduling/bookings.test.ts
  - src/container.ts
$ npm run typecheck
…
src/container.ts(46,88): error TS2554: Expected 1 arguments, but got 2.
src/container.ts(47,5): error TS1117: An object literal cannot have multiple properties with the same name.
src/modules/scheduling/services/availability.service.ts(36,41): error TS2339: Property 'findByHallAndDate' does not exist on type 'BookingsRepository'.
$ git restore .
```

The DTO, repository and service went back to the plain `name` template, and the generator added a second `bookingsController` line between the markers, because the line it looks for is the one it would itself have written — `new BookingsController(new BookingsService(new InMemoryBookingsRepository()))` — and yours no longer matches that text once you gave it a second constructor argument. A registration merely moved out of the markers unchanged is now recognised and left alone (issue #135); one that was edited is not, because the tool cannot tell an edit from a rewrite it should not touch. Here the type checker caught it; a change the types cannot see would have been lost silently. The rule is unchanged: once you have written real code in a resource, never `--force` it, and if you must, commit first and read the whole diff.

## Step 7: test, run and read the docs

### The generated tests break, and the type checker catches it

Terminal on your computer

```bash
$ npm run typecheck

> bookings-api@0.1.0 typecheck
> tsc --noEmit && tsc -p tsconfig.test.json

tests/modules/scheduling/bookings.test.ts(14,26): error TS2554: Expected 2 arguments, but got 1.
```

`tests/modules/scheduling/bookings.test.ts` still calls `new BookingsService(new InMemoryBookingsRepository())` with one argument, where the class now needs two. Every generated backend ships a second config, `tsconfig.test.json` (the same options over `src/` and `tests/`, `noEmit`), and `typecheck` already runs `tsc --noEmit && tsc -p tsconfig.test.json`. Tests used to be excluded from the main config with no second config to catch them, so this exact wiring mistake passed `typecheck` silently and only showed up as a failing test, or not at all if the test still happened to compile; that gap is closed (issue #135), and there is no separate command to remember. Fix the constructor call, and the tests still fail, for a second and separate reason:

Terminal on your computer

```bash
$ npm test
…
 FAIL  tests/modules/scheduling/bookings.test.ts > /api/v1/bookings > creates, reads, updates and deletes a booking
AssertionError: Expected status 201, got 400.
  request:  POST /api/v1/bookings
  response: 400 Bad Request
  body:     {"error":"Validation failed","issues":[{"path":"hallId","message":"Required field missing: hallId"},{"path":"date","message":"Required field missing: date"},{"path":"customerEmail","message":"Required field missing: customerEmail"},{"path":"guests","message":"Required field missing: guests"}]}
…
 Test Files  2 failed (2)
      Tests  4 failed | 4 passed (8)
```

This failure is expected, and the type checker cannot catch it: the tests still send `{ name: "Ada" }`, a shape that satisfies the compiler (both are objects) but not the schema, which now wants `hallId`, `date`, `customerEmail` and `guests`. Two tests fail in each file — the CRUD test and the new paging test, since both create records — while the two validation tests still pass by coincidence (an empty `name` and a bad id are still 400, just for a different reason). Rewrite both tests for the real fields; the full suite is in [Step 9](#tests).

### Run it

`zudojs dev` prints what it detected and runs your `dev` script; `-p` sets `PORT`:

Terminal on your computer

```bash
$ cp .env.example .env
$ zudojs dev -p 4100
Project type: backend
Backend architecture: modular-monolith
Starting backend: npm run dev

> bookings-api@0.1.0 dev
> tsx watch src/server.ts

2026-09-25T00:07:09.491Z [INFO] [bookings-api] scheduling module initialized
2026-09-25T00:07:09.494Z [INFO] [bookings-api] All modules initialized. modules=["integrations","scheduling"] durationMs=5
2026-09-25T00:07:09.495Z [INFO] [bookings-api] All modules started. modules=["integrations","scheduling"] durationMs=0
2026-09-25T00:07:09.496Z [INFO] [bookings-api] Runtime is ready. runtimeId=rt_83ceb57ee8774e26905f45ae9fe60057 environment=development
Listening on http://0.0.0.0:4100
```

In a second terminal, play the receptionist's worst day. `$HALL` holds the id from the first answer:

Second terminal

```bash
$ curl -s -X POST localhost:4100/api/v1/halls -H 'content-type: application/json' -d '{"name":"Eko Hall","capacity":200,"dailyRateKobo":50000000}'
{"id":"4609fe32-515a-41b9-b4c9-76efd7bf7b5c","name":"Eko Hall","capacity":200,"dailyRateKobo":50000000,"createdAt":"2026-09-25T00:07:09.664Z","updatedAt":"2026-09-25T00:07:09.664Z"}
$ HALL=4609fe32-515a-41b9-b4c9-76efd7bf7b5c
$ curl -s "localhost:4100/api/v1/halls/$HALL/availability?date=2026-12-24"
{"hallId":"4609fe32-515a-41b9-b4c9-76efd7bf7b5c","date":"2026-12-24","available":true,"capacity":200,"amountKobo":50000000}
$ curl -s -w ' %{http_code}\n' -X POST localhost:4100/api/v1/bookings -H 'content-type: application/json' -d "{\"hallId\":\"$HALL\",\"date\":\"2026-12-24\",\"customerEmail\":\"Ada@Example.com\",\"guests\":150}"
{"id":"feae5a98-3455-4c95-9979-bf1bb2d82abf","hallId":"4609fe32-515a-41b9-b4c9-76efd7bf7b5c","date":"2026-12-24","customerEmail":"ada@example.com","guests":150,"amountKobo":50000000,"createdAt":"2026-09-25T00:07:09.766Z","updatedAt":"2026-09-25T00:07:09.766Z"} 201
$ curl -s -w ' %{http_code}\n' -X POST localhost:4100/api/v1/bookings -H 'content-type: application/json' -d "{\"hallId\":\"$HALL\",\"date\":\"2026-12-24\",\"customerEmail\":\"tunde@example.com\",\"guests\":80}"
{"error":"The hall is already booked on 2026-12-24.","code":"ERR_CONFLICT"} 409
$ curl -s -w ' %{http_code}\n' -X POST localhost:4100/api/v1/bookings -H 'content-type: application/json' -d "{\"hallId\":\"$HALL\",\"date\":\"2026-02-30\",\"customerEmail\":\"tunde@example.com\",\"guests\":80}"
{"error":"Validation failed","issues":[{"path":"date","message":"Expected a real date written as YYYY-MM-DD"}]} 400
$ curl -s "localhost:4100/api/v1/halls/$HALL/availability?date=2026-12-24"
{"hallId":"4609fe32-515a-41b9-b4c9-76efd7bf7b5c","date":"2026-12-24","available":false,"capacity":200,"amountKobo":50000000}
```

The second availability answer is `available: false`: the two services really share one repository. Two things happen in the first terminal as you work. Every time you save a file, `tsx watch` restarts the server with `SIGTERM`, so the log shows `Received SIGTERM: shutting down.` and a full graceful shutdown. And after the restart, `curl localhost:4100/api/v1/halls` answers `{"items":[],"nextCursor":null}`: the in-memory repositories forgot everything. That is fine for development and fatal in production.

### The API documentation

Because you asked for `--capabilities openapi`, `src/server.ts` contains `mountOpenAPI(router, …)`, which serves `/openapi.json` and a documentation page at `/docs`, built from the routes and their schemas as in [the OpenAPI lesson](https://zudojs.oyinlola.site/learn/zudo-openapi). The generated routes and your hand-written one all appear; the enquiries resource you will add in Step 8 will join them the moment it registers:

Second terminal

```bash
$ curl -s localhost:4100/openapi.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);console.log(d.openapi, d.info.title, d.info.version);for(const [p,ops] of Object.entries(d.paths))console.log(p.padEnd(34), Object.keys(ops).map(m=>m.toUpperCase()).join(" "))})'
3.1.0 bookings-api 0.1.0
/api/v1/halls/{id}/availability    GET
/api/v1/halls                      GET POST
/api/v1/halls/{id}                 GET PATCH DELETE
/api/v1/bookings                   GET POST
/api/v1/bookings/{id}              GET PATCH DELETE
$ curl -s -o /dev/null -w '%{http_code} %{content_type}\n' localhost:4100/docs
200 text/html; charset=utf-8
```

The document is only as good as your schemas. This runs the real availability route and prints how its query parameter is documented, then calls it with a good and a bad date:

openapi-check.tsNode.js only

```ts
import { createRouter, mountOpenAPI } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { InMemoryBookingsRepository } from "./src/modules/scheduling/repositories/bookings.repository.js";
import { InMemoryHallsRepository } from "./src/modules/scheduling/repositories/halls.repository.js";
import { registerAvailabilityRoutes } from "./src/modules/scheduling/routes/availability.routes.js";
import { AvailabilityService } from "./src/modules/scheduling/services/availability.service.js";

const halls = new InMemoryHallsRepository();
const availability = new AvailabilityService(halls, new InMemoryBookingsRepository(), () => "2026-10-01");
const eko = await halls.create({ name: "Eko Hall", capacity: 200, dailyRateKobo: 50_000_000 });

const router = createRouter();
registerAvailabilityRoutes(router, availability);
mountOpenAPI(router, { info: { title: "bookings-api", version: "0.1.0" } });
const client = createHttpTestClient(router);

type Operation = { parameters: Array<{ in: string; name: string; schema: unknown }> };
const doc = (await client.get("/openapi.json")).json<{ paths: Record<string, { get: Operation }> }>();
for (const parameter of doc.paths["/api/v1/halls/{id}/availability"]!.get.parameters) {
  console.log(parameter.in.padEnd(5), parameter.name.padEnd(4), JSON.stringify(parameter.schema));
}
console.log((await client.get(`/api/v1/halls/${eko.id}/availability?date=2026-12-24`)).text);
const bad = await client.get(`/api/v1/halls/${eko.id}/availability?date=24-12-2026`);
console.log(bad.status, bad.text);
await client.close();
```

Output of `npx tsx openapi-check.ts`

```ts
path  id   {"type":"string","format":"uuid","maxLength":255}
query date {"type":"string","maxLength":255,"pattern":"^\\d{4}-\\d{2}-\\d{2}$"}
{"hallId":"3e2f2228-f73a-4c1d-8e79-6b575d16b24a","date":"2026-12-24","available":true,"capacity":200,"amountKobo":50000000}
400 {"error":"Validation failed","issues":[{"path":"date","message":"String does not match pattern"}]}
```

The `regex` became a `pattern` the website team can read. Before you added the regex, the `date` was documented as just `"type":"string"`: the validator's `refine` runs, but no document can describe a JavaScript function. When a rule matters to your callers, express as much of it as you can in a form the schema can publish, and write the rest in the route's `summary` or `description`.

## Step 8: what still needs watching, and what is fixed

You have already met the one schematic that does not fit this job (Step 3) and replaced a generated validator built for a different shape (Step 4). One more mistake is still yours to make, and it is now loud instead of silent. Two others used to live in this step — unlogged 500s, and a NODE_ENV read twice — and a recent audit of the generator fixed both at the source (issues #13, #14), so a fresh project never has them. The rest of this step shows what the fix looks like, so you recognise the difference if you ever touch an older project without it.

### Missing markers now refuse, instead of warning

While writing the availability route, suppose you had "tidied" the module's `routes/index.ts` and deleted the marker comments. A week later the company wants customers to send enquiries:

Terminal on your computer

```bash
$ zudojs generate resource enquiries --module scheduling
Detected architecture: modular-monolith
Cannot register resource "enquiries": the files it registers into are missing their markers, so nothing was written.
  - src/modules/scheduling/routes/index.ts: add "import { registerEnquiriesRoutes } from "./enquiries.routes.js";" between "// zudojs:route-imports:start" and "// zudojs:route-imports:end" (the markers are missing, so the file was left unchanged)
  - src/modules/scheduling/routes/index.ts: add "registerEnquiriesRoutes(router, deps.enquiriesController);" between "// zudojs:routes:start" and "// zudojs:routes:end" (the markers are missing, so the file was left unchanged)
Restore the marker comments (or add the lines by hand and re-run with --force once the files exist).
$ echo $?
1
```

It used to write all seven files anyway, print `Warning: Finish by hand`, and exit 0 — a script would never notice, `npm run typecheck` would pass, the resource's own test would pass because it builds its own router, and the running server would answer 404 on `/api/v1/enquiries` with nothing written down to explain why. Every check now runs before the first file is written (issue #11): with a marker pair missing, the command fails, names the exact lines, and leaves the project untouched — `ls src/modules/scheduling/dtos/` shows no `enquiries.dto.ts`. Restore the marker comments and re-run; a **smoke test** that builds the router the way `server.ts` does (from [the anatomy lesson](https://zudojs.oyinlola.site/learn/zudo-project-anatomy#tests)) is still worth keeping, for the day a route goes missing some other way — a hand edit that misses a line, say, rather than a schematic run.

### Fixed by default: unexpected errors are logged, and NODE_ENV is read once

`src/server.ts` used to rethrow anything that was not an exposed 4xx error, so the client got a bare 500 and nothing logged it — a database outage would fail every booking with a clean log and no trace of why. The generated `dispatch` (Step 6's `src/utils/http.ts` supplies `errorResponse` and `errorDetails`) now logs the error itself and answers the 500 from inside the middleware pipeline, so it is fixed for every project the CLI creates from here on — there is nothing left for you to write. Reproducing its exact logic with a spy logger shows what a fresh project already does, with a repository whose database connection fails and a hall that does not exist:

dispatch-check.tsNode.js only

```ts
import { NotFoundError } from "@zudojs/errors";
import { HttpMiddlewarePipeline, createRouter, type HttpMiddleware } from "@zudojs/http";
import { createHttpTestClient, createSpyLogger } from "@zudojs/testing";

import { errorDetails, errorResponse, json } from "./src/utils/http.js";

const router = createRouter();
router.get("/api/v1/bookings", async () => {
  throw new Error("connection refused: 10.0.0.5:5432");
});
router.get("/api/v1/halls/:id", async () => {
  throw new NotFoundError("No such hall.");
});

const logger = createSpyLogger("bookings-api");
// The same shape src/server.ts wires by default: nothing here is hand-written.
const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    const response = errorResponse(error);
    if (response !== undefined && response.status < 500) return response;
    logger.error(`Unhandled error: ${context.request.method} ${context.request.path}`, errorDetails(error));
    return response ?? json(500, { error: "Internal Server Error" });
  }
};

const client = createHttpTestClient(new HttpMiddlewarePipeline({ middlewares: [dispatch] }));
for (const path of ["/api/v1/halls/abc", "/api/v1/bookings"]) {
  const response = await client.get(path);
  console.log(response.status, response.text);
}
const [call] = logger.findByMethod("error");
console.log("logged:", call?.message, { name: (call?.metadata as { name?: string }).name, error: (call?.metadata as { error?: string }).error });
await client.close();
```

Output of `npx tsx dispatch-check.ts`

```ts
404 {"error":"No such hall.","code":"ERR_RESOURCE_NOT_FOUND"}
500 {"error":"Internal Server Error"}
logged: Unhandled error: GET /api/v1/bookings { name: 'Error', error: 'connection refused: 10.0.0.5:5432' }
```

The client learns nothing about the internal address; the log has the method, the path, the error's name and message (and its stack and cause, not printed above). The expected 404 stays quiet, because logging every normal "not found" would bury the real problems.

Similarly, `loadConfig` used to store `NODE_ENV` in `config.nodeEnv` while the generated `src/app.ts` called `resolveEnvironment()` a second time with no argument, reading `process.env` directly — the same variable in the running server, a different one the moment a test passed `loadConfig` an explicit environment. `resolveEnvironment` from `@zudojs/constants` accepts the environment to read, and `config.nodeEnv` is now built by calling it once, inside `loadConfig` itself:

environment-check.tsNode.js only

```ts
import { resolveEnvironment } from "@zudojs/constants";

// What loadConfig({ NODE_ENV: "production" }) used to leave in config.nodeEnv,
// before app.ts read the environment a second time:
const config = { nodeEnv: "production" };

console.log("old app.ts (resolveEnvironment(), no argument):", resolveEnvironment());
console.log("current app.ts (passes config.nodeEnv through):", resolveEnvironment({ NODE_ENV: config.nodeEnv }));
```

Output of `npx tsx environment-check.ts`

```ts
old app.ts (resolveEnvironment(), no argument): development
current app.ts (passes config.nodeEnv through): production
```

The first line is what the old code computed inside a test where nothing had set `process.env.NODE_ENV`: `development`, the fallback, whatever `loadConfig` had been told. The second is what `config.nodeEnv` already holds after `loadConfig` resolves it once; `app.ts` now writes `environment: options.config.nodeEnv` and calls `resolveEnvironment` nowhere else. A test that starts the runtime with an explicit environment and asserts `runtime.context.environment` is still worth keeping as a regression guard — Vitest sets `NODE_ENV=test` itself, so a reintroduced second reading would show up as `test` where the test expects `production` — but there is no line left in `src/app.ts` for you to fix.

## Step 9: the tests that matter

There is no `zudojs generate test`. The generated test for each resource is a good CRUD-and-paging check on its own router (it walks the pages the way the generated `halls.test.ts` and `bookings.test.ts` already do); everything that makes this product correct is yours to test. Here is the bookings test, rewritten for the real rules, with a fixed "today" so it passes on every day of the year:

tests/modules/scheduling/bookings.test.ts

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { BookingsController } from "../../../src/modules/scheduling/controllers/bookings.controller.js";
import { InMemoryBookingsRepository } from "../../../src/modules/scheduling/repositories/bookings.repository.js";
import { InMemoryHallsRepository } from "../../../src/modules/scheduling/repositories/halls.repository.js";
import { registerBookingsRoutes } from "../../../src/modules/scheduling/routes/bookings.routes.js";
import { AvailabilityService } from "../../../src/modules/scheduling/services/availability.service.js";
import { BookingsService } from "../../../src/modules/scheduling/services/bookings.service.js";

const halls = new InMemoryHallsRepository();
const bookings = new InMemoryBookingsRepository();
// A fixed "today", so the test gives the same answer on every day of the year.
const availability = new AvailabilityService(halls, bookings, () => "2026-10-01");
const router = createRouter();
registerBookingsRoutes(router, new BookingsController(new BookingsService(bookings, availability)));
const client = createHttpTestClient(router);
afterAll(() => client.close());

let hallId = "";
beforeAll(async () => {
  hallId = (await halls.create({ name: "Eko Hall", capacity: 200, dailyRateKobo: 50_000_000 })).id;
});

const booking = (overrides: Record<string, unknown> = {}) => ({
  hallId,
  date: "2026-12-24",
  customerEmail: " Ada@Example.com ",
  guests: 150,
  ...overrides,
});

describe("/api/v1/bookings", () => {
  it("books a free hall at the hall's price", async () => {
    await client
      .post("/api/v1/bookings")
      .send(booking())
      .expect(201)
      .expectJson({ customerEmail: "ada@example.com", amountKobo: 50_000_000 });
  });

  it("refuses a second booking of the same hall and date", async () => {
    await client.post("/api/v1/bookings").send(booking()).expect(409);
  });

  it("lets only one of two simultaneous bookings win", async () => {
    const service = new BookingsService(bookings, availability);
    const input = { hallId, date: "2026-12-31", customerEmail: "ada@example.com", guests: 10 };
    const both = await Promise.allSettled([service.create(input), service.create(input)]);
    expect(both.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("refuses bad input with 400 and an unknown hall with 404", async () => {
    await client.post("/api/v1/bookings").send(booking({ guests: 201, date: "2027-01-02" })).expect(400);
    await client.post("/api/v1/bookings").send(booking({ date: "2026-02-30" })).expect(400);
    await client.post("/api/v1/bookings").send(booking({ date: "2026-09-30" })).expect(400);
    await client.post("/api/v1/bookings").send(booking({ hallId: crypto.randomUUID() })).expect(404);
  });
});
```

The race test calls the service directly with `Promise.allSettled`, because two requests through the test client happened not to interleave, and a test that only sometimes exercises the race proves nothing. With the `await` version of the repository it fails every time:

Terminal on your computer

```bash
$ npx vitest run tests/modules/scheduling/bookings.test.ts
…
 FAIL  tests/modules/scheduling/bookings.test.ts > /api/v1/bookings > lets only one of two simultaneous bookings win
AssertionError: expected [ 'fulfilled', 'fulfilled' ] to deeply equal [ 'fulfilled', 'rejected' ]
```

The one test this project still needs that nothing generates is a smoke test — proof that the real, wired-up app serves every route, not just the router each resource test builds for itself:

tests/smoke.test.ts

```ts
import { afterAll, describe, it } from "vitest";
import { createRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { createDependencies } from "../src/container.js";
import { registerRoutes } from "../src/routes/index.js";

// The router exactly as server.ts builds it: this catches lost wiring.
const router = createRouter();
registerRoutes(router, createDependencies());
const client = createHttpTestClient(router);
afterAll(() => client.close());

describe("wiring", () => {
  it("serves every route the app should have", async () => {
    await client.get("/health").expect(200);
    await client.get("/api/v1/bookings").expect(200);
    await client.get("/api/v1/enquiries").expect(200);
    const hall = await client
      .post("/api/v1/halls")
      .send({ name: "Smoke Hall", capacity: 10, dailyRateKobo: 1_000_000 })
      .expect(201);
    const { id } = hall.json<{ id: string }>();
    await client.get(`/api/v1/halls/${id}/availability?date=2099-01-01`).expect(200);
  });
});
```

Unlogged 500s and a double reading of `NODE_ENV` no longer need a project-specific test to guard against, because the behaviour they used to threaten now lives in the framework and the generator, not in code this project owns — Step 8's two demonstrations are the closest thing to a test for them, and re-running those after an upgrade is enough. With the smoke test and the two updated generated tests, the whole suite:

Terminal on your computer

```bash
$ npm run typecheck && npx vitest run --reporter=verbose
…
 ✓ tests/smoke.test.ts > wiring > serves every route the app should have 573ms
 ✓ tests/modules/scheduling/halls.test.ts > /api/v1/halls > creates, reads, updates and deletes a hall 399ms
 ✓ tests/modules/scheduling/halls.test.ts > /api/v1/halls > lists hall records a page at a time 46ms
 ✓ tests/modules/scheduling/halls.test.ts > /api/v1/halls > rejects an invalid body with 400 14ms
 ✓ tests/modules/scheduling/halls.test.ts > /api/v1/halls > rejects an id that is not a UUID with 400 5ms
 ✓ tests/modules/scheduling/enquiries.test.ts > /api/v1/enquiries > creates, reads, updates and deletes an enquiry 239ms
 ✓ tests/modules/scheduling/enquiries.test.ts > /api/v1/enquiries > lists enquiry records a page at a time 51ms
 ✓ tests/modules/scheduling/enquiries.test.ts > /api/v1/enquiries > rejects an invalid body with 400 16ms
 ✓ tests/modules/scheduling/enquiries.test.ts > /api/v1/enquiries > rejects an id that is not a UUID with 400 11ms
 ✓ tests/modules/scheduling/bookings.test.ts > /api/v1/bookings > books a free hall at the hall's price 140ms
 ✓ tests/modules/scheduling/bookings.test.ts > /api/v1/bookings > refuses a second booking of the same hall and date 30ms
 ✓ tests/modules/scheduling/bookings.test.ts > /api/v1/bookings > lets only one of two simultaneous bookings win 5ms
 ✓ tests/modules/scheduling/bookings.test.ts > /api/v1/bookings > refuses bad input with 400 and an unknown hall with 404 73ms

 Test Files  4 passed (4)
      Tests  13 passed (13)
```

Each of the new tests was checked the honest way: break the code it protects, watch it fail, restore the code. A test you have never seen fail may not be testing anything.

## Step 10: build and prepare the deployment

### Build

Terminal on your computer

```bash
$ zudojs build
Building project at: ~/code/bookings-api

> bookings-api@0.1.0 build
> tsc

Build completed successfully.
$ NODE_ENV=production PORT=4200 CORS_ORIGINS=https://bookings.example.ng npm start

> bookings-api@0.1.0 start
> node dist/server.js

2026-09-24T23:47:48.120Z [INFO] [bookings-api] scheduling module initialized
2026-09-24T23:47:48.125Z [INFO] [bookings-api] All modules initialized. modules=["integrations","scheduling"] durationMs=13
2026-09-24T23:47:48.130Z [INFO] [bookings-api] All modules started. modules=["integrations","scheduling"] durationMs=1
2026-09-24T23:47:48.133Z [INFO] [bookings-api] Runtime is ready. runtimeId=rt_00e7f4e8e0a84b12aec50759096c8d56 environment=production
Listening on http://0.0.0.0:4200
```

`zudojs build` is `npm run build`, which is `tsc`: 52 JavaScript files in `dist/`, tests excluded — `tsconfig.json` still excludes `**/*.test.ts`; only `typecheck` reads the test files too, and only to check them, never to emit them. `npm start` runs them with plain Node.js, no `tsx`. The log says `environment=production`, which was already true in the one reading of `NODE_ENV` that `config.nodeEnv` gives you.

### What the CLI does not do

Terminal on your computer

```bash
$ zudojs deploy
Command "deploy" was not found.
Run "zudojs --help" to see all commands.
$ echo $?
3
$ zudojs migrate
Command "migrate" was not found.
Run "zudojs --help" to see all commands.
```

There is no deploy and no migrate command. Migrations arrive with the database feature: `zudojs add database` adds Prisma and the scripts `db:generate`, `db:migrate` (`prisma migrate dev`, for your machine) and `db:deploy` (`prisma migrate deploy`, for production), and changes `build` to `prisma generate && tsc`. Deployment itself is what [Deploying a ZudoJS app](https://zudojs.oyinlola.site/learn/deployment) teaches. What the CLI *can* give you is the container recipe:

Terminal on your computer

```bash
$ zudojs add docker
Adding feature: docker — Dockerfile (multi-stage, non-root, Node 24), .dockerignore and compose.yaml
Created:
  - .dockerignore
  - Dockerfile
  - compose.yaml
…
Feature "docker" added successfully.
Next: cp .env.example .env, then: docker compose up --build
```

Dockerfile

```ts
# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
# The lockfile is optional (copied with a wildcard): with it the install is
# frozen and the image reproducible; with no lockfile yet (nothing has been
# installed) dependencies resolve from package.json. Commit the lockfile.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
```

Read it as the deployment lesson taught you: a **multi-stage** build (compile in one image, copy only `dist/` and production dependencies into a second), `npm ci` from the lockfile, a non-root `node` user, and a `HEALTHCHECK` that calls `/health`. Build it, run it, stop it:

Terminal on your computer

```bash
$ docker build -t bookings-api:0.1.0 .
…
#18 naming to docker.io/library/bookings-api:0.1.0 0.0s done
$ docker run -d --name bookings-api -p 4300:3000 -e CORS_ORIGINS=https://bookings.example.ng bookings-api:0.1.0
0b2bb701d8add1fdc91d7fa3cc091b6eda5d0eb8aeea7cd6b27a5d8f1efcf796
$ curl -s localhost:4300/health
{"status":"ok","checks":{},"timestamp":"2026-09-25T00:09:49.297Z"}
$ docker stop bookings-api
bookings-api
$ docker logs bookings-api | tail -3
2026-09-25T00:09:49.354Z [INFO] [bookings-api] All modules destroyed. durationMs=1
2026-09-25T00:09:49.354Z [INFO] [bookings-api] Graceful shutdown complete.
2026-09-25T00:09:49.355Z [INFO] [bookings-api] Runtime stopped. runtimeId=rt_76afc77548ec41e19d4561649b7263cc
$ docker images bookings-api --format '{{.Repository}}:{{.Tag}} {{.Size}}'
bookings-api:0.1.0 182MB
```

`docker stop` sends `SIGTERM`, and the log shows the same graceful shutdown you saw in development. `tsconfig.test.json` and `tests/` never reach the image, because the Dockerfile copies only `src` and `tsconfig.json`.

### Before the first real customer

- **Storage.** Every repository is still in memory: a restart empties it and two containers disagree. Run `zudojs add database`, write a Prisma repository that implements the same interface with `UNIQUE (hall_id, date)`, swap it in `src/container.ts`, and run `db:deploy` in your release step. Prisma now installs as a real dependency and rides in the runtime image with its own migrate-deploy line the CLI writes into the Dockerfile, and `generate resource` reruns `prisma generate` for you the moment it adds a model — the client used to fall out of sync with the schema until you remembered to regenerate it by hand (issue #141). Services, controllers and tests keep working.
- **The docs page** is already off by default in production (`docsPath: config.nodeEnv === "production" ? false : "/docs"`, issue #141): `/docs` answers 404 outside development, `/openapi.json` still 200. If you want it reachable in production behind a key instead of hidden entirely, Exercise 2 shows how.
- **Configuration.** Set `NODE_ENV=production` and `CORS_ORIGINS` to the website's origin; the generated default is no browser origin at all. `RATE_LIMIT_MAX` defaults to 1000 requests per window now (was 300), relaxed on purpose so a load test or a burst of legitimate traffic does not trip it; `RATE_LIMIT_MAX=0` turns the limiter off entirely for a controlled load test. Never bake `.env` into the image (the generated `.dockerignore` excludes it).
- **Rate limiting** counts per process, as the anatomy lesson noted; behind several containers use a shared store.
- **A pipeline** that runs, in order and stopping at the first failure: `npm ci`, `npm run typecheck`, `npm test`, `zudojs build`, `docker build`. The [CI/CD lesson](https://zudojs.oyinlola.site/learn/zudo-ci-cd) turns that list into GitHub Actions.

## Practice

TRY IT YOURSELF

### No cancellations in the last week

The company keeps the deposit when a customer cancels less than 7 days before the date. Write `checkCancellation(date, today)` that throws a 409 `ConflictError` when the booking is fewer than 7 days away, and say where in the project it belongs.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Parse both dates the same way: `Date.parse(\`${date}T00:00:00Z\`)`. Subtracting two parsed dates gives milliseconds; divide by `DAY_MS` to get days.

HINT 2

`if (daysAway < 7) throw new ConflictError(\`Bookings on ${date} can no longer be cancelled (${daysAway} days away).\`);` — a template literal builds the exact message, with `daysAway` as computed, not rounded.

SOLUTION

cancellation.tsNode.js only

```ts
import { ConflictError } from "@zudojs/errors";

const DAY_MS = 86_400_000;

export function checkCancellation(date: string, today: string): void {
  const daysAway = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
  if (daysAway < 7) {
    throw new ConflictError(`Bookings on ${date} can no longer be cancelled (${daysAway} days away).`);
  }
}

for (const date of ["2026-12-24", "2026-10-08", "2026-10-07"]) {
  try {
    checkCancellation(date, "2026-10-01");
    console.log(date, "can be cancelled");
  } catch (error) {
    console.log(date, (error as ConflictError).statusCode, (error as Error).message);
  }
}
```

Output of `npx tsx cancellation.ts`

```ts
2026-12-24 can be cancelled
2026-10-08 can be cancelled
2026-10-07 409 Bookings on 2026-10-07 can no longer be cancelled (6 days away).
```

It belongs in `BookingsService.remove`: load the booking, call `checkCancellation(existing.date, today())`, then delete. Pass the same replaceable `today` function the availability service uses, so the test can pin the day, and add a test for exactly 7 and exactly 6 days: boundaries are where off-by-one bugs live. Both dates are parsed as UTC midnight, so no time zone or daylight-saving change can make a day 23 hours long.

TRY IT YOURSELF

### Protect the docs page with a key

`/docs` is off by default in production now. Instead of leaving it off, require a header `x-docs-key` that matches a secret from the configuration, so support staff can still open it. `mountOpenAPI` has a `middleware` option. Compare the key in constant time.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

A middleware has the shape `async (context, next) => { ... }`. Read the header with `context.request.getHeader("x-docs-key")`, and call `next()` to let the request through.

HINT 2

`timingSafeEqualString(given, expected)` returns `false` for a wrong key; combine that with `expected === ""` in one `if`, and return `createResponseContext({ status: 401 }).json({ error: "A valid x-docs-key header is required." })` when either is true.

SOLUTION

docs-key.tsNode.js only

```ts
import { timingSafeEqualString } from "@zudojs/crypto";
import { createResponseContext, createRouter, mountOpenAPI, type HttpMiddleware } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

function requireDocsKey(expected: string): HttpMiddleware {
  return async (context, next) => {
    const given = context.request.getHeader("x-docs-key") ?? "";
    if (expected === "" || !timingSafeEqualString(given, expected)) {
      return createResponseContext({ status: 401 }).json({ error: "A valid x-docs-key header is required." });
    }
    return next();
  };
}

const docsKey = "set-me-from-the-environment"; // in the app: config.docsKey, read by loadConfig
const router = createRouter();
router.get("/api/v1/halls", async () => createResponseContext().json([]));
mountOpenAPI(router, { info: { title: "bookings-api", version: "0.1.0" }, middleware: [requireDocsKey(docsKey)] });

const client = createHttpTestClient(router);
console.log((await client.get("/docs")).status, (await client.get("/openapi.json")).status);
console.log((await client.get("/docs").set("x-docs-key", "guess")).status);
console.log((await client.get("/openapi.json").set("x-docs-key", docsKey)).status);
console.log((await client.get("/api/v1/halls")).status);
await client.close();
```

Output of `npx tsx docs-key.ts`

```ts
401 401
401
200
200
```

The middleware guards only the routes `mountOpenAPI` registers, so the API itself is untouched. An empty configured key refuses everyone rather than accepting an empty header. A plain `===` would stop at the first wrong character, and the time that takes can leak how much of a guess was right; `timingSafeEqualString` takes the same time either way. In the app, add a `docsKey` setting to `loadConfig` and keep it in the environment, never in the code.

TRY IT YOURSELF

### A command from the generator

The owners want an explicit "confirm booking" step later. Predict what `zudojs generate command confirm-booking --module scheduling` writes, and what it leaves for you. Then run the generated handler through a command bus.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`registerConfirmBookingCommand` takes a bus and returns it: `registerConfirmBookingCommand(createCommandBus())`.

HINT 2

`createConfirmBookingCommand({ data: { ... } })` builds the command; `bus.execute<ConfirmBookingCommand, ConfirmBookingCommandResult>(command)` runs it and returns the handler's result.

SOLUTION

Terminal on your computer

```bash
$ zudojs generate command confirm-booking --module scheduling
Detected architecture: modular-monolith
Generated 3 files:
  - src/modules/scheduling/commands/confirm-booking/confirm-booking.command.ts
  - src/modules/scheduling/commands/confirm-booking/confirm-booking.handler.ts
  - src/modules/scheduling/commands/confirm-booking/index.ts
```

Three files inside the module, and no edits anywhere else: no route, no container entry, and no command bus is created for you. `@zudojs/cqrs` is already in `package.json` (every `create` adds it), so nothing else changes. These are the two files it wrote:

src/modules/scheduling/commands/confirm-booking/confirm-booking.command.ts

```ts
import { createCommand, type CommandOf } from "@zudojs/cqrs";

/** Discriminator the command bus routes ConfirmBooking commands on. */
export const CONFIRM_BOOKING_COMMAND = "ConfirmBooking";

/** Data a ConfirmBooking command carries. Replace it with the fields the use case needs. */
export type ConfirmBookingCommandPayload = {
  readonly data: Readonly<Record<string, unknown>>;
};

/** The ConfirmBooking command: `{ type: "ConfirmBooking", data }`. */
export type ConfirmBookingCommand = CommandOf<typeof CONFIRM_BOOKING_COMMAND, ConfirmBookingCommandPayload>;

/** Creates an immutable ConfirmBooking command. */
export function createConfirmBookingCommand(payload: ConfirmBookingCommandPayload): ConfirmBookingCommand {
  return createCommand(CONFIRM_BOOKING_COMMAND, payload);
}
```

src/modules/scheduling/commands/confirm-booking/confirm-booking.handler.ts

```ts
import { randomUUID } from "node:crypto";

import { CommandHandler, type CommandBus } from "@zudojs/cqrs";

import { CONFIRM_BOOKING_COMMAND, type ConfirmBookingCommand } from "./confirm-booking.command.js";

/** What executing a ConfirmBooking command returns. */
export interface ConfirmBookingCommandResult {
  readonly id: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Handles ConfirmBooking commands: put the write-side logic in `execute`. */
export class ConfirmBookingCommandHandler extends CommandHandler<ConfirmBookingCommand, ConfirmBookingCommandResult> {
  public override readonly commandType = CONFIRM_BOOKING_COMMAND;

  public override async execute(command: ConfirmBookingCommand): Promise<ConfirmBookingCommandResult> {
    return { id: randomUUID(), data: command.data };
  }
}

/**
 * Registers {@link ConfirmBookingCommandHandler} on a command bus.
 *
 * @example
 * const bus = registerConfirmBookingCommand(createCommandBus());
 * const result = await bus.execute<ConfirmBookingCommand, ConfirmBookingCommandResult>(
 *   createConfirmBookingCommand({ data: {} }),
 * );
 */
export function registerConfirmBookingCommand(bus: CommandBus): CommandBus {
  return bus.register(CONFIRM_BOOKING_COMMAND, new ConfirmBookingCommandHandler());
}
```

command-check.tsNode.js only

```ts
import { createCommandBus } from "@zudojs/cqrs";

import { createConfirmBookingCommand, type ConfirmBookingCommand } from "./src/modules/scheduling/commands/confirm-booking/confirm-booking.command.js";
import {
  registerConfirmBookingCommand,
  type ConfirmBookingCommandResult,
} from "./src/modules/scheduling/commands/confirm-booking/confirm-booking.handler.js";

const bus = registerConfirmBookingCommand(createCommandBus());
const command = createConfirmBookingCommand({ data: { bookingId: "not-even-a-uuid", paid: "maybe" } });
const result = await bus.execute<ConfirmBookingCommand, ConfirmBookingCommandResult>(command);
console.log(command.type, Object.isFrozen(command));
console.log(typeof result.id, result.data);
```

Output of `npx tsx command-check.ts`

```ts
ConfirmBooking true
string { bookingId: 'not-even-a-uuid', paid: 'maybe' }
```

It runs, and it is another stub: the payload is "any record", so a nonsense booking id and `paid: "maybe"` go straight through, and the handler invents a fresh id instead of confirming anything. Before using it, replace `data` with real fields (`bookingId`, `paymentReference`), validate them with a schema, and give the handler the `BookingsRepository` through its constructor at the composition root. The type arguments of `bus.execute<…>` are only a promise you make to the compiler; [the CQRS lesson](https://zudojs.oyinlola.site/learn/zudo-cqrs) shows why a test is what really checks the result.

## Summary

- The CLI created the project, the module, the resources, the validator and the Dockerfile; it ran your dev server and your build. Commit before every `generate` and read the diff after it.
- Generated resources are skeletons. You wrote the rules: schemas with real fields, a validator that validates, a repository that refuses double bookings without a race, and a hand-written service shared at the composition root, outside the markers.
- A recent audit fixed what used to be five known problems: `generate service --module m` now writes inside that module; `generate validator` writes a real, working schema instead of a stub; missing markers now refuse instead of warning; unexpected errors are logged and answered by the generated server itself; and `config.nodeEnv` is read once and passed straight through. What is left to notice is smaller: a schematic whose generic shape does not fit composing two repositories, and list endpoints that now paginate by default.
- Tests are type-checked by default now (`typecheck` runs both configs), but the generated tests still cannot see wiring or races. A smoke test and a race test close those two gaps; nothing project-specific is needed for logging or configuration any more.
- There is no `deploy`, `migrate` or `test` command. `zudojs add docker` writes a multi-stage Dockerfile; migrations come with `zudojs add database` as npm scripts; the pipeline and the release are yours.

Next, [Capstone: ShopFlow](https://zudojs.oyinlola.site/learn/capstone-shopflow) builds a larger application from ZudoJS packages directly, with a transactional checkout on PostgreSQL.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
