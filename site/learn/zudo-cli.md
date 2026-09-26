---
title: "The ZudoJS CLI in depth — ZudoJS Academy"
description: "Use every command and option of the zudojs CLI, see how it finds your project and names and wires generated files, and read its errors in time."
source: https://zudojs.oyinlola.site/learn/zudo-cli
---

LEVEL 12 · LESSON 4 OF 19

Entering ZudoJS Core

# The ZudoJS CLI in depth

Use every command and option of the zudojs CLI, see how it finds your project and names and wires generated files, and read its errors in time.

- **50 min** to read and try
- **You need:** "Create the Task API project"
- **You build:** A shop-api practice project with generated resources, a module, middleware and features, plus your own small project CLI built on zudojs-cli

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- List every command and option the published CLI has and pick the right one
- Explain how the CLI finds a project and decides where generated files go
- Predict the files a schematic writes and the names it derives from yours
- Read the CLI's validation and generation errors and fix what they point at
- Replace generated stubs with real code and keep the wiring markers intact

## The problem: eight files and two edits

Your shop needs a `/api/v1/products` endpoint. In the Task API project from [Create the Task API project](https://zudojs.oyinlola.site/learn/zudo-create-project), the example resource shows what that takes: a DTO file with the schemas, a repository, a service, a controller, a routes file and a test. That is six new files. Then two existing files must change: `src/routes/index.ts` must call the new routes function, and `src/container.ts` must build the new controller. Forget either edit and the code compiles, the tests pass, and every request to `/api/v1/products` answers 404.

Now multiply that by a team. One developer calls the file `productController.ts`, another `products-controller.ts`, a third puts it in `src/http/`. Six months later nobody can guess where anything lives.

A code generator solves three problems at once:

- **Speed**: one command instead of eight careful edits.
- **Consistency**: every project names and places files the same way, so you can open any ZudoJS project and find the products controller.
- **Correctness**: the generated code compiles, its tests pass, and the wiring edits are made for you.

The previous lesson installed the CLI and tried each command once. This lesson goes through what each command really does, the rules it follows, and what it prints when something is wrong. The shell outputs below come from `zudojs-cli` 2.1.3 on Node.js 24; if yours is newer, run `zudojs --help` to see what changed.

To follow along, create a practice project next to `task-api`. Generating into it is safe, because you will throw it away:

Terminal on your computer

```bash
$ zudojs create shop-api --package-manager npm --capabilities ""
…
└  Project created successfully.
$ cd shop-api
```

## Every command and option

`zudojs --help` lists seven commands. `zudojs help <command>` (or `zudojs <command> --help`) prints the options of one. This table is all of them, taken from the help of every command:

| Command (alias) | Arguments | Options |
| --- | --- | --- |
| `create` (`new`) | `[project-name]` | `-t, --type` backend, frontend, fullstack · `-a, --architecture` monolith, modular-monolith, microservice · `-p, --package-manager` npm, pnpm, yarn, bun · `-d, --database` postgresql, mysql, sqlite · `--api` rest, graphql, rpc · `-f, --frontend` react, next, vue, nuxt, angular, svelte, sveltekit, astro, vanilla, flutter, react-native · `-F, --frontend-architecture` zudojs-standard, feature-based, minimal, framework-default · `-l, --language` typescript, javascript · `--no-install` · `--no-git` · `--services` (microservices only) · `--capabilities` cqrs, events, messaging, queue, observability, openapi, database, security |
| `dev` (`d`) | none | `--frontend-only` · `--backend-only` · `-p, --port` |
| `build` (`b`) | none | none |
| `generate` (`g`) | `<schematic> <name>` | `-s, --service` · `-m, --module` · `--dry-run` · `--force` |
| `add` | `<feature>` | `-s, --service` · `--skip-install` |
| `doctor` | none | none |
| `info` | none | none |

Every command also takes `-h, --help`, and `zudojs -v` prints the version. Some defaults matter: `--package-manager` defaults to `pnpm`, `--database` to `postgresql`, `--architecture` to `monolith` and `--type` to `backend`.

The CLI checks every value before it writes anything:

Terminal on your computer

```bash
$ zudojs create shop --architecture serverless --no-install --no-git
Invalid architecture: serverless. Valid: monolith, modular-monolith, microservice
$ zudojs create shop --package-manager deno --no-install --no-git
Invalid package manager: deno. Valid: pnpm, npm, yarn, bun
$ zudojs create "My Shop" --package-manager npm --no-install --no-git
Project name must start with a letter or digit and contain only alphanumeric characters, hyphens, and underscores.
$ zudojs create ../escape --package-manager npm --no-install --no-git
Project name must not contain path separators or '..'.
$ zudojs create task-api --package-manager npm --no-install --no-git
Directory "task-api" already exists in ~/code
$ zudojs create shop --language javascript --package-manager npm --no-install --no-git
Backend projects are generated in TypeScript only; --language javascript is not supported for --type backend.
```

The last one is worth knowing: `--language javascript` is listed in the help, but it only applies to frontend projects. A backend is always TypeScript.

### Exit codes

A command also reports success or failure with its **exit code**, the number a program hands back to the shell when it ends (`echo $?` prints the last one on macOS and Linux). Scripts and CI pipelines read it, not the text. These are the codes the CLI used in the runs for this lesson:

| Code | When | Example |
| --- | --- | --- |
| 0 | Success, including runs that only print warnings | `zudojs doctor` with warnings, `zudojs generate … --dry-run` |
| 1 | The command ran and failed | an invalid option value, a name that already exists, a failed `tsc` in `zudojs build`, not inside a project |
| 2 | The command line itself is incomplete | `zudojs generate resource` without a name |
| 3 | The command does not exist | `zudojs deploy` |

There is no `deploy` command, no `test` command and no `migrate` command. Those jobs belong to your npm scripts (`npm test`) and, once you add a database, to the `db:*` scripts the CLI writes into `package.json`.

## How the CLI finds your project

`create` works anywhere. Every other command except `info` needs a project, and it has to find one from the folder you are in.

REASON IT OUT

### Where am I?

Before reading how it works, think about what the CLI should do in each case. You run `zudojs generate resource products`:

1. inside `shop-api/src/routes`, a folder deep inside the project;
2. inside a Node.js project that has a `package.json` but was never made with ZudoJS;
3. inside `shop-api` after someone deleted `.zudojs/manifest.json`;
4. inside one service of a microservice project.

Which of these should work? Which should refuse? What could go wrong if the CLI guessed?

**Show the reasoning**

1. It should work. People run commands from wherever their terminal happens to be, so the CLI must walk up the folders until it finds the project root, and write files relative to that root, not to the current folder.
2. It must refuse. A bare `package.json` only proves "some JavaScript project". Earlier versions of the CLI did accept it, and `zudojs build` then climbed to an unrelated parent folder and ran *its* build script. Guessing here runs someone else's code.
3. It can still work if something else records the project. The `zudojs` block in `package.json` holds the project type and architecture too, so the manifest is not the only record.
4. Either answer is defensible, but it must be predictable: the service folder has its own `package.json` with a `zudojs` block, so the walk stops there first, and the CLI treats that one service as the project.

The rule the CLI uses: starting in the current folder and moving up one parent at a time, the first folder that contains one of these is the project root:

- `.zudojs/manifest.json`, written by `create`;
- `zudojs.config.ts` or `zudojs.config.js`, from older versions of the CLI;
- a `package.json` with a `zudojs` block.

Here is the same walk in a few lines of Node.js, run against a throwaway folder tree:

find-root.tsNode.js only

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

// A throwaway folder tree: code/shop-api is a ZudoJS project, code/notes is not.
const root = mkdtempSync(join(tmpdir(), "cli-"));
const shop = join(root, "code", "shop-api");
mkdirSync(join(shop, ".zudojs"), { recursive: true });
mkdirSync(join(shop, "src", "routes"), { recursive: true });
writeFileSync(join(shop, ".zudojs", "manifest.json"), JSON.stringify({ architecture: "monolith" }));
mkdirSync(join(root, "code", "notes"), { recursive: true });
writeFileSync(join(root, "code", "notes", "package.json"), JSON.stringify({ name: "notes" }));

function isZudoProject(dir: string): boolean {
  if (existsSync(join(dir, ".zudojs", "manifest.json"))) return true;
  if (existsSync(join(dir, "zudojs.config.ts")) || existsSync(join(dir, "zudojs.config.js"))) return true;
  const file = join(dir, "package.json");
  if (!existsSync(file)) return false;
  const pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return "zudojs" in pkg;
}

function findProjectRoot(start: string): string | null {
  let dir = start;
  while (true) {
    if (isZudoProject(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null; // reached the top of the disk
    dir = parent;
  }
}

for (const start of [join(shop, "src", "routes"), shop, join(root, "code", "notes")]) {
  const found = findProjectRoot(start);
  const label = relative(root, start).padEnd(27);
  console.log(label, "->", found === null ? "not a ZudoJS project" : relative(root, found));
}
rmSync(root, { recursive: true, force: true });
```

Output of `npx tsx find-root.ts`

```ts
code/shop-api/src/routes    -> code/shop-api
code/shop-api               -> code/shop-api
code/notes                  -> not a ZudoJS project
```

`dirname` returns the parent folder, and the parent of the top folder is itself, which is how the loop knows to stop. The real CLI prints the root it found whenever it is not the folder you are in:

Terminal on your computer

```bash
$ cd src/routes
$ zudojs generate dto coupons --dry-run
Detected architecture: monolith
Project root: ~/code/shop-api
Dry run: 1 file would be written or updated (nothing written):
  - src/dtos/coupons.dto.ts
$ cd /tmp
$ zudojs generate resource orders
This command must be run inside a Zudojs project directory.
$ zudojs info
Zudojs CLI
  Version: 2.1.3
  Node.js: v24.19.0

Not in a Zudojs project directory.
Run `zudojs create <project-name>` to create a new project.
```

`info` is the one command that still answers outside a project: it prints the CLI part and says there is no project.

### Architecture detection

Once it has the root, the CLI needs the **architecture**, because it decides where files go. It reads the architecture the project recorded: first the manifest, then an old `zudojs.config` file, then the `zudojs` block of `package.json`. Every command that generates prints the answer on its first line, `Detected architecture: monolith`. Delete the manifest and the `package.json` block still answers; `zudojs doctor` then reports where it found the project:

Terminal on your computer

```bash
$ rm -r .zudojs
$ zudojs doctor
…
✔ Zudojs project: backend (monolith) from package.json#zudojs
…
```

Only when nothing records an architecture does the CLI guess from the folders: an `apps/gateway` folder next to a `pnpm-workspace.yaml` means microservices, a `src/modules` folder means modular monolith, anything else is a monolith. `has` below stands for "this path exists in the project":

detect.js

```ts
function detectArchitecture(recorded, has) {
  if (["monolith", "modular-monolith", "microservice"].includes(recorded)) return `${recorded} (recorded)`;
  if (has("pnpm-workspace.yaml") && has("apps/gateway")) return "microservice (guessed)";
  if (has("src/modules")) return "modular-monolith (guessed)";
  return "monolith (guessed)";
}

const monolithFolders = new Set(["src/modules", "src/routes", "src/services"]);
const has = (path) => monolithFolders.has(path);

console.log(detectArchitecture("monolith", has));
console.log(detectArchitecture(undefined, has));
console.log(detectArchitecture(undefined, () => false));
```

Output of `node detect.js` and of the browser terminal

```ts
monolith (recorded)
modular-monolith (guessed)
monolith (guessed)
```

The second line is the trap: a monolith made by `create` has a `src/modules` folder too, so without its record it is guessed wrong, and generated files would go to module folders. So commit `.zudojs/manifest.json` and the `zudojs` block, and never edit them by hand.

The microservice case from the reasoning block really behaves as predicted. From inside a service, the CLI stops at the service's own `package.json` and treats the service as a monolith:

Terminal on your computer

```bash
$ cd shop-ms/apps/services/orders/src
$ zudojs generate event order-paid --dry-run
Detected architecture: monolith
Project root: ~/code/shop-ms/apps/services/orders
Dry run: 1 file would be generated (nothing written):
  - src/events/order-paid.event.ts
```

The file lands in the right service either way. From the top of a microservice project, use `--service orders` instead, as shown [below](#targets).

## Generate: the fourteen schematics

A **schematic** is one kind of thing the generator can write. `--dry-run` lists the files without writing them, so it is the fastest way to learn what each schematic does. This table is what the fourteen schematics wrote in a monolith for the name `orders`:

| Schematic | Files it writes (new) | Files it edits |
| --- | --- | --- |
| `resource` | dto, repository, service, controller, routes, `tests/orders.test.ts` | `src/routes/index.ts`, `src/container.ts` |
| `route` | dto, repository, service, controller, routes | `src/routes/index.ts`, `src/container.ts` |
| `controller` | dto, repository, service, controller | none |
| `service` | dto, repository, service | none |
| `repository` | dto, repository | none |
| `dto` | `src/dtos/orders.dto.ts` | none |
| `module` | `src/modules/orders/`: the module class, a `features/` folder and a `routes/index.ts` | `src/modules/index.ts`, `src/routes/index.ts`, `src/app.ts` |
| `middleware` | `src/middlewares/orders.middleware.ts` | `src/middlewares/index.ts`, `src/server.ts` |
| `command` | `src/commands/orders/`: command, handler, index | `package.json` (adds `@zudojs/cqrs`) |
| `query` | `src/queries/orders/`: query, handler, index | `package.json` (adds `@zudojs/cqrs`) |
| `event` | `src/events/orders.event.ts` | none |
| `job` | `src/jobs/orders.job.ts` | none |
| `model` | `src/models/orders.model.ts` | none |
| `validator` | `src/validators/orders.validator.ts` | none |

Two patterns are worth seeing in that table:

- The layered schematics **cascade**. A controller is useless without a service, a service without a repository, a repository without the DTO types it stores. So `generate controller` writes the whole chain below it. Only `route` and `resource` also wire the result into the app; the others leave it for you to connect.
- `module` also touches `src/app.ts`, where the new module is added to the runtime's list; `--dry-run` lists it too, so what it previews is what the real run writes.

### What the small schematics write

The resource files are complete and tested; you will trace them line by line in the [next lesson](https://zudojs.oyinlola.site/learn/zudo-project-anatomy). The small schematics write **stubs**: starting points that compile but do nothing useful yet. Here is exactly what four of them wrote:

src/events/order-placed.event.ts

```ts
/**
 * order-placed event.
 */

export interface OrderPlacedEvent {
  readonly type: "order-placed";
  readonly timestamp: Date;
}
```

src/jobs/send-invoice.job.ts

```ts
/**
 * send-invoice job.
 */

export async function sendInvoiceJob() {
  // Job implementation
}
```

src/models/invoice.model.ts

```ts
/**
 * invoice model.
 */

export interface InvoiceModel {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

src/validators/payment.validator.ts

```ts
/**
 * payment validator.
 */

export function validatePayment(input: unknown): boolean {
  return true;
}
```

The event, job and model stubs are harmless: an interface and an empty function. The validator stub is not. It accepts **everything**, and a function named `validatePayment` that is wired into a payment route looks finished to the next person who reads it. Fill it in before anything calls it. With `@zudojs/schema`, which the project already has:

payment.validator.ts

```ts
import { schema } from "@zudojs/schema";

// What `zudojs generate validator payment` writes:
export function validatePaymentStub(input: unknown): boolean {
  return true;
}

// What it should become before anything depends on it:
const PaymentSchema = schema.object({
  orderId: schema.string().min(1),
  amountKobo: schema.number().int().min(1),
  currency: schema.enum(["NGN", "USD"] as const),
});

export function validatePayment(input: unknown): boolean {
  return PaymentSchema.safeParse(input).success;
}

const good = { orderId: "ord_19", amountKobo: 250_000, currency: "NGN" };
const bad = { orderId: "", amountKobo: -500, currency: "BTC" };
console.log("stub:", validatePaymentStub(good), validatePaymentStub(bad), validatePaymentStub("DROP TABLE"));
console.log("real:", validatePayment(good), validatePayment(bad), validatePayment("DROP TABLE"));
const result = PaymentSchema.safeParse(bad);
if (!result.success) for (const issue of result.issues) console.log(`  ${issue.path.join(".")}: ${issue.message}`);
```

Output of `npx tsx payment.validator.ts` and of the browser terminal

```ts
stub: true true true
real: true false false
  orderId: String must be at least 1 character
  amountKobo: Expected >= 1, received -500
  currency: Expected one of "NGN", "USD"
```

The amount is in **kobo**, the smallest unit of the naira (₦2,500 is 250,000 kobo), so it can be a whole number with no rounding errors. A test that calls `validatePayment` with bad input, like the last line, is the cheapest way to prove a stub has been replaced.

The `middleware` stub is different: it is already registered in `src/server.ts` and passes every request straight through. Filling it in changes every request at once. Here it writes one audit line per request. `next()` runs the rest of the pipeline and resolves to the response:

audit.tsNode.js only

```ts
import { HttpMiddlewarePipeline, createResponseContext, createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

// src/middlewares/audit.middleware.ts, filled in: one line per request.
export function auditMiddleware(): HttpMiddleware {
  return async (context, next) => {
    const response = await next();
    console.log(`audit ${context.request.method} ${context.request.path} -> ${response.status}`);
    return response;
  };
}

const router = createRouter();
router.get("/api/v1/orders", async () => createResponseContext({ status: 200 }).json([]));

const dispatch: HttpMiddleware = async (context) =>
  (await router.dispatch(context.request, { signal: context.signal })).response;

const pipeline = new HttpMiddlewarePipeline({ middlewares: [auditMiddleware(), dispatch] });
const client = createHttpTestClient(pipeline);
await client.get("/api/v1/orders").expect(200);
await client.get("/api/v1/payments").expect(404);
await client.close();
```

Output of `npx tsx audit.ts`

```ts
audit GET /api/v1/orders -> 200
audit GET /api/v1/payments -> 404
```

The audit line comes *after* `await next()`, so it knows the status, and it sees 404s too. The [middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware) covers the pipeline properly.

## How your name becomes file and class names

You type one name; the generator needs a file name, class names, a type name and a URL. It derives them all with fixed rules, and refuses names that would produce broken code. The real CLI gave these answers:

Terminal on your computer

```bash
$ zudojs generate resource OrderItems --dry-run
Detected architecture: monolith
Dry run: 8 files would be written or updated (nothing written):
  - src/dtos/order-items.dto.ts
  …
$ zudojs generate resource 2fa --dry-run
Invalid resource name: "2fa". It must start with a letter: the name becomes a TypeScript class name, and "2fa" is not a valid identifier. Try "two-factor-auth" instead of "2fa".
$ zudojs generate resource records --dry-run
Detected architecture: monolith
Invalid resource name: "records". "Record" would shadow a JavaScript global; choose another name (for example "records-items").
$ zudojs generate resource ../admin --dry-run
Invalid resource name: "../admin". Use a plain name such as "users"; paths are not allowed.
```

This function applies the same rules, so you can predict the names before you run anything:

names.js

```ts
const RESERVED = new Set(["Array", "Date", "Error", "Map", "Object", "Promise", "Record", "Request", "Response", "Set", "String", "URL"]);

function normalizeName(name) {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")     // orderItems -> order-Items
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")  // HTTPServer -> HTTP-Server
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")               // anything else becomes a dash
    .replace(/^-+|-+$/g, "");                    // no dash at either end
}

const toPascal = (slug) => slug.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");

function singularize(slug) {
  if (/ies$/.test(slug) && slug.length > 4) return slug.slice(0, -3) + "y";
  if (/(ses|xes|zes|ches|shes)$/.test(slug)) return slug.slice(0, -2);
  if (/[^s]s$/.test(slug)) return slug.slice(0, -1);
  return slug;
}

function resourceNames(raw) {
  if (/[\\/]|\.\./.test(raw)) throw new Error(`"${raw}": paths are not allowed`);
  const slug = normalizeName(raw);
  if (slug === "") throw new Error(`"${raw}": needs at least one letter or digit`);
  if (/^[0-9]/.test(slug)) throw new Error(`"${raw}": must start with a letter`);
  const entity = toPascal(singularize(slug));
  if (RESERVED.has(entity)) throw new Error(`"${raw}": ${entity} would shadow a JavaScript global`);
  return `${slug}.controller.ts  ${toPascal(slug)}Controller  type ${entity}  /api/v1/${slug}`;
}

for (const raw of ["products", "OrderItems", "Order_Items", "Bad Name!", "categories", "boxes", "2fa", "records", "../admin"]) {
  try {
    console.log(resourceNames(raw));
  } catch (error) {
    console.log("refused", error.message);
  }
}
```

Output of `node names.js` and of the browser terminal

```ts
products.controller.ts  ProductsController  type Product  /api/v1/products
order-items.controller.ts  OrderItemsController  type OrderItem  /api/v1/order-items
order-items.controller.ts  OrderItemsController  type OrderItem  /api/v1/order-items
bad-name.controller.ts  BadNameController  type BadName  /api/v1/bad-name
categories.controller.ts  CategoriesController  type Category  /api/v1/categories
boxes.controller.ts  BoxesController  type Box  /api/v1/boxes
refused "2fa": must start with a letter
refused "records": Record would shadow a JavaScript global
refused "../admin": paths are not allowed
```

What to take from it:

- File names and URLs are **kebab-case** (`order-items`), classes are **PascalCase** (`OrderItemsController`). `OrderItems`, `Order_Items` and `order-items` all produce the same files, so the second one collides with the first.
- Name resources in the **plural**. The single record type is the singular: `categories` gives `Category`, `boxes` gives `Box`. The singular rule is simple English, so an irregular word like `people` stays `People`.
- `records` is refused because its record type would be called `Record`, which would hide TypeScript's built-in `Record<K, V>` in the generated files and break them.

## How generated code is wired in: markers

Writing new files is easy. Editing *your* files safely is the hard part: the generator must add one line to `src/routes/index.ts` without disturbing anything you wrote there. It does that with **markers**, pairs of comments that fence off the part of a file the CLI owns:

src/routes/index.ts (part)

```ts
export function registerRoutes(router: HttpRouter, deps: AppDependencies): void {
  registerHealthRoutes(router, deps.health);
  // zudojs:routes:start
  registerExamplesRoutes(router, deps.examplesController);
  // zudojs:routes:end
}
```

A generated project has markers in `src/server.ts` (`server-imports`, `server-mounts`, `server-middleware`), `src/routes/index.ts` (`route-imports`, `routes`), `src/container.ts` (`container-imports`, `container`), `src/configs/index.ts` (`config`) and `src/integrations/index.ts` (`integration-imports`, `integrations`). The insertion works like this:

markers.js

```ts
function insertBetweenMarkers(source, name, line) {
  const start = `// zudojs:${name}:start`;
  const end = `// zudojs:${name}:end`;
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end);
  if (startAt === -1 || endAt === -1 || endAt < startAt) return { status: "missing-markers", source };
  const between = source.slice(startAt + start.length, endAt);
  if (between.split("\n").some((existing) => existing.trim() === line.trim())) return { status: "present", source };
  const lineStart = source.lastIndexOf("\n", endAt) + 1;
  const indent = source.slice(lineStart, endAt);
  return { status: "inserted", source: source.slice(0, lineStart) + indent + line.trim() + "\n" + source.slice(lineStart) };
}

let routes = `export function registerRoutes(router, deps) {
  registerHealthRoutes(router, deps.health);
  // zudojs:routes:start
  registerExamplesRoutes(router, deps.examplesController);
  // zudojs:routes:end
}`;

const line = "registerProductsRoutes(router, deps.productsController);";
let result = insertBetweenMarkers(routes, "routes", line);
console.log(result.status);
routes = result.source;
console.log(routes);

result = insertBetweenMarkers(routes, "routes", line);
console.log(result.status);

const edited = routes.replace("  // zudojs:routes:end\n", "");
console.log(insertBetweenMarkers(edited, "routes", "registerOrdersRoutes(router, deps.ordersController);").status);
```

Output of `node markers.js` and of the browser terminal

```ts
inserted
export function registerRoutes(router, deps) {
  registerHealthRoutes(router, deps.health);
  // zudojs:routes:start
  registerExamplesRoutes(router, deps.examplesController);
  registerProductsRoutes(router, deps.productsController);
  // zudojs:routes:end
}
present
missing-markers
```

Three properties make this safe:

- The new line goes just before the end marker, with the marker's indentation, so the file stays tidy.
- It is **idempotent**: doing it twice has the same effect as doing it once. The second call finds the line already there and changes nothing. That is why `generate … --force` can rewrite a resource's own files without registering its routes twice.
- If the markers are gone, it does not guess where the line belongs.

The last case used to be a real trap: an older CLI would still write the other seven files, warn about the missing markers, and exit 0, so the resource looked generated while the route stayed unregistered. Delete the `routes` markers from `src/routes/index.ts` (say, while tidying up) and generate a resource now:

Terminal on your computer

```bash
$ zudojs generate resource orders
Detected architecture: monolith
Cannot register resource "orders": the files it registers into are missing their markers, so nothing was written.
  - src/routes/index.ts: add "registerOrdersRoutes(router, deps.ordersController);" between "// zudojs:routes:start" and "// zudojs:routes:end" (the markers are missing, so the file was left unchanged)
Restore the marker comments (or add the lines by hand and re-run with --force once the files exist).
$ echo $?
1
```

Now the whole plan is refused, nothing is written, and the exit code is 1: the same all-or-nothing check that refuses a name clash ([below](#errors)) also refuses a missing marker, because a resource generated but not wired in is just as broken as one only half written. Restore the marker comments and run it again. Missing markers are still worth avoiding on purpose: keep your own code outside them and never delete them, since a refusal here is safer than the silent 404 an older CLI would have left you with, but it is still a run that does nothing until you fix it.

## Modules and services: where files go

In a monolith every resource lives in the shared `src/` folders. The other two architectures add a target option:

- `--module billing` (`-m`) puts the files inside `src/modules/billing/` and registers the routes in that module's `routes/index.ts`. The module must exist first.
- `--service payments` (`-s`) in a microservice project puts the files in `apps/services/payments/`. Without it, files go to `apps/gateway/`.

Terminal on your computer (shop-mm: a modular monolith)

```bash
$ zudojs generate module billing
Detected architecture: modular-monolith
Generated 8 files:
  - src/modules/billing/billing.module.ts
  - src/modules/billing/index.ts
  - src/modules/index.ts
  - src/modules/billing/features/billing.feature.ts
  - src/modules/billing/features/index.ts
  - src/modules/billing/routes/index.ts
  - src/app.ts
  - src/routes/index.ts
$ zudojs generate resource payments --module billing
Detected architecture: modular-monolith
Generated 8 files:
  - src/modules/billing/dtos/payments.dto.ts
  - src/modules/billing/repositories/payments.repository.ts
  - src/modules/billing/services/payments.service.ts
  - src/modules/billing/controllers/payments.controller.ts
  - src/modules/billing/routes/payments.routes.ts
  - tests/modules/billing/payments.test.ts
  - src/modules/billing/routes/index.ts
  - src/container.ts
$ zudojs generate resource payments --module shipping
Detected architecture: modular-monolith
Module "shipping" does not exist at src/modules/shipping. Create it first: zudojs generate module shipping
$ zudojs generate service refunds --module billing
Detected architecture: modular-monolith
Generated 3 files:
  - src/modules/billing/dtos/refunds.dto.ts
  - src/modules/billing/repositories/refunds.repository.ts
  - src/modules/billing/services/refunds.service.ts
```

Two things are worth noticing in a modular monolith:

- **Tests are grouped by module.** `payments` in `billing` gets `tests/modules/billing/payments.test.ts`, so a same-named resource in a second module writes its own test alongside its own source files, with nothing to collide.
- **`--module` is respected by every schematic, including `service`.** `generate service refunds --module billing` writes the service (and the repository and DTO it cascades to) inside `billing`, exactly where `--module` points, the same as `resource` and `controller` do.

In a microservice project, a service name that does not exist is refused the same way: `No app at apps/services/billing. Pass --service with an existing service (or omit it for the gateway).`

## Generation errors and the two safety options

Here are the generator's refusals in one place, each from a real run in `shop-api`:

Terminal on your computer

```bash
$ zudojs generate resource products
Detected architecture: monolith
resource "products" already exists:
  - src/dtos/products.dto.ts
  - src/repositories/products.repository.ts
  - src/services/products.service.ts
  - src/controllers/products.controller.ts
  - src/routes/products.routes.ts
  - tests/products.test.ts
Choose another name, or re-run with --force to regenerate these files.
$ zudojs generate resource
Missing required argument "name".
Run "zudojs generate --help" for usage.
$ zudojs generate widget orders
Unknown schematic "widget". Available: resource, service, module, command, query, controller, repository, middleware, event, job, route, model, dto, validator
$ zudojs add payments
Unknown feature: "payments". Available: database, redis, websockets, email, docker, queue, messaging, openapi, observability, cache, storage, scheduler
```

Both name what was wrong and list what is valid, so you fix it from the message alone.

The two options that control writing:

- `--dry-run` writes nothing and lists what would change. Use it every time you are unsure about a name or a target.
- `--force` overwrites the schematic's own files. It regenerated the six products files above and left the wiring alone (the lines were already there). Everything you changed in those six files is lost, so commit first, then compare with `git diff` afterwards.

The order of the steps is what makes a refusal safe: the generator first works out the full list of files (the **plan**), checks the whole plan against the disk, and only then writes. Here is that order with a `Map` standing in for the disk:

plan.js

```ts
const disk = new Map([["src/dtos/products.dto.ts", "// yours, edited by hand"]]);

function planResource(slug) {
  return [`src/dtos/${slug}.dto.ts`, `src/services/${slug}.service.ts`, `src/controllers/${slug}.controller.ts`];
}

function generate(slug, { dryRun = false, force = false } = {}) {
  const plan = planResource(slug);
  const clashes = plan.filter((path) => disk.has(path));
  if (clashes.length > 0 && !force) {
    return `refused, "${slug}" already exists: ${clashes.join(", ")} (nothing written)`;
  }
  if (dryRun) return `dry run: ${plan.length} files would be written`;
  for (const path of plan) disk.set(path, `// generated ${slug}`);
  return `wrote ${plan.length} files`;
}

console.log(generate("orders", { dryRun: true }), "| files on disk:", disk.size);
console.log(generate("orders"), "| files on disk:", disk.size);
console.log(generate("products"), "| files on disk:", disk.size);
console.log(generate("products", { force: true }), "|", disk.get("src/dtos/products.dto.ts"));
```

Output of `node plan.js` and of the browser terminal

```ts
dry run: 3 files would be written | files on disk: 1
wrote 3 files | files on disk: 4
refused, "products" already exists: src/dtos/products.dto.ts (nothing written) | files on disk: 4
wrote 3 files | // generated products
```

Had it checked each file just before writing it, a clash on the third file would leave two new files behind and a half-generated resource. The last line shows the cost of `--force`: your hand-edited DTO is gone.

> THE GENERATOR CHECKS ITS OWN FILES FIRST
>
> A refused `generate` writes nothing: the "already exists" check runs before any file is touched. A *successful* generate changes several files at once, so start from a clean `git status`. If the result is not what you wanted, `git restore .` undoes the edits to files git already tracks, and `git clean -fd` deletes the new files. It deletes *every* untracked file, so check `git status` first.

## Templates follow the project

The generator's templates are built into the CLI, and it chooses between them based on what the project already has. After `zudojs add database`, the same `generate resource` writes a Prisma repository and a database model instead of only an in-memory one, and tells you the step it cannot do for you:

Terminal on your computer

```bash
$ zudojs add database --skip-install
Adding feature: database — PostgreSQL via Prisma 7 (prisma/schema.prisma, src/integrations/database.ts, db:* scripts)
Created:
  - prisma/schema.prisma
  - prisma.config.ts
  - src/integrations/database.ts
Updated:
  - src/integrations/index.ts
  - package.json
  - .gitignore
Feature "database" added successfully.
Next: Set DATABASE_URL in .env, then run the db:migrate script after adding models.
Next: In production, apply migrations with the built image: docker run --rm --env-file .env <image> npx prisma migrate deploy (the db:deploy script does the same locally).
Next: Resources generated from now on use Prisma; existing ones keep their in-memory repository until you swap it in src/container.ts.
$ zudojs generate resource coupons
Detected architecture: monolith
Generated 10 files:
  - src/dtos/coupons.dto.ts
  - src/repositories/coupons.repository.ts
  - src/repositories/coupons.prisma.repository.ts
  - src/services/coupons.service.ts
  - src/controllers/coupons.controller.ts
  - src/routes/coupons.routes.ts
  - tests/coupons.test.ts
  - prisma/schema.prisma
  - src/routes/index.ts
  - src/container.ts
Warning: Could not run "npx prisma generate" (dependencies were skipped above with --skip-install). Run it after installing dependencies; until then the Prisma repository does not type-check.
Warning: Finish by hand:
  - Run "prisma migrate dev --name add-coupons" (the Coupon model was added to prisma/schema.prisma).
```

`src/container.ts` now builds `new PrismaCouponsRepository()` for coupons, while `products` keeps its in-memory repository. The service and controller did not change at all: they only know the `CouponsRepository` interface. That is the layering from [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture) paying off. Running `zudojs add database` a second time is safe: it reports the files under `Kept (already present):` and only updates `package.json`.

`create`'s `--capabilities` work the same way at creation time. With `--capabilities cqrs,events,openapi`, the project gets `@zudojs/cqrs` and `@zudojs/openapi` in `package.json`, one `mountOpenAPI(…)` line in `src/server.ts`, and the three names in the manifest and in `zudojs.features`.

### No custom templates, but your own commands

The published CLI has no way to add your own schematics or replace its templates: there is no templates folder it reads and no plugin option. When your team wants a generator the CLI does not have, you have two honest options. Generate the closest schematic and edit it, or write a small command-line tool of your own. The `zudojs-cli` package exports the framework the CLI itself is built with. Install it in your project (`npm install zudojs-cli`) and describe your commands as objects:

scripts/shop.mjs

```ts
import { createCLI } from "zudojs-cli";

const cli = createCLI({ name: "shop", version: "0.1.0", description: "Shop maintenance commands" });

cli.register({
  name: "refund",
  description: "Refund an order",
  arguments: [{ name: "orderId", required: true }],
  options: [{ name: "amount", short: "a", type: "number", description: "Amount in naira" }],
  execute(ctx) {
    console.log(`Refunding order ${ctx.args[0]} for ₦${ctx.values.amount ?? "full amount"}`);
  },
});

process.exitCode = await cli.run(process.argv.slice(2));
```

Terminal on your computer

```bash
$ node scripts/shop.mjs refund ord_17 --amount 2500
Refunding order ord_17 for ₦2500
$ node scripts/shop.mjs refund
Missing required argument "orderId".
Run "shop refund --help" for usage.
$ echo $?
2
$ node scripts/shop.mjs help refund
Usage:
  shop refund <orderId> [options]

Description:
  Refund an order

Arguments:
  <orderId>

Options:
  -a, --amount <number>  Amount in naira
  -h, --help             Show help for this command.
```

You get the same help layout, argument checking and exit codes as `zudojs` itself, for free. `cli.run` resolves to the exit code instead of exiting, so you decide when the process ends.

## dev, build, doctor, info and add

These commands mostly hand work to the project's own scripts. Knowing that tells you where to look when one fails.

- **`zudojs dev`** prints the project type and architecture, then runs `npm run dev` (your package manager's version of it). `-p 4100` passes the port on as the `PORT` setting: the server then said `Listening on http://0.0.0.0:4100`. `--frontend-only` and `--backend-only` matter only in full-stack projects; in a backend project, `--frontend-only` prints `Warning: No development servers to start.` and still exits with 0.
- **`zudojs build`** runs `npm run build`, which is `tsc`, and passes its failure on:

Terminal on your computer

```bash
$ zudojs build
Building project at: ~/code/shop-api

> shop-api@0.1.0 build
> tsc

src/broken.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.
Build failed: Command "npm run build" exited with code 2
$ echo $?
1
```

- **`zudojs doctor`** runs ten checks: Node.js version, git, the package manager, the project record, the lock file, `node_modules`, `tsconfig.json`, the `@zudojs` dependencies, whether every feature has its package, and whether the manifest and `package.json` agree on capabilities. A ✔ is fine, a ⚠ is a warning (exit 0), a ✖ is an error (exit 1).

Terminal on your computer

```bash
$ zudojs doctor
Zudojs Doctor - Project Diagnostics

✔ Node.js version: Node.js v24.19.0 (meets minimum v24)
✔ Git: git version 2.53.0
✔ Package manager (npm): 11.19.0
✔ Zudojs project: backend (monolith) from .zudojs/manifest.json
✔ Package manager: npm (lock file present)
✔ Dependencies installed: node_modules present
✔ TypeScript configuration: tsconfig.json found in every app
✔ Zudojs dependencies: 14 Zudojs package(s) declared
✔ Features: Every declared feature has its package
⚠ Capabilities: "openapi" is in .zudojs/manifest.json but in no app's zudojs.features

Warnings:
  ⚠ Capabilities: "openapi" is in .zudojs/manifest.json but in no app's zudojs.features

All checks passed!
```

That warning came from editing the manifest by hand. The last check is a plain comparison of two lists:

capabilities.js

```ts
const manifest = {
  version: "2.1.3",
  projectType: "backend",
  architecture: "monolith",
  backend: { architecture: "monolith", api: "rest" },
  workspace: { packageManager: "npm" },
  capabilities: ["cqrs", "openapi", "events"],
};
const packageJson = {
  zudojs: { projectType: "backend", architecture: "monolith", features: ["cqrs", "openapi"] },
  dependencies: { "@zudojs/cqrs": "^1.2.0", "@zudojs/http": "^1.4.4" },
};

function compareCapabilities(manifest, pkg) {
  const recorded = new Set(manifest.capabilities);
  const declared = new Set(pkg.zudojs.features);
  const onlyInManifest = [...recorded].filter((c) => !declared.has(c));
  const onlyInPackage = [...declared].filter((c) => !recorded.has(c));
  if (onlyInManifest.length === 0 && onlyInPackage.length === 0) return "same capabilities";
  return `differ: manifest only [${onlyInManifest}], package.json only [${onlyInPackage}]`;
}

console.log(compareCapabilities(manifest, packageJson));
packageJson.zudojs.features.push("events");
console.log(compareCapabilities(manifest, packageJson));
console.log("architecture agrees:", manifest.architecture === packageJson.zudojs.architecture);
```

Output of `node capabilities.js` and of the browser terminal

```ts
differ: manifest only [events], package.json only []
same capabilities
architecture agrees: true
```

Two records of the same fact can drift apart, so something must compare them. `zudojs add` updates both, which is one more reason to add features with the CLI rather than by hand.

- **`zudojs info`** prints the CLI version, the project's name, type, architecture, package manager, capabilities (and services, in a microservice project), and every `@zudojs` dependency with its version range. Paste it into a bug report.
- **`zudojs add <feature>`** writes the feature's code, registers it between markers, adds its settings to `src/configs/index.ts` and `.env.example`, records it, and installs the packages unless you pass `--skip-install`. In a microservice project, `--service orders` adds it to one service: `zudojs add redis -s orders` created `apps/services/orders/src/integrations/redis.ts` and updated that service's config and `.env.example`.

## The CLI in a team and in CI

- **Pin the version in scripts.** `npx zudojs@2.1.3 generate …` gives everyone the same templates. `npx zudojs@latest` in a CI job means a new CLI release can change what your pipeline generates without any change in your repository.
- **Commit the records.** `.zudojs/manifest.json` and the `zudojs` block in `package.json` are how every later command understands the project.
- **Review generated code like any other code.** Generate on a clean working tree, read `git diff`, and look for stubs (`validator`, `job`) and in-memory repositories before they reach production. An in-memory repository forgets everything on restart, and every copy of your app has its own data.
- **Trust exit codes in CI, not text.** A CI step that runs `zudojs build` fails correctly on code 1. A step that greps the output for "success" does not.
- **Test what the generator cannot see.** The generated test builds its own router, so it passes even when the wiring is missing. One test that starts the whole app and requests each route catches a lost marker; the [next lesson](https://zudojs.oyinlola.site/learn/zudo-project-anatomy) builds exactly that.

A CI pipeline is a list of commands that stops at the first non-zero exit code. Here each "command" is a tiny Node.js process that exits with the code shown, the way the real ones did in this lesson:

ci-steps.tsNode.js only

```ts
import { spawnSync } from "node:child_process";

// Each step stands in for a real command; the number is the exit code it ends with.
const steps: Array<[string, number]> = [
  ["zudojs doctor", 0],
  ["npm run typecheck", 0],
  ["zudojs build", 1],
  ["npm test", 0],
];

for (const [name, code] of steps) {
  const run = spawnSync(process.execPath, ["-e", `process.exit(${code})`]);
  console.log(`${name.padEnd(18)} exit ${run.status}`);
  if (run.status !== 0) {
    console.log(`stopping: "${name}" failed, later steps are skipped`);
    process.exitCode = 1;
    break;
  }
}
```

Output of `npx tsx ci-steps.ts`

```ts
zudojs doctor      exit 0
npm run typecheck  exit 0
zudojs build       exit 1
stopping: "zudojs build" failed, later steps are skipped
```

`process.execPath` is the path of the running `node` program, and `spawnSync` waits for the child and reports its `status`, the exit code. Setting `process.exitCode = 1` makes the whole script fail too, so whatever runs it (GitHub Actions, a shell script) sees the failure. [Deploying a ZudoJS app](https://zudojs.oyinlola.site/learn/deployment) runs the same build and start steps in Docker, and [the CI/CD lesson](https://zudojs.oyinlola.site/learn/zudo-ci-cd) builds a real pipeline.

## Practice

TRY IT YOURSELF

### Predict a dry run

Without running it, write down the files `zudojs generate controller invoices --dry-run` lists in a monolith, and which existing files it edits. Then run it.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Find `controller` in the schematics table and read its two columns.

HINT 2

The layered schematics cascade downward only; `controller` needs everything below it in the table (which schematics are those?), but nothing wires it to a route.

SOLUTION

Terminal on your computer

```bash
$ zudojs generate controller invoices --dry-run
Detected architecture: monolith
Dry run: 4 files would be written or updated (nothing written):
  - src/dtos/invoices.dto.ts
  - src/repositories/invoices.repository.ts
  - src/services/invoices.service.ts
  - src/controllers/invoices.controller.ts
```

The controller cascades down to the DTO, and it edits nothing: no routes file is written and `src/container.ts` is not touched, so nothing serves it yet. For a reachable endpoint, generate a `resource` or a `route`.

TRY IT YOURSELF

### Warn about irregular plurals

The singular rule turns `people` into the type `People` and `news` into `New`. Add a check to `resourceNames` that refuses a name when its singular does not look right, using a small list of irregular words, and suggests a better name.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`const better = IRREGULAR.get(slug);` gives you the suggestion, or `undefined` when `slug` is not in the map.

HINT 2

`if (better) throw new Error(\`"${slug}" has an irregular plural; try "${better}"\`);`, the same shape as `checkUsername` above.

SOLUTION

irregular.js

```ts
const IRREGULAR = new Map([["people", "persons"], ["news", "news-items"], ["children", "child-records"]]);

function checkPlural(slug) {
  const better = IRREGULAR.get(slug);
  if (better) throw new Error(`"${slug}" has an irregular plural; try "${better}"`);
  return slug;
}

for (const name of ["customers", "people", "news"]) {
  try {
    console.log("ok", checkPlural(name));
  } catch (error) {
    console.log("refused", error.message);
  }
}
```

Output of `node irregular.js` and of the browser terminal

```ts
ok customers
refused "people" has an irregular plural; try "persons"
refused "news" has an irregular plural; try "news-items"
```

Refusing with a suggestion is the same style the CLI uses for `2fa` and `records`: the error tells you what to type next.

TRY IT YOURSELF

### A resource that answers 404

A teammate says: "I generated `resource shipments`, the tests pass, but `curl http://localhost:3000/api/v1/shipments` gives 404." List the two most likely causes and how to check each.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

The generated test builds its own router, so passing tests tell you nothing about whether the real server was wired up or is running fresh code. Think of one cause in each of those two categories.

HINT 2

One cause is about what `src/routes/index.ts` and `src/container.ts` actually contain right now, regardless of what `generate` reported; the other is about which script started the server they are curling.

SOLUTION

- **The wiring was reverted or edited by hand afterwards.** A missing marker now makes `generate` refuse the whole run (nothing is written, exit 1), so if the command reported success, `registerShipmentsRoutes` is between the `routes` markers in `src/routes/index.ts` and `shipmentsController` is in `src/container.ts` — unless someone removed one of those lines after the fact. Check both, and check `git log` for what changed them.
- **The running server is old.** With `npm start`, the server runs `dist/`, compiled before the resource existed. Run `npm run build` again, or use `npm run dev`, which restarts on every save.

The tests pass in both cases because `tests/shipments.test.ts` registers the routes on its own router.

## Recap

- The CLI has seven commands. `create` validates every option before writing; `dev` and `build` run your npm scripts; `doctor` checks ten things; `info` describes the CLI and the project; `add` plugs in features; `generate` writes code from fourteen schematics.
- Exit codes: 0 success (warnings included), 1 failure, 2 incomplete command line, 3 unknown command.
- The CLI walks up from the current folder to the first folder with a manifest, a `zudojs.config` file or a `zudojs` block in `package.json`, and reads the architecture from there.
- Names become kebab-case files and PascalCase classes; resources are plural, their record types singular; names that would break the code are refused.
- Generated wiring goes between `// zudojs:…` markers, idempotently. Missing markers refuse the whole run rather than write half of it, so read the end of every run.
- Stubs such as the validator compile but do nothing; replace them before anything depends on them. There are no custom templates, but `zudojs-cli` lets you build your own commands.

Next, [Anatomy of a ZudoJS project](https://zudojs.oyinlola.site/learn/zudo-project-anatomy) opens the files `create` and `generate resource` wrote and follows one request from `src/server.ts` all the way to the repository and back.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
