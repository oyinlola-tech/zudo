---
title: "Backend architecture — ZudoJS Academy"
description: "Apply separation of concerns and SOLID to a whole backend: domain, application and infrastructure layers, ports, dependency injection and a composition root."
source: https://zudojs.oyinlola.site/learn/backend-architecture
---

LEVEL 11 · LESSON 6 OF 12

Architecture Core

# Backend architecture

Apply separation of concerns and SOLID to a whole backend: domain, application and infrastructure layers, ports, dependency injection and a composition root.

- **45 min** to read and try
- **You need:** Design principles through refactoring, SOLID, DRY, KISS and YAGNI, and Behavioural patterns
- **You build:** The BookStore's order feature split into layers, with middleware, a composition root and a swappable database

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Sort backend code into domain, application and infrastructure layers, and explain why dependencies must point inward
- Define a port as an interface the application layer owns, and implement it from infrastructure so the concrete database can be swapped
- Inject every dependency through a constructor and wire the whole graph in one composition root
- Recognise middleware as the chain-of-responsibility pattern applied to HTTP requests
- Load configuration once, validate it and freeze it before handing it to services
- Test business rules against fake repositories instead of a real database

## One job per piece of code

[Design principles through refactoring](https://zudojs.oyinlola.site/learn/design-principles#separation) pulled one tangled function apart by separation of concerns, cohesion and coupling; [SOLID, DRY, KISS and YAGNI](https://zudojs.oyinlola.site/learn/design-solid#srp) gave the single-responsibility and dependency-inversion vocabulary for it. This lesson applies the same two ideas to a whole backend instead of one function. The BookStore's order route is the tangled function at application scale: it reads a header, checks a token, parses a body, runs SQL, applies the stock rule and formats the answer, all in one handler. To change any one of those, you must read all of them.

Backend developers everywhere use the same names for the pieces a route handler's jobs split into:

| Piece | Its one job | In the BookStore |
| --- | --- | --- |
| **Controller** | Turn a request into a call to a service, and the result into a response. No business rules. | the route handlers |
| **Service** | Carry out one use case, such as "place an order", step by step. Knows the rules, not HTTP and not SQL. | mixed into the handlers and the SQL |
| **Repository** | Load and save one kind of record. | `BookRepository`, `OrderRepository` |
| **Model** | The shapes and rules of your business: a book, an order, "you cannot buy more than the stock". | `Book`, `Order`, and a rule hidden in a SQL `WHERE` |
| **DTO** | A *data transfer object*: the exact shape that crosses the boundary, in a request body or a response. | `NewOrder` from `parseNewOrder` |
| **Middleware** | Code that runs around every handler: logging, error handling, authentication. | missing, so each handler repeats it |

## Three layers and one rule

Those pieces fall into three **layers**:

- **Domain**: the models and business rules. It would be true even without computers: an order cannot take more copies than there are.
- **Application**: the services, the use cases of *this* app. It also defines the **interfaces** it needs from the outside world, such as "something that can find a book". These interfaces are often called **ports**.
- **Infrastructure**: everything that talks to the outside world. HTTP controllers and middleware, PostgreSQL repositories, e-mail senders. They **implement** the ports.

And the one rule: **dependencies point inward**. Outer code may import inner code; inner code never imports outer code.

```ts
  infrastructure   controller, middleware, repositories, main
        │  imports
        ▼
  application      services, ports (interfaces)
        │  imports
        ▼
  domain           models and rules  ── imports nothing
```

Why this direction? The domain is the part that is most valuable and changes least. The database driver, the HTTP library and the framework change far more often. If the domain imported the database, every database change would ripple into your business rules. With the arrows pointing inward, you can swap PostgreSQL for something else and not one rule changes. You will do exactly that at the end of this lesson.

## The domain: models and rules

Here is the BookStore's order feature, rebuilt layer by layer. All the files sit in one folder so you can run them in the browser. In a real project each layer gets its own folder, like `src/domain/`, `src/application/` and `src/infrastructure/`.

The domain has the models and the stock rule. It imports nothing:

model.ts

```ts
export interface Book {
  readonly id: number;
  readonly title: string;
  readonly priceCents: number;
  readonly stock: number;
}

export interface Order {
  readonly id: number;
  readonly userId: number;
  readonly bookId: number;
  readonly quantity: number;
  readonly totalCents: number;
}

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function takeFromStock(book: Book, quantity: number): Book {
  if (quantity > book.stock) {
    throw new DomainError("out_of_stock", `Only ${book.stock} left of "${book.title}"`);
  }
  return { ...book, stock: book.stock - quantity };
}
```

`takeFromStock` does not change the book. It returns a new one with less stock, or throws. It needs no database and no server to test: it is a plain function.

## The application: ports and a service

The service needs to find and save books and orders. It does not care how. So the application layer states what it needs as interfaces, the ports:

ports.ts

```ts
import type { Book, Order } from "./model.js";

export interface BookRepository {
  find(id: number): Promise<Book | undefined>;
  save(book: Book): Promise<void>;
}

export interface OrderRepository {
  add(order: Omit<Order, "id">): Promise<Order>;
  listFor(userId: number): Promise<Order[]>;
}
```

The service is the "place an order" use case, written as steps. It gets its repositories and a setting through its constructor; it never creates them itself. That is **dependency injection**, which you did by hand in [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes):

order.service.ts

```ts
import { DomainError, takeFromStock } from "./model.js";
import type { Order } from "./model.js";
import type { BookRepository, OrderRepository } from "./ports.js";

export class OrderService {
  constructor(
    private readonly books: BookRepository,
    private readonly orders: OrderRepository,
    private readonly maxQuantity: number,
  ) {}

  async place(userId: number, bookId: number, quantity: number): Promise<Order> {
    if (quantity > this.maxQuantity) {
      throw new DomainError("too_many", `You can order at most ${this.maxQuantity} copies`);
    }
    const book = await this.books.find(bookId);
    if (book === undefined) throw new DomainError("no_such_book", `Book ${bookId} does not exist`);
    await this.books.save(takeFromStock(book, quantity));
    return this.orders.add({ userId, bookId, quantity, totalCents: book.priceCents * quantity });
  }

  history(userId: number): Promise<Order[]> {
    return this.orders.listFor(userId);
  }
}
```

Read `place` out loud and it is the business process: check the amount, find the book, take the copies, record the order. There is no SQL, no status code and no header in it.

REASON IT OUT

### Does the layering fix the race condition too?

`place` calls `this.books.find(bookId)`, then later `this.books.save(...)`. Two customers can both call `place` for the last copy, both read "1 left" before either saves, and both succeed. Does moving this code into a service, behind a port, remove that gap? Would a stricter type on `BookRepository` catch it?

**Show the reasoning**

No. Layering only moves code around; it does not add concurrency control. `find` then `save` is still two separate steps with a database round trip between them, whichever object calls them. No TypeScript type can express "no one else may read this row until I save it", because that is a runtime property of the database, not a shape of data.

The fix has to live inside whichever repository implementation talks to the real database: a single SQL statement such as `UPDATE books SET stock = stock - $1 WHERE id = $2 AND stock >= $1` closes the gap in one round trip, as in [the data lesson](https://zudojs.oyinlola.site/learn/bookstore-data), or the two steps run inside one **transaction**. The `BookRepository` port stays exactly as written; only the PostgreSQL repository behind it needs to be correct.

## Infrastructure: repositories, DTOs, a controller

An in-memory implementation of the ports is enough to run everything. `implements BookRepository` makes TypeScript check that the class really fits the port:

memory.repositories.ts

```ts
import type { Book, Order } from "./model.js";
import type { BookRepository, OrderRepository } from "./ports.js";

export class MemoryBookRepository implements BookRepository {
  private readonly books = new Map<number, Book>();

  constructor(books: readonly Book[]) {
    for (const book of books) this.books.set(book.id, book);
  }

  async find(id: number): Promise<Book | undefined> {
    return this.books.get(id);
  }

  async save(book: Book): Promise<void> {
    this.books.set(book.id, book);
  }
}

export class MemoryOrderRepository implements OrderRepository {
  private readonly orders: Order[] = [];

  async add(order: Omit<Order, "id">): Promise<Order> {
    const saved = { ...order, id: this.orders.length + 1 };
    this.orders.push(saved);
    return saved;
  }

  async listFor(userId: number): Promise<Order[]> {
    return this.orders.filter((order) => order.userId === userId);
  }
}
```

The **DTOs** describe what crosses the network, exactly as in [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers#entities-dtos): the incoming DTO has only the fields a client may send, no `userId` and no price, and the outgoing DTO shows the total as `"25.98"` and leaves `userId` out. Your model can change without breaking clients, and internal fields never leak by accident:

order.dto.ts

```ts
import type { Order } from "./model.js";

export interface PlaceOrderDto {
  readonly bookId: number;
  readonly quantity: number;
}

export interface OrderDto {
  readonly id: number;
  readonly bookId: number;
  readonly quantity: number;
  readonly total: string;
}

function isWhole(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parsePlaceOrder(body: unknown): PlaceOrderDto | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  if (!("bookId" in body) || !("quantity" in body)) return undefined;
  if (!isWhole(body.bookId) || !isWhole(body.quantity)) return undefined;
  return { bookId: body.bookId, quantity: body.quantity };
}

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    bookId: order.bookId,
    quantity: order.quantity,
    total: (order.totalCents / 100).toFixed(2),
  };
}
```

The **controller** is thin. It checks that there is a user, parses the DTO, calls the service and formats the answer. The `userId` in its request comes from a verified token, as in [BookStore API: authentication and tests](https://zudojs.oyinlola.site/learn/bookstore-auth), never from the body:

order.controller.ts

```ts
import { parsePlaceOrder, toOrderDto } from "./order.dto.js";
import type { OrderService } from "./order.service.js";

export interface Request {
  readonly userId: number | undefined;
  readonly body?: unknown;
}

export interface Response {
  readonly status: number;
  readonly body: unknown;
}

export class OrderController {
  constructor(private readonly service: OrderService) {}

  async place(request: Request): Promise<Response> {
    if (request.userId === undefined) return { status: 401, body: { error: "log in first" } };
    const dto = parsePlaceOrder(request.body);
    if (dto === undefined) return { status: 400, body: { error: "send a bookId and a quantity" } };
    const order = await this.service.place(request.userId, dto.bookId, dto.quantity);
    return { status: 201, body: toOrderDto(order) };
  }

  async history(request: Request): Promise<Response> {
    if (request.userId === undefined) return { status: 401, body: { error: "log in first" } };
    const orders = await this.service.history(request.userId);
    return { status: 200, body: orders.map(toOrderDto) };
  }
}
```

## Middleware

The controller does not catch errors, and does not log. Those jobs are the same for every handler, so they belong in **middleware**, the chain-of-responsibility pattern from [Behavioural patterns](https://zudojs.oyinlola.site/learn/design-patterns-behavioral#chain) applied to HTTP: a function that takes the next handler and returns a new handler that does something before and after it.

middleware.ts

```ts
import { DomainError } from "./model.js";
import type { Request, Response } from "./order.controller.js";

export type Handler = (request: Request) => Promise<Response>;
export type Middleware = (next: Handler) => Handler;

const STATUS: Readonly<Record<string, number>> = { no_such_book: 404, too_many: 400, out_of_stock: 409 };

export const handleErrors: Middleware = (next) => async (request) => {
  try {
    return await next(request);
  } catch (error) {
    if (!(error instanceof DomainError)) return { status: 500, body: { error: "internal_error" } };
    return { status: STATUS[error.code] ?? 400, body: { error: error.code, message: error.message } };
  }
};

export function logRequests(log: (line: string) => void): Middleware {
  return (next) => async (request) => {
    const response = await next(request);
    log(`user ${request.userId ?? "-"} -> ${response.status}`);
    return response;
  };
}

export function use(handler: Handler, ...middlewares: Middleware[]): Handler {
  return middlewares.reduceRight((next, middleware) => middleware(next), handler);
}
```

`handleErrors` is the one place where the domain's words ("out of stock") meet HTTP's numbers (409); `logRequests` gets its `log` function injected, so a test can collect the lines instead of printing them; `use(handler, a, b)` is the same `chain` pipeline as before, built with `reduceRight` instead of the explicit recursion, so that `a` runs outermost, then `b`, then the handler.

## Configuration and the composition root

Settings are read once into a typed, frozen object, as in [the HTTP lesson](https://zudojs.oyinlola.site/learn/bookstore-http). `Object.freeze` makes sure no code changes a setting while the app runs:

config.ts

```ts
export interface AppConfig {
  readonly maxQuantity: number;
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const maxQuantity = Number(env["MAX_QUANTITY"] ?? "10");
  if (!Number.isInteger(maxQuantity) || maxQuantity < 1) {
    throw new Error("MAX_QUANTITY must be a whole number of 1 or more");
  }
  return Object.freeze({ maxQuantity });
}
```

Every class receives what it needs. Somebody still has to create them all, in the right order, and connect them. That place is called the **composition root**, and it is the only file that knows every concrete class. Here it also plays the part of the HTTP server and sends six requests. (A real server would pass `process.env` to `loadConfig`; the browser has no `process`, so this one passes a plain object.)

main.ts

```ts
import { loadConfig } from "./config.js";
import { MemoryBookRepository, MemoryOrderRepository } from "./memory.repositories.js";
import { handleErrors, logRequests, use } from "./middleware.js";
import { OrderController } from "./order.controller.js";
import { OrderService } from "./order.service.js";

const config = loadConfig({ MAX_QUANTITY: "5" });
const books = new MemoryBookRepository([{ id: 1, title: "Things Fall Apart", priceCents: 1299, stock: 3 }]);
const service = new OrderService(books, new MemoryOrderRepository(), config.maxQuantity);
const controller = new OrderController(service);

const log = logRequests((line) => console.log("log:", line));
const place = use((request) => controller.place(request), log, handleErrors);
const history = use((request) => controller.history(request), log, handleErrors);

const show = (response: { status: number; body: unknown }) => console.log(response.status, JSON.stringify(response.body));
show(await place({ userId: 1, body: { bookId: 1, quantity: 2 } }));
show(await place({ userId: 2, body: { bookId: 1, quantity: 2 } }));
show(await place({ userId: 2, body: { bookId: 1, quantity: 9 } }));
show(await place({ userId: 2, body: { bookId: 7, quantity: 1 } }));
show(await place({ userId: undefined, body: { bookId: 1, quantity: 1 } }));
show(await history({ userId: 1 }));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
log: user 1 -> 201
201 {"id":1,"bookId":1,"quantity":2,"total":"25.98"}
log: user 2 -> 409
409 {"error":"out_of_stock","message":"Only 1 left of \"Things Fall Apart\""}
log: user 2 -> 400
400 {"error":"too_many","message":"You can order at most 5 copies"}
log: user 2 -> 404
404 {"error":"no_such_book","message":"Book 7 does not exist"}
log: user - -> 401
401 {"error":"log in first"}
log: user 1 -> 200
200 [{"id":1,"bookId":1,"quantity":2,"total":"25.98"}]
```

Follow one request through the layers. The first one went: logging middleware → error middleware → controller (parse the DTO) → service (check the amount, find, take stock) → domain rule → repositories → back out as an `OrderDto` → 201, logged on the way out. The errors took the same road and were turned into 409, 400 and 404 by `handleErrors`, and the log line still ran, because `log` is the outermost middleware. User 1's history holds only user 1's order.

## What the layers bought you

Compare this with the route handlers of the BookStore:

- **Each file answers one question.** "How is the total formatted?" is in the DTO. "When is an order refused?" is in the model and the service.
- **The business rules are testable without a server or a database.** You pass the service fake repositories; the first exercise below does it.
- **The database is replaceable.** The service only knows the ports. The second exercise swaps in PostgreSQL without touching the service.
- **Cross-cutting jobs are written once**, as middleware, not repeated in every handler.

The cost is more files, and a composition root that grows with every class. Wiring dozens of services by hand, in the right order, with their settings and their shutdown, only gets harder as the graph grows: [Clean architecture: ports and adapters](https://zudojs.oyinlola.site/learn/arch-clean) pushes this same composition root further, and [What a framework does](https://zudojs.oyinlola.site/learn/frameworks) is exactly the lesson where a framework takes that job off your hands.

## Practice

TRY IT YOURSELF

### Test the service with fakes

Test `OrderService.place` without the memory repositories: write two small objects that satisfy `BookRepository` and `OrderRepository`, and check the total, the new stock and the order's owner.

**Show a solution**

service-check.ts

```ts
import type { Book, Order } from "./model.js";
import { OrderService } from "./order.service.js";
import type { BookRepository, OrderRepository } from "./ports.js";

const saved: Book[] = [];
const books: BookRepository = {
  find: async (id) => (id === 1 ? { id: 1, title: "Kindred", priceCents: 1000, stock: 4 } : undefined),
  save: async (book) => {
    saved.push(book);
  },
};
const orders: OrderRepository = {
  add: async (order) => ({ ...order, id: 99 }),
  listFor: async () => [] as Order[],
};

const service = new OrderService(books, orders, 10);
const order = await service.place(5, 1, 3);

console.log(order.totalCents === 3000 ? "PASS total is 3 x 10.00" : "FAIL total");
console.log(saved[0]?.stock === 1 ? "PASS stock went from 4 to 1" : "FAIL stock");
console.log(order.userId === 5 ? "PASS order belongs to user 5" : "FAIL user");
```

Output of `npx tsx service-check.ts` and of the browser terminal

```ts
PASS total is 3 x 10.00
PASS stock went from 4 to 1
PASS order belongs to user 5
```

The fakes are plain objects. The service cannot tell them from a database, because it only depends on the ports.

TRY IT YOURSELF

### Swap in PostgreSQL

Write a `PgliteBookRepository` that implements `BookRepository` with PGlite, as in [the data lesson](https://zudojs.oyinlola.site/learn/bookstore-data), and place an order through the unchanged `OrderService`. Which files did you have to change?

**Show a solution**

One new infrastructure file:

pglite.repositories.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

import type { Book } from "./model.js";
import type { BookRepository } from "./ports.js";

export class PgliteBookRepository implements BookRepository {
  constructor(private readonly db: PGlite) {}

  async find(id: number): Promise<Book | undefined> {
    const { rows } = await this.db.query<Book>(
      `SELECT id, title, price_cents AS "priceCents", stock FROM books WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  async save(book: Book): Promise<void> {
    await this.db.query("UPDATE books SET stock = $2 WHERE id = $1", [book.id, book.stock]);
  }
}
```

And a different composition root:

main-pglite.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

import { MemoryOrderRepository } from "./memory.repositories.js";
import { OrderService } from "./order.service.js";
import { PgliteBookRepository } from "./pglite.repositories.js";

const db = new PGlite();
await db.exec(`CREATE TABLE books (id serial PRIMARY KEY, title text NOT NULL,
  price_cents integer NOT NULL, stock integer NOT NULL CHECK (stock >= 0));
  INSERT INTO books (title, price_cents, stock) VALUES ('Things Fall Apart', 1299, 3);`);

const service = new OrderService(new PgliteBookRepository(db), new MemoryOrderRepository(), 5);
console.log(await service.place(1, 1, 2));
console.log((await db.query("SELECT title, stock FROM books")).rows);
await db.close();
```

Output of `npx tsx main-pglite.ts`

```json
{ userId: 1, bookId: 1, quantity: 2, totalCents: 2598, id: 1 }
[ { title: 'Things Fall Apart', stock: 1 } ]
```

No file in the domain or the application layer changed. Only infrastructure and the composition root did. That is the dependency rule paying off. Install PGlite first (`npm install @electric-sql/pglite`) to run this on your computer.

## Recap

- Controllers translate HTTP, services run use cases, repositories load and save, models hold the business rules, DTOs define what crosses the network.
- Domain, application and infrastructure are layers. Dependencies point inward: the domain imports nothing, infrastructure implements the application's ports.
- Dependency injection passes each class what it needs. The composition root is the one place that creates and connects everything.
- Middleware wraps handlers for jobs every request shares, such as error mapping and logging.
- Configuration is read once, checked, frozen and injected.

Next: [Clean architecture: ports and adapters](https://zudojs.oyinlola.site/learn/arch-clean), which takes this same domain/application/infrastructure split and enforces the dependency rule with four rings and a checker.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
