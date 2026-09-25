---
title: "A whole project through the CLI — ZudoJS Academy"
description: "Build a hall-booking API from zudojs create to a Docker image, generating each layer with the CLI and fixing the five things the generator gets wrong."
source: https://zudojs.oyinlola.site/learn/zudo-cli-project
---

LEVEL 19 · LESSON 7 OF 10

Capstone Production

# A whole project through the CLI

Build a hall-booking API from zudojs create to a Docker image, generating each layer with the CLI and fixing the five things the generator gets wrong.

- **70 min** to read and try
- **You need:** The ZudoJS CLI in depth, Anatomy of a ZudoJS project and Deploying a ZudoJS app
- **You build:** bookings-api, a modular-monolith hall-booking API made with the CLI, with real booking rules, OpenAPI docs, tests that cover what generated tests miss, and a Docker image

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Take a project from zudojs create to a running Docker container using only commands the CLI really has
- Turn generated stubs and in-memory resources into real business rules without breaking the generator's wiring
- Spot and fix the five known problems of generated projects in your own code
- Write the tests generated tests cannot: wiring, races, error logging and configuration
- Say which delivery steps belong to the CLI, which to npm scripts and which to your deployment

## The problem: an API by Friday

An events company in Lagos rents out halls for weddings, conferences and birthday parties. Today a receptionist keeps the bookings in a notebook, and twice this year the same hall was promised to two families for the same Saturday. They want an API that their new website can call:

- Staff add halls, each with a **capacity** (how many guests fit) and a **daily rate** in naira.
- A customer can ask "is Eko Hall free on 24 December, and what does it cost?"
- A customer books a hall for one date. **A hall is never booked twice for the same date**, and never for more guests than it holds.
- The website team needs API documentation, and the operations team wants a container image it can run.

In [The ZudoJS CLI in depth](https://zudojs.oyinlola.site/learn/zudo-cli) you learned every command one at a time, and in [Anatomy of a ZudoJS project](https://zudojs.oyinlola.site/learn/zudo-project-anatomy) you traced the files `zudojs create` writes. This lesson puts both to work: one project, from an empty folder to a container, using the CLI for everything it can do and your own code for everything it cannot. On the way you will meet five problems that generated projects ship with, and for each one you will learn how to *notice* it in your own project, not only how to fix it.

Every shell output below is from a real run of `zudojs-cli` 2.1.3 on Node.js 24, in a folder that is written as `~/code`. Every code output comes from running the code on this page.

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
◇  Backend project generated (40 files)
Capabilities build on: http

added 67 packages, and audited 68 packages in 38s
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
✔ Zudojs dependencies: 16 Zudojs package(s) declared
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
Dry run: 7 files would be generated (nothing written):
  - src/modules/scheduling/scheduling.module.ts
  - src/modules/scheduling/index.ts
  - src/modules/index.ts
  - src/modules/scheduling/features/scheduling.feature.ts
  - src/modules/scheduling/features/index.ts
  - src/modules/scheduling/routes/index.ts
  - src/routes/index.ts
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

The dry run promised seven files and the real run wrote eight: it also added `new SchedulingModule()` to the runtime's list in `src/app.ts`. That is the difference the CLI lesson warned about, and the reason you read the diff rather than trusting the preview. The module's own `routes/index.ts` has an empty pair of `// zudojs:routes` markers, and the app's `src/routes/index.ts` now calls it.

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
  - tests/halls.test.ts
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
  - tests/bookings.test.ts
  - src/modules/scheduling/routes/index.ts
  - src/container.ts
$ npm run typecheck && npm test
…
 Test Files  3 passed (3)
      Tests  9 passed (9)
```

Each resource is a working CRUD endpoint (create, read, update, delete) with a `name` field, an in-memory repository and a test. That is a skeleton, not a booking system: a "booking" with only a name knows nothing about halls, dates or guests. The rest of the lesson turns the skeleton into the product. The three test files are the two new ones plus the example resource's; you will delete the example resource in [Step 6](#wiring).

## Step 3: the service that became a module

Booking needs one piece of logic that belongs to neither resource: "is this hall free on this date, and what does it cost?" That is a **service**, a class holding a use case, and the CLI has a `service` schematic. Try it:

Terminal on your computer

```bash
$ zudojs generate service availability --module scheduling
Detected architecture: modular-monolith
Mapping "service" → "module" for modular-monolith architecture.
Generated 8 files:
  - src/modules/availability/availability.module.ts
  - src/modules/availability/index.ts
  - src/modules/index.ts
  - src/modules/availability/features/availability.feature.ts
  - src/modules/availability/features/index.ts
  - src/modules/availability/routes/index.ts
  - src/app.ts
  - src/routes/index.ts
$ echo $?
0
```

This is **problem 1**. In a modular monolith the CLI treats `service` as another word for `module`, ignores `--module scheduling`, and creates a whole second module called `availability`, registered with the runtime and the router. The exit code is 0, so a script would never notice. How to spot it: the line `Mapping "service" → "module"`, and file paths under `src/modules/availability/` instead of `src/modules/scheduling/services/`. How to undo it, thanks to the commit:

Terminal on your computer

```bash
$ git restore . && git clean -fd src/modules/availability
Removing src/modules/availability/
$ git status --short
```

Nothing is left. The other schematics do respect `--module`; these dry runs all wrote inside `src/modules/scheduling/`:

| Command (with `--module scheduling`) | Writes |
| --- | --- |
| `generate repository payments` | `dtos/payments.dto.ts`, `repositories/payments.repository.ts` |
| `generate controller invoices` | dto, repository, `services/invoices.service.ts`, controller |
| `generate dto quotes` | `dtos/quotes.dto.ts` |
| `generate validator booking` | `validators/booking.validator.ts` |
| `generate command confirm-booking` | `commands/confirm-booking/`: command, handler, index |

So there are two honest ways to get a service inside a module: generate a `controller` (which cascades down to a service) and delete what you do not need, or write the file yourself in `src/modules/scheduling/services/`. The availability service needs two existing repositories rather than a new one, so you will write it by hand in [Step 5](#services).

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

### The validator stub

For "is this a real calendar date" the CLI has a schematic:

Terminal on your computer

```bash
$ zudojs generate validator booking-date --module scheduling
Detected architecture: modular-monolith
Generated 1 file:
  - src/modules/scheduling/validators/booking-date.validator.ts
$ cat src/modules/scheduling/validators/booking-date.validator.ts
/**
 * booking-date validator.
 */

export function validateBookingDate(input: unknown): boolean {
  return true;
}
```

This is **problem 2**: the stub compiles, has a convincing name, and accepts everything. How to spot stubs in your project: search for them before every release, for example `grep -rn "return true;" src/**/validators`, and keep a test that feeds each validator bad input. Here is the real one:

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

const stub = (_input: unknown): boolean => true;

for (const input of ["2026-12-24", "2026-02-30", "2028-02-29", "24/12/2026", "2026-12-24T10:00", 20261224]) {
  console.log(String(input).padEnd(17), "stub:", stub(input), " real:", validateBookingDate(input));
}
```

Output of `npx tsx validator-check.ts` and of the browser terminal

```ts
2026-12-24        stub: true  real: true
2026-02-30        stub: true  real: false
2028-02-29        stub: true  real: true
24/12/2026        stub: true  real: false
2026-12-24T10:00  stub: true  real: false
20261224          stub: true  real: false
```

The trick is the round trip: JavaScript quietly turns 30 February into 2 March, so a date is real only if printing it back gives the same text. 2028 is a leap year, so 29 February passes.

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

export type Hall = Infer<typeof HallSchema>;
export type CreateHallInput = Infer<typeof CreateHallSchema>;
export type UpdateHallInput = Infer<typeof UpdateHallSchema>;
```

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

export type Booking = Infer<typeof BookingSchema>;
export type CreateBookingInput = Infer<typeof CreateBookingSchema>;
export type UpdateBookingInput = Infer<typeof UpdateBookingSchema>;
/** What the repository stores: the input plus the price the service worked out. */
export type NewBooking = CreateBookingInput & { readonly amountKobo: number };
```

Notice what is *not* in `CreateBookingSchema`: no price, no status. The date has both a `regex` and the validator: the regex is visible in the API documentation as a `pattern` (you will see it in [Step 7](#docs)), while the `refine` is a check the documentation cannot describe. The halls repository needs two new lines in `create` and two in `update`, so it copies `capacity` and `dailyRateKobo`; here is the file after that edit:

src/modules/scheduling/repositories/halls.repository.ts

```ts
import { randomUUID } from "node:crypto";

import { ConflictError } from "@zudojs/errors";

import type { CreateHallInput, Hall, UpdateHallInput } from "../dtos/halls.dto.js";

/** Storage contract for hall records; the service depends on this only. */
export interface HallsRepository {
  findAll(): Promise<readonly Hall[]>;
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

  public async findAll(): Promise<readonly Hall[]> {
    return [...this.records.values()];
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

import type { Booking, NewBooking, UpdateBookingInput } from "../dtos/bookings.dto.js";

/** Storage contract for booking records; the service depends on this only. */
export interface BookingsRepository {
  findAll(): Promise<readonly Booking[]>;
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

  public async findAll(): Promise<readonly Booking[]> {
    return [...this.records.values()];
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

The generated `BookingsService` passed input straight to the repository. It now asks for a quote, checks the guest count, and stores the hall's price:

src/modules/scheduling/services/bookings.service.ts

```ts
import { NotFoundError, ValidationError } from "@zudojs/errors";

import type { CreateBookingInput, Booking, UpdateBookingInput } from "../dtos/bookings.dto.js";
import type { BookingsRepository } from "../repositories/bookings.repository.js";
import type { AvailabilityService } from "./availability.service.js";

/** Booking use cases. Throws NotFoundError (404), ValidationError (400), ConflictError (409). */
export class BookingsService {
  public constructor(
    private readonly repository: BookingsRepository,
    private readonly availability: AvailabilityService,
  ) {}

  public list(): Promise<readonly Booking[]> {
    return this.repository.findAll();
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

The availability route is yours too. It uses the small HTTP helpers every generated controller uses, from `src/utils/http.ts`. That file is unchanged from `zudojs create` (the [anatomy lesson](https://zudojs.oyinlola.site/learn/zudo-project-anatomy#request) explains each function); it is repeated here because the examples below run against it:

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
 * The response for an error that carries an exposed 4xx status
 * (NotFoundError, badRequest(), ...). Anything else is left to the server,
 * which answers a generic 500 and never leaks the message.
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
  if (typeof status !== "number" || status < 400 || status > 499) return undefined;
  if (candidate.expose !== true || typeof candidate.message !== "string") return undefined;
  return json(status, {
    error: candidate.message,
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
  });
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
  - tests/bookings.test.ts
  - src/container.ts
$ npm run typecheck
…
src/container.ts(39,88): error TS2554: Expected 1 arguments, but got 2.
src/container.ts(42,5): error TS1117: An object literal cannot have multiple properties with the same name.
src/modules/scheduling/services/availability.service.ts(36,41): error TS2339: Property 'findByHallAndDate' does not exist on type 'BookingsRepository'.
$ git restore .
```

The DTO, repository and service went back to the plain `name` template, and the generator added a second `bookingsController` between the markers, because its line was no longer there. Here the type checker caught it; a change the types cannot see would have been lost silently. The rule: once you have written real code in a resource, never `--force` it, and if you must, commit first and read the whole diff.

## Step 7: test, run and read the docs

### The generated tests break, and the type checker misses it

Terminal on your computer

```bash
$ npm run typecheck

> bookings-api@0.1.0 typecheck
> tsc --noEmit

$ npm test
…
 FAIL  tests/bookings.test.ts > /api/v1/bookings > creates, reads, updates and deletes a booking
AssertionError: Expected status 201, got 400.
  request:  POST /api/v1/bookings
  response: 400 Bad Request
  body:     {"error":"Validation failed","issues":[{"path":"hallId","message":"Required field missing: hallId"},{"path":"date","message":"Required field missing: date"},{"path":"customerEmail","message":"Required field missing: customerEmail"},{"path":"guests","message":"Required field missing: guests"}]}
…
 Test Files  2 failed (2)
      Tests  2 failed | 4 passed (6)
```

The failures are expected: the tests still send `{ name: "Ada" }`. The surprise is the line above them. `tests/bookings.test.ts` calls `new BookingsService(new InMemoryBookingsRepository())` with one argument where the class now needs two, and `npm run typecheck` said nothing. The generated `tsconfig.json` has `"include": ["src/**/*"]` and excludes `**/*.test.ts`, so **tests are never type-checked**. Vitest strips types without checking them. Add a second config for tests:

tsconfig.test.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Terminal on your computer

```bash
$ npm pkg set 'scripts.typecheck:tests=tsc -p tsconfig.test.json'
$ npm run typecheck:tests
…
tests/bookings.test.ts(13,26): error TS2554: Expected 2 arguments, but got 1.
```

Then rewrite the two tests for the real fields. The full test suite is in [Step 9](#tests).

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

The second availability answer is `available: false`: the two services really share one repository. Two things happen in the first terminal as you work. Every time you save a file, `tsx watch` restarts the server with `SIGTERM`, so the log shows `Received SIGTERM: shutting down.` and a full graceful shutdown. And after the restart, `curl localhost:4100/api/v1/halls` answers `[]`: the in-memory repositories forgot everything. That is fine for development and fatal in production.

### The API documentation

Because you asked for `--capabilities openapi`, `src/server.ts` contains `mountOpenAPI(router, …)`, which serves `/openapi.json` and a documentation page at `/docs`, built from the routes and their schemas as in [the OpenAPI lesson](https://zudojs.oyinlola.site/learn/zudo-openapi). The generated routes, your hand-written route and the enquiries resource you will add later all appear:

Second terminal

```bash
$ curl -s localhost:4100/openapi.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);console.log(d.openapi, d.info.title, d.info.version);for(const [p,ops] of Object.entries(d.paths))console.log(p.padEnd(34), Object.keys(ops).map(m=>m.toUpperCase()).join(" "))})'
3.1.0 bookings-api 0.1.0
/api/v1/halls/{id}/availability    GET
/api/v1/halls                      GET POST
/api/v1/halls/{id}                 GET PATCH DELETE
/api/v1/bookings                   GET POST
/api/v1/bookings/{id}              GET PATCH DELETE
/api/v1/enquiries                  GET POST
/api/v1/enquiries/{id}             GET PATCH DELETE
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

## Step 8: three more problems the generator ships

You have met problem 1 (`service` became a module) and problem 2 (the validator stub). Three more hide in every generated project. None of them fails a build or a generated test, so you find them only if you know to look.

### Problem 3: missing markers only warn

While writing the availability route, suppose you had "tidied" the module's `routes/index.ts` and deleted the marker comments. A week later the company wants customers to send enquiries:

Terminal on your computer

```bash
$ zudojs generate resource enquiries --module scheduling
Detected architecture: modular-monolith
Generated 7 files:
  - src/modules/scheduling/dtos/enquiries.dto.ts
  - src/modules/scheduling/repositories/enquiries.repository.ts
  - src/modules/scheduling/services/enquiries.service.ts
  - src/modules/scheduling/controllers/enquiries.controller.ts
  - src/modules/scheduling/routes/enquiries.routes.ts
  - tests/enquiries.test.ts
  - src/container.ts
Warning: Finish by hand:
  - src/modules/scheduling/routes/index.ts: add "import { registerEnquiriesRoutes } from "./enquiries.routes.js";" between "// zudojs:route-imports:start" and "// zudojs:route-imports:end" (the markers are missing, so the file was left unchanged)
  - src/modules/scheduling/routes/index.ts: add "registerEnquiriesRoutes(router, deps.enquiriesController);" between "// zudojs:routes:start" and "// zudojs:routes:end" (the markers are missing, so the file was left unchanged)
$ echo $?
0
```

Exit code 0, `npm run typecheck` passes, and `tests/enquiries.test.ts` passes because it builds its own router. The running server answers 404 on `/api/v1/enquiries`. How to spot it: the word `Warning` at the end of the run, and a **smoke test** that builds the router the way `server.ts` does, from [the anatomy lesson](https://zudojs.oyinlola.site/learn/zudo-project-anatomy#tests). With `/api/v1/enquiries` added to it:

Terminal on your computer

```bash
$ npm test
…
 FAIL  tests/smoke.test.ts > wiring > serves every route the app should have
AssertionError: Expected status 200, got 404.
  request:  GET /api/v1/enquiries
  response: 404 Not Found
  body:     {"error":"Not Found","method":"GET","path":"/api/v1/enquiries"}
```

The fix: put the four marker lines back, and add the two lines the warning printed between them. A later `generate resource enquiries --force` then finds them already present and changes nothing in that file.

### Problem 4: unexpected errors vanish

The generated `dispatch` in `src/server.ts` turns exposed 4xx errors into responses and rethrows everything else, so the client gets a bare 500. Nothing logs the error. In production that is a failure nobody can see: the database is down, every booking fails, and the logs are clean. How to spot it in your project: open `src/server.ts` and look for any logging inside `dispatch`'s `catch`; there is none. The fix is to move `dispatch` into its own file, where it can be tested, and give it a logger.

`errorResponse` in the generated `src/utils/http.ts` (shown in Step 6) decides which errors become responses. The new file:

src/utils/dispatch.ts

```ts
import type { HttpMiddleware, HttpRouter } from "@zudojs/http";
import type { Logger } from "@zudojs/logger";

import { errorResponse } from "./http.js";

/**
 * The last middleware: runs the router and turns exposed 4xx errors into
 * responses. Anything else is logged, then rethrown so the server answers a
 * generic 500 that reveals nothing to the client.
 */
export function createDispatch(router: HttpRouter, logger: Logger): HttpMiddleware {
  return async (context) => {
    try {
      return (await router.dispatch(context.request, { signal: context.signal })).response;
    } catch (error) {
      const response = errorResponse(error);
      if (response !== undefined) return response;
      logger.error("Unhandled error while serving a request", {
        method: context.request.method,
        path: context.request.path,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
```

In `src/server.ts`, the eight-line `dispatch` becomes `const dispatch = createDispatch(router, createLogger({ name: "bookings-api" }));`. Here it is with a repository whose database connection fails, and a hall that does not exist:

dispatch-check.tsNode.js only

```ts
import { NotFoundError } from "@zudojs/errors";
import { HttpMiddlewarePipeline, createRouter } from "@zudojs/http";
import { createLogger } from "@zudojs/logger";
import { createHttpTestClient } from "@zudojs/testing";

import { createDispatch } from "./src/utils/dispatch.js";

const router = createRouter();
router.get("/api/v1/bookings", async () => {
  throw new Error("connection refused: 10.0.0.5:5432");
});
router.get("/api/v1/halls/:id", async () => {
  throw new NotFoundError("No such hall.");
});

const dispatch = createDispatch(router, createLogger({ name: "bookings-api" }));
const client = createHttpTestClient(new HttpMiddlewarePipeline({ middlewares: [dispatch] }));
for (const path of ["/api/v1/halls/abc", "/api/v1/bookings"]) {
  const response = await client.get(path);
  console.log(response.status, response.text);
}
await client.close();
```

Output of `npx tsx dispatch-check.ts`

```ts
404 {"error":"No such hall.","code":"ERR_RESOURCE_NOT_FOUND"}
2026-09-25T00:02:54.438Z [ERROR] [bookings-api] Unhandled error while serving a request method=GET path=/api/v1/bookings error="connection refused: 10.0.0.5:5432"
500 {"error":"Internal Server Error"}
```

The client learns nothing about the internal address; the operator gets the method, the path and the real message. The expected 404 stays quiet, because logging every normal "not found" buries the real problems.

### Problem 5: two readings of NODE_ENV

`loadConfig` stores `NODE_ENV` in `config.nodeEnv`, but the generated `src/app.ts` ignores it and calls `resolveEnvironment()`, which reads `process.env` directly. In the running server both usually see the same variable. In a test, or anywhere you pass `loadConfig` an explicit environment, they disagree. How to spot it: search `src/app.ts` for `resolveEnvironment()` with empty parentheses. `resolveEnvironment` from `@zudojs/constants` accepts the environment to read:

environment-check.tsNode.js only

```ts
import { resolveEnvironment } from "@zudojs/constants";

// What loadConfig({ NODE_ENV: "production" }) stores:
const config = { nodeEnv: "production" };

console.log("generated app.ts:", resolveEnvironment());
console.log("fixed app.ts:    ", resolveEnvironment({ NODE_ENV: config.nodeEnv }));
console.log("short form:      ", resolveEnvironment({ NODE_ENV: "prod" }));
try {
  resolveEnvironment({ NODE_ENV: "prodution" }, { strict: true });
} catch (error) {
  console.log("typo, strict:    ", (error as Error).name);
}
```

Output of `npx tsx environment-check.ts`

```ts
generated app.ts: development
fixed app.ts:     production
short form:       production
typo, strict:     InvalidConstantError
```

The fix is one line in `src/app.ts`: `environment: resolveEnvironment({ NODE_ENV: options.config.nodeEnv })`. A test pins it down, and without the fix it fails in a revealing way, because Vitest sets `NODE_ENV=test` itself:

Terminal on your computer

```bash
$ npx vitest run tests/config.test.ts
…
 FAIL  tests/config.test.ts > configuration > gives the runtime the NODE_ENV that loadConfig read
AssertionError: expected 'test' to be 'production' // Object.is equality
```

| # | Problem | How to spot it | Fix |
| --- | --- | --- | --- |
| 1 | `generate service --module m` creates a new module | `Mapping "service" → "module"`; paths outside `src/modules/m/` | Undo; write the service in `src/modules/m/services/` or generate a controller |
| 2 | The validator stub returns `true` | `return true;` in `validators/`; a test with bad input | Write the real check; use it in the DTO |
| 3 | Missing markers only warn, exit 0 | `Warning: Finish by hand`; a smoke test through `registerRoutes` | Restore the markers, add the printed lines |
| 4 | `dispatch` hides 500s | No logging in `dispatch`'s `catch` | `createDispatch(router, logger)` with a test |
| 5 | `createApp` ignores `config.nodeEnv` | `resolveEnvironment()` with no argument | Pass `{ NODE_ENV: options.config.nodeEnv }` |

## Step 9: the tests that matter

There is no `zudojs generate test`. The generated test for each resource is a good CRUD check on its own router; everything that makes this product correct is yours to test. Here is the bookings test, rewritten for the real rules, with a fixed "today" so it passes on every day of the year:

tests/bookings.test.ts

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { BookingsController } from "../src/modules/scheduling/controllers/bookings.controller.js";
import { InMemoryBookingsRepository } from "../src/modules/scheduling/repositories/bookings.repository.js";
import { InMemoryHallsRepository } from "../src/modules/scheduling/repositories/halls.repository.js";
import { registerBookingsRoutes } from "../src/modules/scheduling/routes/bookings.routes.js";
import { AvailabilityService } from "../src/modules/scheduling/services/availability.service.js";
import { BookingsService } from "../src/modules/scheduling/services/bookings.service.js";

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
$ npx vitest run tests/bookings.test.ts
…
 FAIL  tests/bookings.test.ts > /api/v1/bookings > lets only one of two simultaneous bookings win
AssertionError: expected [ 'fulfilled', 'fulfilled' ] to deeply equal [ 'fulfilled', 'rejected' ]
```

The smoke test and the dispatch test are short:

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

tests/dispatch.test.ts

```ts
import { afterAll, describe, expect, it } from "vitest";
import { HttpMiddlewarePipeline, createRouter } from "@zudojs/http";
import { createHttpTestClient, createSpyLogger } from "@zudojs/testing";
import { NotFoundError } from "@zudojs/errors";

import { createDispatch } from "../src/utils/dispatch.js";

const logger = createSpyLogger("bookings-api");
const router = createRouter();
router.get("/broken", async () => {
  throw new Error("connection refused: 10.0.0.5:5432");
});
router.get("/missing", async () => {
  throw new NotFoundError("No such booking.");
});
const client = createHttpTestClient(new HttpMiddlewarePipeline({ middlewares: [createDispatch(router, logger)] }));
afterAll(() => client.close());

describe("dispatch", () => {
  it("answers 500 without details, and logs the real error", async () => {
    const response = await client.get("/broken").expect(500);
    expect(response.text).not.toContain("10.0.0.5");
    expect(logger.findByMethod("error")).toHaveLength(1);
    expect(logger.calls[0]?.metadata).toMatchObject({ path: "/broken", error: "connection refused: 10.0.0.5:5432" });
  });

  it("does not log expected 4xx answers", async () => {
    logger.clear();
    await client.get("/missing").expect(404);
    expect(logger.calls).toHaveLength(0);
  });
});
```

`createSpyLogger` from `@zudojs/testing` is a `Logger` that records its calls instead of printing them, so the test can assert on what was logged. With `tests/config.test.ts` from Step 8 and the two updated generated tests, the whole suite:

Terminal on your computer

```bash
$ npm run typecheck && npm run typecheck:tests && npx vitest run --reporter=verbose
…
 ✓ tests/config.test.ts > configuration > gives the runtime the NODE_ENV that loadConfig read 181ms
 ✓ tests/dispatch.test.ts > dispatch > answers 500 without details, and logs the real error 572ms
 ✓ tests/dispatch.test.ts > dispatch > does not log expected 4xx answers 27ms
 ✓ tests/halls.test.ts > /api/v1/halls > creates, reads, updates and deletes a hall 399ms
 ✓ tests/halls.test.ts > /api/v1/halls > rejects an invalid body with 400 14ms
 ✓ tests/halls.test.ts > /api/v1/halls > rejects an id that is not a UUID with 400 5ms
 ✓ tests/enquiries.test.ts > /api/v1/enquiries > creates, reads, updates and deletes an enquiry 239ms
 ✓ tests/enquiries.test.ts > /api/v1/enquiries > rejects an invalid body with 400 16ms
 ✓ tests/enquiries.test.ts > /api/v1/enquiries > rejects an id that is not a UUID with 400 11ms
 ✓ tests/smoke.test.ts > wiring > serves every route the app should have 573ms
 ✓ tests/bookings.test.ts > /api/v1/bookings > books a free hall at the hall's price 140ms
 ✓ tests/bookings.test.ts > /api/v1/bookings > refuses a second booking of the same hall and date 30ms
 ✓ tests/bookings.test.ts > /api/v1/bookings > lets only one of two simultaneous bookings win 5ms
 ✓ tests/bookings.test.ts > /api/v1/bookings > refuses bad input with 400 and an unknown hall with 404 73ms

 Test Files  6 passed (6)
      Tests  14 passed (14)
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

`zudojs build` is `npm run build`, which is `tsc`: 53 JavaScript files in `dist/`, tests excluded. `npm start` runs them with plain Node.js, no `tsx`. The log says `environment=production`, which is now true in both readings of `NODE_ENV`.

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

- **Storage.** Every repository is still in memory: a restart empties it and two containers disagree. Run `zudojs add database`, write a Prisma or SQL repository that implements the same interface with `UNIQUE (hall_id, date)`, swap it in `src/container.ts`, and run `db:deploy` in your release step. Services, controllers and tests keep working.
- **The docs page.** `/docs` answered 200 in production. If the API is not public, change the mount in `src/server.ts` to `mountOpenAPI(router, { info: { … }, docsPath: config.nodeEnv === "production" ? false : "/docs" })`: in the rebuilt app `/docs` answered 404 and `/openapi.json` still 200. Exercise 2 protects it with a key instead.
- **Configuration.** Set `NODE_ENV=production` and `CORS_ORIGINS` to the website's origin; the generated default is no browser origin at all. Never bake `.env` into the image (the generated `.dockerignore` excludes it).
- **Rate limiting** counts per process, as the anatomy lesson noted; behind several containers use a shared store.
- **A pipeline** that runs, in order and stopping at the first failure: `npm ci`, `npm run typecheck`, `npm run typecheck:tests`, `npm test`, `zudojs build`, `docker build`. The [CI/CD lesson](https://zudojs.oyinlola.site/learn/zudo-ci-cd) turns that list into GitHub Actions.

## Practice

TRY IT YOURSELF

### No cancellations in the last week

The company keeps the deposit when a customer cancels less than 7 days before the date. Write `checkCancellation(date, today)` that throws a 409 `ConflictError` when the booking is fewer than 7 days away, and say where in the project it belongs.

**Show a solution**

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

Instead of hiding `/docs` in production, require a header `x-docs-key` that matches a secret from the configuration. `mountOpenAPI` has a `middleware` option. Compare the key in constant time.

**Show a solution**

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

**Show a solution**

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
- Five known problems, each with a way to spot it: `service` becomes a module in a modular monolith; the validator stub returns `true`; missing markers only warn; `dispatch` hides 500s; `createApp` ignores `config.nodeEnv`.
- Tests are not type-checked by the generated config, and the generated tests cannot see wiring, races, logging or configuration. `tsconfig.test.json`, a smoke test, a race test, a dispatch test and a config test close those gaps.
- There is no `deploy`, `migrate` or `test` command. `zudojs add docker` writes a multi-stage Dockerfile; migrations come with `zudojs add database` as npm scripts; the pipeline and the release are yours.

Next, [Capstone: ShopFlow](https://zudojs.oyinlola.site/learn/capstone-shopflow) builds a larger application from ZudoJS packages directly, with a transactional checkout on PostgreSQL.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
