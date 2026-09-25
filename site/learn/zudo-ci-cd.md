---
title: "CI/CD with GitHub Actions — ZudoJS Academy"
description: "Build a pipeline for the Task API that type-checks, lints, tests, audits, builds and deploys every change, with migrations and automatic rollback."
source: https://zudojs.oyinlola.site/learn/zudo-ci-cd
---

LEVEL 17 · LESSON 5 OF 5

Production Production

# CI/CD with GitHub Actions

Build a pipeline for the Task API that type-checks, lints, tests, audits, builds and deploys every change, with migrations and automatic rollback.

- **60 min** to read and try
- **You need:** Deploying a ZudoJS app, A production security review, Diagnosing performance, and Git branches and pull requests
- **You build:** A GitHub Actions workflow for a generated ZudoJS project, every step run locally first, and a deploy script that migrates, checks health and rolls back

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Order the stages of a pipeline so cheap checks fail first and nothing is deployed after a failure
- Run every stage locally on a generated ZudoJS project and fix what it finds before CI does
- Write a GitHub Actions workflow with jobs, a PostgreSQL service, least-privilege permissions, environments and secrets, and check it with actionlint
- Apply migrations in the pipeline and write migrations that the previous release survives
- Deploy an image by its commit, verify it with a health check, and roll back automatically

## Three surprises in one week

The Task API has tests, a security review and a deployment recipe. Yet in the week this lesson was written, three problems reached the point of deploying, each in a way that no single person would notice:

- A test called `tasks.create({ title: … })` instead of `{ name: … }`. `npm run typecheck` passed anyway: the generated `tsconfig.json` only covers `src/`, and Vitest strips types without checking them.
- A release started reading a new required setting, `PAYMENTS_URL`. It worked on the developer's laptop, where `.env` had the value. On a clean machine it did not even start.
- Adding the database feature pulled in the Prisma CLI, and with it 4 dependencies with known high-severity vulnerabilities. `npm install` printed a warning that scrolled away.

**Continuous integration** (CI) means every change, on every branch, is built and checked automatically on a clean machine, the same way every time. **Continuous delivery** (CD) extends that: a change that passes is packaged once and can be deployed by a button or automatically, with the same steps every time. Together they are a **pipeline**: a list of stages, where each stage must pass before the next one runs.

This lesson builds that pipeline for the Task API with **GitHub Actions**, GitHub's built-in CI service. Every stage is first run by hand on a project generated with the published `zudojs` CLI (`zudojs create`, then `zudojs add database`, `zudojs generate resource tasks` and `zudojs add docker`), so you see what each one catches. Outputs in `<shell>` blocks are real, and yours will differ in times and ids.

## The pipeline

```ts
 push / pull request
        │
        ▼
 ┌─────────┐  ┌────────────┐  ┌──────┐  ┌────────────┐
 │ install │─▶│ type check │─▶│ lint │─▶│ unit tests │──┐
 └─────────┘  └────────────┘  └──────┘  └────────────┘  │
                                                        ▼
 ┌──────────────────────┐   ┌───────────────────────────────────┐
 │ security checks      │   │ integration tests                 │
 │ (audit, secret scan) │   │ (real PostgreSQL, real migrations)│
 └──────────┬───────────┘   └────────────────┬──────────────────┘
            └──────────────┬─────────────────┘
                           ▼
                ┌──────────────────────┐
                │ build images, tagged │
                │ with the commit      │
                └──────────┬───────────┘
                           ▼  (main branch only)
       deploy to staging ─▶ approval ─▶ deploy to production
```

Each box runs only if everything before it passed. The same image goes to staging and production.

The order follows a few rules:

- **Cheap and likely failures first.** A type error is found in seconds; there is no point starting a database for a change that does not compile.
- **Exit codes are the contract.** Every tool reports success with exit code 0 and failure with anything else. The pipeline does not read output; it stops at the first non-zero exit.
- **The same commands everywhere.** CI runs `npm run lint`, not a copy of the linter's command line. What passes on your machine passes in CI, and the other way round.
- **Build once, deploy the same thing everywhere.** The image tested in staging is byte for byte the image that reaches production. Nothing is rebuilt between environments.

Here is the rule "stop at the first failure" as a program. Each stage is a small Node.js process; the lint stage fails:

pipeline.tsNode.js only

```ts
import { spawnSync } from "node:child_process";

const stages: Array<[string, string]> = [
  ["install", "process.exit(0)"],
  ["type check", "process.exit(0)"],
  ["lint", "console.error('src/services/tasks.service.ts:22:20 lint/suspicious/noDoubleEquals'); process.exit(1)"],
  ["unit tests", "process.exit(0)"],
  ["integration tests", "process.exit(0)"],
  ["build", "process.exit(0)"],
  ["deploy", "process.exit(0)"],
];

let failed: string | undefined;
for (const [name, program] of stages) {
  if (failed !== undefined) {
    console.log(`skip  ${name}`);
    continue;
  }
  const result = spawnSync(process.execPath, ["-e", program], { encoding: "utf8" });
  if (result.status === 0) {
    console.log(`pass  ${name}`);
  } else {
    failed = name;
    console.log(`FAIL  ${name} (exit code ${result.status}): ${result.stderr.trim()}`);
  }
}
console.log(failed === undefined ? "pipeline passed" : `pipeline failed at "${failed}": nothing was deployed`);
process.exitCode = failed === undefined ? 0 : 1;
```

Output of `npx tsx pipeline.ts`

```ts
pass  install
pass  type check
FAIL  lint (exit code 1): src/services/tasks.service.ts:22:20 lint/suspicious/noDoubleEquals
skip  unit tests
skip  integration tests
skip  build
skip  deploy
pipeline failed at "lint": nothing was deployed
```

REASON IT OUT

### Before you write the workflow

Think through these before reading on:

1. Two developers merge to `main` a minute apart. Both pipelines reach "deploy". What can go wrong, and what should happen?
2. The deploy runs the migrations, then the new app fails its health check. The old version comes back. Does it still work with the database the migration just changed?
3. Which of the Task API's secrets does the pipeline itself need, and which should it never see?
4. A pull request comes from someone outside your team, from a fork. Should their code run with your deployment key available?

**Show the reasoning**

1. Two deploys could interleave: the older commit could finish last and overwrite the newer one, or both could run migrations at once. Deploys to one environment must run one at a time, in order. In GitHub Actions that is a `concurrency` group per environment that queues instead of cancelling.
2. Only if the migration was written for it. A migration that adds a column with a default is harmless to the old code; one that renames or drops a column breaks it. So every migration must keep the previous release working (expand and contract), or rollback is not an option.
3. The pipeline needs a way to publish images and to reach the server (an SSH key). It does not need the database password or the payment provider's key: those live on the server, in the environment's configuration. The fewer secrets CI holds, the less a compromised workflow can leak.
4. No. Code from a fork can do anything a workflow step can, including printing secrets. GitHub does not pass secrets to workflows triggered by pull requests from forks, and deploy jobs run only for pushes to `main`.

## Run every stage locally first

A pipeline is only as good as the scripts it calls. The generated project has most of them; three need work before CI can rely on them.

### Type-check the tests too

The generated `tsconfig.json` includes only `src/**/*`, so test files are never type-checked. A second configuration for type checking only fixes that, and it needs no changes to the build:

tsconfig.test.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true, "rootDir": "." },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Terminal on your computer

```bash
$ npm pkg set 'scripts.typecheck:tests=tsc -p tsconfig.test.json'
$ npm run typecheck

> task-api@0.1.0 typecheck
> tsc --noEmit

$ npm run typecheck:tests

> task-api@0.1.0 typecheck:tests
> tsc -p tsconfig.test.json

tests/integration/tasks.db.test.ts(20,42): error TS2353: Object literal may only specify known properties, and 'title' does not exist in type '{ name: string; }'.
```

That was the first surprise, now caught. The integration test it came from is shown further down.

### A real linter

The generated `lint` script is `tsc --noEmit`, the same as `typecheck`. A linter looks for code that compiles but is probably wrong. **Biome** is a fast linter (and formatter) in one package:

Terminal on your computer

```bash
$ npm install -D --save-exact @biomejs/biome
$ npx biome init
$ npm pkg set 'scripts.lint=biome lint src tests'
$ npm run lint

> task-api@0.1.0 lint
> biome lint src tests

Checked 46 files in 91ms. No fixes applied.
```

> THE PACKAGE NAME MATTERS
>
> The Biome CLI is the package `@biomejs/biome`. Running `npx biome` in a project that does not have it installed downloads and runs whatever package is called `biome` on npm, which is an unrelated, years-old package. Install tools as dev dependencies, then `npx` runs the version in your lockfile.

To see what it catches that `tsc` does not, add two mistakes to `TasksService.create`: an unused variable and a loose comparison. `npm run typecheck` still passes; the linter does not:

Terminal on your computer

```bash
$ npm run typecheck

> task-api@0.1.0 typecheck
> tsc --noEmit

$ npm run lint

> task-api@0.1.0 lint
> biome lint src tests

src/services/tasks.service.ts:21:11 lint/correctness/noUnusedVariables  FIXABLE  ━━━━━━━━━━━━━━━━━━━

  ! This variable trimmed is unused.
  
    20 │   public create(input: CreateTaskInput): Promise<Task> {
  > 21 │     const trimmed = input.name.trim();
       │           ^^^^^^^
    22 │     if (input.name == "") throw new Error("A task needs a name");
    23 │     return this.repository.create(input);
  
  i Unused variables are often the result of typos, incomplete refactors, or other sources of bugs.
  
  i Unsafe fix: If this is intentional, prepend trimmed with an underscore.
  
    19 19 │   
    20 20 │     public create(input: CreateTaskInput): Promise<Task> {
    21    │ - ····const·trimmed·=·input.name.trim();
       21 │ + ····const·_trimmed·=·input.name.trim();
    22 22 │       if (input.name == "") throw new Error("A task needs a name");
    23 23 │       return this.repository.create(input);
  

src/services/tasks.service.ts:22:20 lint/suspicious/noDoubleEquals  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━

  × Using == may be unsafe if you are relying on type coercion.
  
    20 │   public create(input: CreateTaskInput): Promise<Task> {
    21 │     const trimmed = input.name.trim();
  > 22 │     if (input.name == "") throw new Error("A task needs a name");
       │                    ^^
    23 │     return this.repository.create(input);
    24 │   }
  
  i == is only allowed when comparing against null.
  
  i Unsafe fix: Use === instead.
  
    22 │ ····if·(input.name·===·"")·throw·new·Error("A·task·needs·a·name");
       │                      +                                            

Checked 46 files in 85ms. No fixes applied.
Found 1 error.
Found 1 warning.
lint ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
```

Commit `biome.json` so everyone and CI use the same rules. `src/generated/` (the Prisma client) is skipped because it is in `.gitignore` and `biome init` turned on `useIgnoreFile`.

### Unit tests and integration tests

**Unit tests** run in memory, need nothing else, and take seconds; the generated tests are of this kind. **Integration tests** check your code together with the real things it talks to: here, PostgreSQL with the real migrations. They are slower and need a database, so they get their own script. This one exercises the Prisma repository that `zudojs generate resource` wrote:

tests/integration/tasks.db.test.ts

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogger, LoggerLevel } from "@zudojs/logger";

import { loadConfig } from "../../src/configs/index.js";
import { databaseIntegration, prisma } from "../../src/integrations/database.js";
import { PrismaTasksRepository } from "../../src/repositories/tasks.prisma.repository.js";

// Runs against a real PostgreSQL: the one in DATABASE_URL, migrated with `npm run db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("tasks table (PostgreSQL)", () => {
  const tasks = new PrismaTasksRepository();

  beforeAll(async () => {
    const config = await loadConfig(process.env);
    await databaseIntegration.start({ config, logger: createLogger({ name: "test", level: LoggerLevel.ERROR }) });
    await prisma().task.deleteMany();
  });
  afterAll(() => databaseIntegration.stop());

  it("stores, finds, renames and deletes a task", async () => {
    const created = await tasks.create({ name: "Renew passport" });
    expect(await tasks.findById(created.id)).toMatchObject({ name: "Renew passport" });
    expect(await tasks.update(created.id, { name: "Renew passport (urgent)" })).toMatchObject({ name: "Renew passport (urgent)" });
    expect(await tasks.delete(created.id)).toBe(true);
    expect(await tasks.findById(created.id)).toBeUndefined();
  });

  it("stores text with quotes exactly as written", async () => {
    const created = await tasks.create({ name: "O'Brien's \"quarterly\" report" });
    expect((await tasks.findById(created.id))?.name).toBe("O'Brien's \"quarterly\" report");
  });
});
```

Terminal on your computer

```bash
$ npm pkg set 'scripts.test=vitest run --exclude "tests/integration/**"' 'scripts.test:integration=vitest run tests/integration'
```

`describe.skipIf` skips the file when `DATABASE_URL` is not set, so `npm run test:integration` on a laptop without a database is not an error. In CI the variable is always set, so it always runs.

### The whole pipeline, on a clean clone

Your working folder hides problems: a `.env` file, generated files, packages installed months ago. CI starts from nothing, so do the same: clone the repository into a new folder and run every stage there. A throwaway PostgreSQL in Docker plays the CI database:

A clean clone (example output)

```bash
$ docker run -d --name ci-postgres -e POSTGRES_USER=taskapi -e POSTGRES_PASSWORD=ci-only-password -e POSTGRES_DB=taskapi_ci -p 127.0.0.1:55999:5432 postgres:17
$ git clone ~/task-api /tmp/task-api-ci && cd /tmp/task-api-ci
$ export DATABASE_URL=postgresql://taskapi:ci-only-password@localhost:55999/taskapi_ci
$ npm ci

> task-api@0.1.0 postinstall
> prisma generate
…
✔ Generated Prisma Client (7.10.0) to ./src/generated/prisma in 86ms

added 223 packages, and audited 224 packages in 29s
…
found 0 vulnerabilities
$ npm run typecheck
…
$ npm run typecheck:tests
…
$ npm run lint
…
Checked 46 files in 89ms. No fixes applied.
$ npm test
…
 Test Files  2 passed (2)
      Tests  6 passed (6)
$ npm run db:deploy

> task-api@0.1.0 db:deploy
> prisma migrate deploy
…
Datasource "db": PostgreSQL database "taskapi_ci", schema "public" at "localhost:55999"

2 migrations found in prisma/migrations

Applying migration `20260925020538_add_tasks`
Applying migration `20260925023009_add_task_done`
…
All migrations have been successfully applied.
$ npm run test:integration
…
 FAIL  tests/integration/tasks.db.test.ts > tasks table (PostgreSQL)
ConfigurationError: PAYMENTS_URL is not set.
 ❯ required src/configs/index.ts:47:11
 ❯ loadConfig src/configs/index.ts:83:36
 ❯ tests/integration/tasks.db.test.ts:13:20
…
 Test Files  1 failed (1)
      Tests  2 skipped (2)
```

There is the second surprise. `npm ci` installs exactly what `package-lock.json` lists (it fails if the lockfile and `package.json` disagree), and the `postinstall` script regenerates the Prisma client, so a clean clone compiles. The migrations applied in order to an empty database. But the configuration needs `PAYMENTS_URL`, which only existed in a developer's `.env`, and `.env.example`, the list of settings a new environment must provide, never mentioned it. With the variable set, the integration tests pass:

(example output)

```bash
$ PAYMENTS_URL=https://payments.example.test npm run test:integration
…
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

That kind of drift can be caught before any test runs. This check compares the settings the configuration code requires with the names in `.env.example`:

env-check.ts

```ts
const configSource = `
    nodeEnv: text(config, "node_env", "development"),
    port: port(config),
    payments: Object.freeze({ url: required(config, "payments_url") }),
    database: Object.freeze({ url: text(config, "database_url", "") }),
`;
const envExample = `
NODE_ENV=development
PORT=3000
# Comma-separated origins allowed to call the API from a browser (empty: none)
CORS_ORIGINS=
DATABASE_URL=postgresql://localhost:5432/task-api
`;

const required = [...configSource.matchAll(/required\(config, "([a-z_]+)"\)/g)].map((m) => m[1]!.toUpperCase());
const documented = new Set(
  envExample.split("\n").filter((line) => /^[A-Z_]+=/.test(line)).map((line) => line.split("=")[0]),
);
const missing = required.filter((name) => !documented.has(name));
console.log("required settings:", required);
console.log(missing.length === 0 ? "PASS  .env.example lists every required setting" : `FAIL  missing from .env.example: ${missing.join(", ")}`);
```

Output of `npx tsx env-check.ts` and of the browser terminal

```ts
required settings: [ 'PAYMENTS_URL' ]
FAIL  missing from .env.example: PAYMENTS_URL
```

In a real project, read both files with `readFile` and run the check with the unit tests. The fix itself is one line in `.env.example`, plus the value in every environment before the release that needs it; [the rollback section](#rollbacks) shows what happens when that order is missed.

### Build

The last local stages build the app and the images. `zudojs add docker` wrote a multi-stage `Dockerfile` like the one in [the deployment lesson](https://zudojs.oyinlola.site/learn/deployment#docker). Its final image has no Prisma CLI, because `npm prune --omit=dev` removes it, so it cannot run migrations. One extra stage gives a second image for exactly that job, built from the same commit:

```ts
# Dockerfile (the part after "RUN npm run build")
# Migrations run from this stage: it has the Prisma CLI and prisma/migrations.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS prune
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
…
COPY --from=prune --chown=node:node /app/node_modules ./node_modules
COPY --from=prune --chown=node:node /app/dist ./dist
```

(example output)

```bash
$ npm run build

> task-api@0.1.0 build
> prisma generate && tsc
…
✔ Generated Prisma Client (7.10.0) to ./src/generated/prisma in 178ms
$ docker build -q -t task-api:ddc4ac4 .
sha256:16ccf8950283157dd908c5c58d1e2777b885f57b2741d0502d33c78a6653b574
$ docker build -q --target migrate -t task-api-migrate:ddc4ac4 .
sha256:3647b31dd313013eac020eacfceca33cd9bcbc96569dc6a6353a15e73451f434
$ docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep task-api
task-api:ddc4ac4 522MB
task-api-migrate:ddc4ac4 802MB
```

The tag `ddc4ac4` is the commit (`git rev-parse --short HEAD`). A tag like `latest` changes meaning with every build; a commit tag always names exactly one version of the code, which is what makes deploying and rolling back precise.

## Security checks

### Known vulnerabilities in dependencies

`npm audit` compares the lockfile with the database of published advisories. `--audit-level=high` makes it exit with 1 when anything high or critical is found, which is what fails the stage. Right after `zudojs add database`:

(example output)

```bash
$ npm audit --audit-level=high
# npm audit report

deepmerge-ts  <8.0.0
Severity: high
DeepmergeTS has stack exhaustion when merging recursive object graphs - https://github.com/advisories/GHSA-ggr8-5vv4-36mx
fix available via `npm audit fix --force`
Will install prisma@6.19.3, which is a breaking change
node_modules/deepmerge-ts
  @prisma/config  6.13.0-dev.1 - 8.1.0-dev.4
  Depends on vulnerable versions of deepmerge-ts
  node_modules/@prisma/config
    prisma  6.13.0-dev.1 - 8.1.0-dev.6
    Depends on vulnerable versions of @prisma/config
    Depends on vulnerable versions of mysql2
    node_modules/prisma

mysql2  <=3.23.0
Severity: high
MySQL2: Auth Plugin Downgrade to mysql_clear_password Leaks Plaintext Credentials - https://github.com/advisories/GHSA-3f6p-5ww8-9rcr
MySQL2: Unbounded zlib inflate in compressed MySQL protocol handler allows decompression-bomb DoS - https://github.com/advisories/GHSA-rgwj-5xj2-c3m3
fix available via `npm audit fix --force`
Will install prisma@6.19.3, which is a breaking change
node_modules/mysql2

4 high severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force
```

This is the third surprise, and a typical one: none of these packages is in your code. They come with the Prisma CLI (`mysql2` even though the Task API uses PostgreSQL), and the fix npm suggests is a downgrade to Prisma 6, a breaking change. **Triage** means deciding, for each finding: is the vulnerable code reachable, how bad would it be, and what is the cheapest safe fix? Here, patched versions of both packages exist, and npm's `overrides` can force them under Prisma:

(example output)

```bash
$ npm pkg set 'overrides.deepmerge-ts=^8.0.2' 'overrides.mysql2=^3.24.4'
$ npm install
…
found 0 vulnerabilities
$ npm ls deepmerge-ts mysql2
task-api@0.1.0
└─┬ prisma@7.10.0
  ├─┬ @prisma/config@7.10.0
  │ └── deepmerge-ts@8.0.2
  └── mysql2@3.24.4
$ npm run build && npm run db:deploy && npm run test:integration
…
```

An override is a decision you now own: run the full pipeline after adding it, and remove it when Prisma ships the fixed versions itself. When no patched version exists yet, a team may accept a finding for a while. Make that acceptance explicit, with a reason and an expiry date, so it cannot quietly become permanent. A small gate over `npm audit --json` does that:

audit-gate.ts

```ts
interface Advisory { readonly severity: "low" | "moderate" | "high" | "critical"; readonly via: readonly unknown[] }
interface Exception { readonly packageName: string; readonly reason: string; readonly expires: string }

// The shape of `npm audit --json`, cut down to what the gate reads.
const report: { vulnerabilities: Record<string, Advisory> } = {
  vulnerabilities: {
    "deepmerge-ts": { severity: "high", via: [{ url: "https://github.com/advisories/GHSA-ggr8-5vv4-36mx" }] },
    mysql2: { severity: "high", via: [{ url: "https://github.com/advisories/GHSA-3f6p-5ww8-9rcr" }] },
    "@prisma/config": { severity: "high", via: ["deepmerge-ts"] },
    prisma: { severity: "high", via: ["@prisma/config", "mysql2"] },
    "brace-expansion": { severity: "low", via: [{ url: "https://github.com/advisories/GHSA-v6h2-p8h4-qcjw" }] },
  },
};
const exceptions: Exception[] = [
  { packageName: "mysql2", reason: "Prisma CLI only; the app never loads the MySQL driver", expires: "2026-10-15" },
  { packageName: "deepmerge-ts", reason: "Prisma CLI config merging, build time only", expires: "2026-09-01" },
];

function auditGate(today: string): number {
  let failures = 0;
  for (const [name, advisory] of Object.entries(report.vulnerabilities)) {
    if (advisory.severity !== "high" && advisory.severity !== "critical") continue;
    const direct = advisory.via.some((entry) => typeof entry === "object");
    if (!direct) continue; // reported again at the package that really has the advisory
    const exception = exceptions.find((e) => e.packageName === name);
    if (exception !== undefined && exception.expires >= today) {
      console.log(`accepted  ${name} until ${exception.expires}: ${exception.reason}`);
    } else {
      failures += 1;
      console.log(`FAIL      ${name} (${advisory.severity})${exception ? `, exception expired on ${exception.expires}` : ""}`);
    }
  }
  return failures;
}

const failures = auditGate("2026-09-25");
console.log(failures === 0 ? "audit gate passed" : `audit gate failed: ${failures} finding(s)`);
```

Output of `npx tsx audit-gate.ts` and of the browser terminal

```ts
FAIL      deepmerge-ts (high), exception expired on 2026-09-01
accepted  mysql2 until 2026-10-15: Prisma CLI only; the app never loads the MySQL driver
audit gate failed: 1 finding(s)
```

Packages whose `via` lists only other package names are just carriers; the gate counts each advisory once, at the package that has it. The expired exception fails the build on the day it expires, which forces someone to look again.

### Secrets in the history

A secret committed once stays in the Git history even after the file is fixed. **gitleaks** scans every commit for things that look like keys and tokens. On the Task API's history:

(example output)

```bash
$ gitleaks git --redact --no-banner
3:35AM INF Unknown SCM platform. Use --platform to include links in findings. host=
3:35AM INF 7 commits scanned.
3:35AM INF scanned ~206036 bytes (206.04 KB) in 382ms
3:35AM INF no leaks found
```

And on a branch where someone committed a GitHub token in a "deploy helper":

(example output)

```bash
$ gitleaks git --redact --no-banner -v
Finding:     REDACTED
Secret:      REDACTED
RuleID:      github-pat
Entropy:     4.871928
File:        src/constants/deploy.ts
Line:        1
Commit:      a9df1cc472395931d28dfd5dcc1a43dfa645486a
Author:      Ada
Email:       ada@example.com
Date:        2026-09-25T02:20:40Z
Fingerprint: a9df1cc472395931d28dfd5dcc1a43dfa645486a:src/constants/deploy.ts:github-pat:1

3:20AM INF 4 commits scanned.
3:20AM INF scanned ~200675 bytes (200.68 KB) in 287ms
3:20AM WRN leaks found: 1
```

`--redact` keeps the secret itself out of the CI log. When a real secret is found, deleting the commit is not enough: anyone who fetched it has it. **Revoke and rotate** the secret first ([key rotation](https://zudojs.oyinlola.site/learn/sec-crypto#rotation)), then clean the history if you must.

### The review checks

The security checks from [the security review](https://zudojs.oyinlola.site/learn/zudo-production-security) (deny by default, CSRF, cookies, error leakage, log canaries) are ordinary tests. Put them in `tests/security/`, and they run in the unit or integration stage, on every change, forever.

## The workflow file

A GitHub Actions **workflow** is a YAML file in `.github/workflows/`. It says **when** to run (`on`), and **what**: a set of **jobs**, each on a fresh virtual machine (a **runner**), each a list of **steps**. A step either runs a shell command (`run`) or uses a published **action** (`uses`), a reusable step such as "check out the code". Here is the whole pipeline for the Task API:

```ts
# .github/workflows/ci.yml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  verify:
    name: Type check, lint, unit tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run typecheck:tests
      - run: npm run lint
      - run: npm test

  integration:
    name: Migrations and integration tests
    needs: verify
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: taskapi
          POSTGRES_PASSWORD: ci-only-password
          POSTGRES_DB: taskapi_ci
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U taskapi -d taskapi_ci"
          --health-interval 2s
          --health-retries 30
    env:
      DATABASE_URL: postgresql://taskapi:ci-only-password@localhost:5432/taskapi_ci
      PAYMENTS_URL: https://payments.example.test
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run db:deploy
      - run: npm run test:integration

  security:
    name: Dependency audit and secret scan
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - run: npm audit --audit-level=high
      - name: Scan the whole history for secrets
        run: docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --redact --no-banner

  build:
    name: Build images
    needs: [integration, security]
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v7
      - name: Image name (lower case, as the registry requires)
        run: echo "IMAGE_REPO=ghcr.io/${GITHUB_REPOSITORY,,}" >> "$GITHUB_ENV"
      - run: docker build -t "$IMAGE_REPO:$GITHUB_SHA" .
      - run: docker build --target migrate -t "$IMAGE_REPO-migrate:$GITHUB_SHA" .
      - if: github.event_name == 'push'
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - if: github.event_name == 'push'
        run: |
          docker push "$IMAGE_REPO:$GITHUB_SHA"
          docker push "$IMAGE_REPO-migrate:$GITHUB_SHA"

  deploy-staging:
    name: Deploy to staging
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment:
      name: staging
      url: https://staging.tasks.example.com
    concurrency:
      group: deploy-staging
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v7
      - name: Deploy over SSH
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ vars.DEPLOY_KNOWN_HOSTS }}
          HOST: ${{ vars.DEPLOY_HOST }}
        run: deploy/remote.sh "$GITHUB_SHA"

  deploy-production:
    name: Deploy to production
    needs: deploy-staging
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment:
      name: production
      url: https://tasks.example.com
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v7
      - name: Deploy over SSH
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ vars.DEPLOY_KNOWN_HOSTS }}
          HOST: ${{ vars.DEPLOY_HOST }}
        run: deploy/remote.sh "$GITHUB_SHA"
```

Reading it from the top:

- **`on`**: every pull request, and every push to `main`. Pull requests run the checks; only pushes to `main` reach the deploy jobs, because of their `if`.
- **`permissions: contents: read`**: the automatic `GITHUB_TOKEN` each job gets may only read the repository. The `build` job alone adds `packages: write` to publish images. Least privilege limits what a compromised step or dependency could do.
- **`concurrency`** at the top cancels an older run of the same pull request when you push again (no point finishing it). The deploy jobs have their own groups with `cancel-in-progress: false`: deploys to one environment queue up and run one at a time, never half-cancelled.
- **`needs`** builds the order: `integration` waits for `verify`, `build` for both `integration` and `security`. Jobs without a dependency between them run in parallel.
- **`cache: npm`** in `setup-node` keeps npm's download cache between runs, keyed by `package-lock.json`. `npm ci` still installs exactly the lockfile; it just downloads less.
- **`services`** starts a PostgreSQL container next to the job, and waits for its health check. The integration job then runs the real migrations (`npm run db:deploy`) into an empty database before the tests, which also proves every migration applies cleanly in order. Its password is not a secret: the database lives for a few minutes and is reachable only by the job.
- **`fetch-depth: 0`** in the security job fetches the whole history, so gitleaks scans every commit, not just the last one.
- **Image names** in GitHub's registry must be lower case, and repository names often are not; `${GITHUB_REPOSITORY,,}` is bash for "lower-case this". Images are pushed only for pushes, so pull requests from strangers never publish anything.
- **`environment`** ties a deploy job to a GitHub environment, [next section](#environments).

The jobs form a graph. The order GitHub runs them in comes from `needs` alone:

workflow-order.ts

```ts
const jobs: Record<string, string[]> = {
  verify: [],
  integration: ["verify"],
  security: [],
  build: ["integration", "security"],
  "deploy-staging": ["build"],
  "deploy-production": ["deploy-staging"],
};

function waves(graph: Record<string, string[]>): string[][] {
  for (const [job, needs] of Object.entries(graph)) {
    for (const need of needs) if (!(need in graph)) throw new Error(`job "${job}" needs "${need}", which does not exist`);
  }
  const done = new Set<string>();
  const result: string[][] = [];
  while (done.size < Object.keys(graph).length) {
    const ready = Object.keys(graph).filter((job) => !done.has(job) && graph[job]!.every((need) => done.has(need)));
    if (ready.length === 0) throw new Error("the needs form a cycle");
    ready.forEach((job) => done.add(job));
    result.push(ready);
  }
  return result;
}

waves(jobs).forEach((wave, i) => console.log(`wave ${i + 1}: ${wave.join(" + ")}`));
try {
  waves({ ...jobs, build: ["integraton", "security"] });
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx workflow-order.ts` and of the browser terminal

```ts
wave 1: verify + security
wave 2: integration
wave 3: build
wave 4: deploy-staging
wave 5: deploy-production
job "build" needs "integraton", which does not exist
```

A typo in `needs` is exactly the kind of mistake you find only after pushing, unless you check the file first. **actionlint** checks workflow files for syntax, unknown keys, broken `needs`, wrong expression types and more. On the workflow above it prints nothing and exits with 0. On a hastily written one:

(example output)

```bash
$ actionlint
.github/workflows/deploy.yml:11:3: job "deploy" needs job "tests" which does not exist in this workflow [job-needs]
   |
11 |   deploy:
   |   ^~~~~~~
.github/workflows/deploy.yml:17:34: "github.event.head_commit.message" is potentially untrusted. avoid using it directly in inline scripts. instead, pass it through an environment variable. see https://docs.github.com/en/actions/reference/security/secure-use#good-practices-for-mitigating-script-injection-attacks for more details [expression]
   |
17 |       - run: echo "deploying ${{ github.event.head_commit.message }}"
   |                                  ^~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.github/workflows/deploy.yml:19:9: unexpected key "timeout-minute" for step to run shell command. expected one of "continue-on-error", "env", "id", "if", "name", "run", "shell", "timeout-minutes", "working-directory" [syntax-check]
   |
19 |         timeout-minute: 10
   |         ^~~~~~~~~~~~~~~
```

The second message is a security finding, not style. `${{ … }}` is pasted into the script *before* the shell runs it, so a commit message containing `"; curl …` would become part of the command: **script injection**. Pass untrusted values through `env:` and refer to them as `"$MESSAGE"`, as the deploy steps above do with their secrets. Run actionlint in your editor or as a first CI step; it is a single binary.

> PIN WHAT YOU RUN
>
> An action is someone else's code running with your job's token. `@v7` follows whatever its owner publishes as v7. For the highest assurance, pin actions to a full commit SHA (`actions/checkout@<40-character sha>`) and let a bot such as Dependabot propose updates, the same way you treat npm dependencies. The same applies to the gitleaks image, pinned here to `v8.30.1`.

## Environments and secrets

A GitHub **environment** (repository Settings → Environments) is a named deployment target with its own rules and its own secrets. The workflow names two, `staging` and `production`:

| Setting | staging | production |
| --- | --- | --- |
| Deployment branches | `main` only | `main` only |
| Required reviewers | none: deploys automatically | one person approves each deploy |
| Secret `DEPLOY_SSH_KEY` | key for the staging server | key for the production server |
| Variables `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` | staging server | production server |

Both deploy jobs use the same names, `secrets.DEPLOY_SSH_KEY` and `vars.DEPLOY_HOST`; which values they get depends on the environment the job runs in. A **secret** is encrypted and hidden in logs; a **variable** is plain configuration, visible to anyone who can read the repository. `DEPLOY_KNOWN_HOSTS` is the server's public host key, so SSH refuses to talk to anything pretending to be the server.

The production job waits after staging succeeds until a reviewer clicks "Approve". That pause is where you look at staging, your dashboards from [the performance lesson](https://zudojs.oyinlola.site/learn/zudo-performance#production), and the error rate.

What does CI *not* hold? The database password, `PAYMENTS_URL` and the JWT secrets. They are written once into a file on each server, readable only by the deploy user, and the deploy script reads them there. CI only needs to reach the server and name the release. If the CI system is ever compromised, the application's secrets are not in it.

GitHub hides each secret's exact value in logs, replacing it with `***`. It cannot hide values *derived* from a secret:

masking.ts

```ts
const secrets = ["tok_live_4f9a2c7e"];
const mask = (line: string) => secrets.reduce((text, secret) => text.split(secret).join("***"), line);

const token = secrets[0]!;
console.log(mask(`Authorization: Bearer ${token}`));
console.log(mask(`token in base64: ${btoa(token)}`));
console.log(mask(`first half: ${token.slice(0, 8)}`));
```

Output of `npx tsx masking.ts` and of the browser terminal

```ts
Authorization: Bearer ***
token in base64: dG9rX2xpdmVfNGY5YTJjN2U=
first half: tok_live
```

Masking is a last line of defence, like log redaction in the security review. Never print secrets, their encodings or their parts; never run `set -x` in a step that handles them; and do not pass them on a command line, where other processes can read them.

## Deploy: the same image, verified

The deploy jobs run a small script that copies the deployment files to the server over SSH and runs the real deploy script there:

```ts
# deploy/remote.sh (runs in CI)
#!/usr/bin/env bash
# Runs in CI: copies the deploy files to the server and runs deploy.sh there.
# Needs SSH_KEY, KNOWN_HOSTS and HOST in the environment. Usage: deploy/remote.sh <image tag>
set -euo pipefail
install -m 700 -d ~/.ssh
printf '%s\n' "$SSH_KEY" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
ssh_to_server() { ssh -i ~/.ssh/deploy_key -o BatchMode=yes "deploy@$HOST" "$@"; }
scp -i ~/.ssh/deploy_key -o BatchMode=yes deploy/compose.yaml deploy/deploy.sh "deploy@$HOST:task-api/"
ssh_to_server "cd task-api && ./deploy.sh '$1'"
```

On the server, one Compose file describes the environment. Which release runs is decided by one variable, `IMAGE_TAG`; the `migrate` service runs only when asked for:

```ts
# deploy/compose.yaml
# One environment (staging or production) on one server. IMAGE_TAG picks the release.
name: task-api
services:
  migrate:
    image: ${IMAGE_REPO:-task-api}-migrate:${IMAGE_TAG:?set IMAGE_TAG}
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}@postgres:5432/task-api
    depends_on:
      postgres:
        condition: service_healthy
    profiles: ["migrate"]

  app:
    image: ${IMAGE_REPO:-task-api}:${IMAGE_TAG:?set IMAGE_TAG}
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: "3000"
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}@postgres:5432/task-api
      PAYMENTS_URL: ${PAYMENTS_URL:-}
    ports:
      - "127.0.0.1:${APP_PORT:-3000}:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
      POSTGRES_DB: task-api
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d task-api"]
      interval: 2s
      retries: 30
    restart: unless-stopped

volumes:
  postgres-data:
```

And the deploy script. It pulls the two images for the tag, runs the migrations, replaces the app, and then checks `/health` for up to 30 seconds. If the new release never becomes healthy, it starts the previous tag again:

```ts
# deploy/deploy.sh (runs on the server)
#!/usr/bin/env bash
# Usage: deploy/deploy.sh <image tag>. Settings (IMAGE_REPO, POSTGRES_PASSWORD, PAYMENTS_URL, APP_PORT)
# come from the environment or from a .env file next to compose.yaml, readable only by the deploy user.
# Migrates, starts the release, checks /health, and rolls back to the previous tag if it fails.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
NEW_TAG="$1"
PREVIOUS_TAG="$(cat current-tag 2>/dev/null || true)"
URL="http://127.0.0.1:${APP_PORT:-3000}/health"

healthy() {
  for _ in $(seq 1 15); do
    if curl -fsS --max-time 2 "$URL" > /dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

echo "deploying $NEW_TAG (previous: ${PREVIOUS_TAG:-none})"
# Images come from the registry; SKIP_PULL=1 uses images built on this machine.
[ "${SKIP_PULL:-0}" = 1 ] || IMAGE_TAG="$NEW_TAG" docker compose --progress quiet pull migrate app
IMAGE_TAG="$NEW_TAG" docker compose --progress quiet run --rm migrate
IMAGE_TAG="$NEW_TAG" docker compose --progress quiet up -d --wait postgres
IMAGE_TAG="$NEW_TAG" docker compose --progress quiet up -d app
if healthy; then
  echo "$NEW_TAG" > current-tag
  echo "$NEW_TAG is live"
  exit 0
fi

echo "$NEW_TAG failed its health check" >&2
IMAGE_TAG="$NEW_TAG" docker compose logs app --no-log-prefix --tail 50 | grep -m 1 -E "^[A-Za-z]*Error:" >&2 || true
if [ -n "$PREVIOUS_TAG" ]; then
  echo "rolling back to $PREVIOUS_TAG" >&2
  IMAGE_TAG="$PREVIOUS_TAG" docker compose --progress quiet up -d app
  healthy && echo "$PREVIOUS_TAG is live again" >&2
fi
exit 1
```

The settings file next to it on the server, `.env` (mode 600, never in Git), holds `IMAGE_REPO`, `POSTGRES_PASSWORD`, `PAYMENTS_URL` and `APP_PORT`. `set -euo pipefail` makes bash stop at the first failing command, treat unset variables as errors, and notice failures inside pipes; without it, a failed migration would be followed by starting the app anyway.

The health check is the deploy's own test. Its logic, as a function you can test without a server:

health-wait.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createResponseContext } from "@zudojs/http";

let probes = 0;
const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async () => {
    probes += 1;
    const ready = probes >= 3; // the new release needs a moment to connect to the database
    return createResponseContext({ status: ready ? 200 : 503 }).json({ status: ready ? "ok" : "starting" });
  },
});
await server.start();

async function waitUntilHealthy(url: string, attempts: number, pauseMs: number): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const status = await fetch(url, { signal: AbortSignal.timeout(2_000) }).then((r) => r.status, () => 0);
    console.log(`attempt ${attempt}: ${status === 0 ? "no answer" : status}`);
    if (status === 200) return true;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  return false;
}

const url = `http://127.0.0.1:${server.address?.port}/health`;
console.log("healthy:", await waitUntilHealthy(url, 5, 50));
await server.stop();
console.log("after stopping, healthy:", await waitUntilHealthy(url, 2, 50));
```

Output of `npx tsx health-wait.ts`

```ts
attempt 1: 503
attempt 2: 503
attempt 3: 200
healthy: true
attempt 1: no answer
attempt 2: no answer
after stopping, healthy: false
```

Every attempt has its own timeout, so a release that accepts connections but never answers still ends in "not healthy" instead of a stuck deploy. The generated `/health` is a readiness check that includes the database ([production engineering](https://zudojs.oyinlola.site/learn/production-engineering#health)), which is exactly what a deploy should wait for.

Tags are computed in one place, from the commit, so staging and production can only differ by which tag they run:

image-tags.ts

```ts
function imageTags(repository: string, sha: string, ref: string): string[] {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`not a commit SHA: ${sha}`);
  const image = `ghcr.io/${repository.toLowerCase()}`;
  const tags = [`${image}:${sha}`];
  const version = ref.match(/^refs\/tags\/(v\d+\.\d+\.\d+)$/)?.[1];
  if (version !== undefined) tags.push(`${image}:${version}`);
  return tags;
}

const sha = "ddc4ac47e1b0a8f63c25d9e4f0b7a1c3e5d6f789";
console.log(imageTags("AcmeTasks/Task-API", sha, "refs/heads/main"));
console.log(imageTags("AcmeTasks/Task-API", sha, "refs/tags/v1.4.0"));
try {
  imageTags("AcmeTasks/Task-API", "latest", "refs/heads/main");
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx image-tags.ts` and of the browser terminal

```json
[
  'ghcr.io/acmetasks/task-api:ddc4ac47e1b0a8f63c25d9e4f0b7a1c3e5d6f789'
]
[
  'ghcr.io/acmetasks/task-api:ddc4ac47e1b0a8f63c25d9e4f0b7a1c3e5d6f789',
  'ghcr.io/acmetasks/task-api:v1.4.0'
]
not a commit SHA: latest
```

## Migrations in the pipeline

Migrations are code, versioned in Git, applied by the pipeline, never by hand ([deployment](https://zudojs.oyinlola.site/learn/deployment#migrations) and [zero-downtime migrations](https://zudojs.oyinlola.site/learn/db-operations#migrations) explain why). In this pipeline they run twice: in CI, all of them into an empty database, which proves they apply in order; and in each deploy, the new ones only, *before* the new app starts. `prisma migrate deploy` records applied migrations in a `_prisma_migrations` table, so running it again is safe.

Between the migration and the switch, the *old* app runs on the *new* schema, and after a rollback it keeps doing so. So each migration must keep the previous release working. You can test exactly that: apply the new migration, then run the previous release's queries. With PGlite:

migration-compat.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const createTasks = `CREATE TABLE tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())`;
const previousRelease = [
  `INSERT INTO tasks (id, name) VALUES ('t-1', 'Pay rent')`,
  `SELECT id, name FROM tasks WHERE id = 't-1'`,
];

async function previousReleaseStillWorks(migration: string): Promise<string> {
  const db = new PGlite();
  await db.exec(createTasks);
  await db.exec(migration);
  try {
    for (const sql of previousRelease) await db.query(sql);
    return "ok";
  } catch (error) {
    return `breaks: ${(error as Error).message}`;
  } finally {
    await db.close();
  }
}

const candidates: Record<string, string> = {
  "add a column with a default": `ALTER TABLE tasks ADD COLUMN "done" BOOLEAN NOT NULL DEFAULT false`,
  "add a required column without default": `ALTER TABLE tasks ADD COLUMN "ownerId" TEXT NOT NULL`,
  "rename name to title": `ALTER TABLE tasks RENAME COLUMN name TO title`,
  "expand: add title, keep name": `ALTER TABLE tasks ADD COLUMN title TEXT`,
};
for (const [label, sql] of Object.entries(candidates)) {
  console.log(`${label.padEnd(40)} ${await previousReleaseStillWorks(sql)}`);
}
```

Output of `npx tsx migration-compat.ts`

```ts
add a column with a default              ok
add a required column without default    breaks: null value in column "ownerId" of relation "tasks" violates not-null constraint
rename name to title                     breaks: column "name" of relation "tasks" does not exist
expand: add title, keep name             ok
```

The first and last are safe; the middle two break the running app, and make rollback impossible. A rename becomes two or three releases (**expand and contract**): add `title` and write both columns; backfill and switch reads; drop `name` only when no running or rollback-able release uses it. In a real pipeline, a job can run the previous release's integration tests against the new migrations.

One more rule: never edit a migration that has run somewhere. Prisma stores a checksum of each applied file and refuses to continue when a file changed. The idea, in a few lines:

migration-checksums.tsNode.js only

```ts
import { createHash } from "node:crypto";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const filesInGit: Record<string, string> = {
  "20260925020538_add_tasks": `CREATE TABLE "tasks" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, PRIMARY KEY ("id"));`,
  "20260925023009_add_task_done": `ALTER TABLE "tasks" ADD COLUMN "done" BOOLEAN NOT NULL DEFAULT true;`,
};
const appliedInProduction: Record<string, string> = {
  "20260925020538_add_tasks": sha256(`CREATE TABLE "tasks" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, PRIMARY KEY ("id"));`),
  "20260925023009_add_task_done": sha256(`ALTER TABLE "tasks" ADD COLUMN "done" BOOLEAN NOT NULL DEFAULT false;`),
};

for (const [name, checksum] of Object.entries(appliedInProduction)) {
  const file = filesInGit[name];
  const state = file === undefined ? "missing from Git" : sha256(file) === checksum ? "unchanged" : "EDITED after it was applied";
  console.log(`${name}: ${state}`);
}
const pending = Object.keys(filesInGit).filter((name) => !(name in appliedInProduction));
console.log("pending:", pending.length === 0 ? "none" : pending.join(", "));
```

Output of `npx tsx migration-checksums.ts`

```ts
20260925020538_add_tasks: unchanged
20260925023009_add_task_done: EDITED after it was applied
pending: none
```

Someone "fixed" the default of an applied migration from `false` to `true`. Production still has `false`, a fresh database would get `true`, and the two drift apart silently. Change behaviour with a new migration instead.

## Rollbacks

Here is the deploy script at work on a local staging environment, with three releases: `ddc4ac4`; `ad3887d`, which started reading `PAYMENTS_URL`; and `f93800b`, which also adds the `done` column. (`SKIP_PULL=1` uses the locally built images instead of pulling.)

Local staging (example output)

```bash
$ export SKIP_PULL=1
$ deploy/deploy.sh ddc4ac4
deploying ddc4ac4 (previous: none)
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "task-api", schema "public" at "postgres:5432"

1 migration found in prisma/migrations

Applying migration `20260925020538_add_tasks`

The following migration(s) have been applied:

migrations/
  └─ 20260925020538_add_tasks/
    └─ migration.sql

All migrations have been successfully applied.
ddc4ac4 is live
$ deploy/deploy.sh ad3887d
deploying ad3887d (previous: ddc4ac4)
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "task-api", schema "public" at "postgres:5432"

1 migration found in prisma/migrations


No pending migrations to apply.
ad3887d failed its health check
ConfigurationError: PAYMENTS_URL is not set.
rolling back to ddc4ac4
ddc4ac4 is live again
$ echo "PAYMENTS_URL=https://payments.example.com" >> deploy/.env
$ deploy/deploy.sh f93800b
deploying f93800b (previous: ddc4ac4)
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "task-api", schema "public" at "postgres:5432"

2 migrations found in prisma/migrations

Applying migration `20260925023009_add_task_done`

The following migration(s) have been applied:

migrations/
  └─ 20260925023009_add_task_done/
    └─ migration.sql

All migrations have been successfully applied.
f93800b is live
$ deploy/deploy.sh ddc4ac4
deploying ddc4ac4 (previous: f93800b)
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "task-api", schema "public" at "postgres:5432"

1 migration found in prisma/migrations


No pending migrations to apply.
ddc4ac4 is live
$ curl -s http://127.0.0.1:3100/health
{"status":"ok","checks":{"database":"up"},"timestamp":"2026-09-25T02:42:47.164Z"}
```

Four deploys, four lessons:

1. The first deploy applied the first migration and went live.
2. `ad3887d` needed a setting the environment did not have. It never became healthy, the script printed the reason and put `ddc4ac4` back, and the pipeline job failed, so the problem is visible. Users saw at most a few seconds of errors. (Making the Compose file require the variable, `${PAYMENTS_URL:?}`, would have stopped the deploy before anything changed.)
3. With the setting added on the server, `f93800b` applied its migration and went live. The fix for a bad release is often a **forward fix** like this, not a code change.
4. Deploying `ddc4ac4` again is a manual rollback: the same script with an older tag. The old code runs happily on the newer schema, because the migration only added a column with a default. Nothing undid the migration, and nothing had to.

That last point is the design rule for rollbacks. Code rolls back by starting an older image; the database rolls forward only. A rollback target is safe when it works with the schema that is live now:

rollback-target.ts

```ts
interface Release { readonly tag: string; readonly worksWithSchemaUpTo: number; readonly wasHealthy: boolean }

const history: Release[] = [
  { tag: "7c01e2a", worksWithSchemaUpTo: 1, wasHealthy: true },
  { tag: "ddc4ac4", worksWithSchemaUpTo: 3, wasHealthy: true },
  { tag: "ad3887d", worksWithSchemaUpTo: 3, wasHealthy: false },
  { tag: "f93800b", worksWithSchemaUpTo: 3, wasHealthy: true },
];

function rollbackTarget(current: string, liveSchema: number): string {
  const before = history.slice(0, history.findIndex((r) => r.tag === current)).reverse();
  const target = before.find((r) => r.wasHealthy && r.worksWithSchemaUpTo >= liveSchema);
  return target === undefined ? "none: fix forward" : target.tag;
}

console.log("from f93800b, schema 2:", rollbackTarget("f93800b", 2));
console.log("from f93800b, schema 3:", rollbackTarget("f93800b", 3));
console.log("from f93800b, schema 4:", rollbackTarget("f93800b", 4));
```

Output of `npx tsx rollback-target.ts` and of the browser terminal

```ts
from f93800b, schema 2: ddc4ac4
from f93800b, schema 3: ddc4ac4
from f93800b, schema 4: none: fix forward
```

`ad3887d` is skipped because it never became healthy; `7c01e2a` is too old for the live schema. When nothing fits, as after a contract migration, the way out is a fix forward, which is why contracts come last, once you are sure. Other tools that make rollbacks cheap: **feature flags** ([@zudojs/feature-flags](https://zudojs.oyinlola.site/learn/zudo-feature-flags)) turn a new behaviour off without deploying, and blue-green or canary deployments send only part of the traffic to the new release first.

## Failure cases and production concerns

- **Flaky tests** teach everyone to click "re-run". Fix or quarantine a flaky test the day it flakes; a test that sometimes fails protects nothing. Performance checks belong in budgets on counts, as in [the performance lesson](https://zudojs.oyinlola.site/learn/zudo-performance#budgets), not in milliseconds.
- **Slow pipelines** get skipped. Keep the checks before merge under about ten minutes: cache the npm download cache, run independent jobs in parallel, and keep the slowest suites for `main` or a nightly run.
- **Branch protection** (Settings → Branches) makes the checks mandatory: no merge to `main` unless `verify`, `integration` and `security` passed on the latest commit.
- **Half-finished deploys.** A runner can die mid-deploy. Every step in `deploy.sh` can run twice safely: migrations are recorded, `docker compose up` converges to the same state, and `current-tag` is written only after a healthy check.
- **Supply chain.** The pipeline runs code from npm, from actions and from images. Lockfiles, pinned versions, the audit gate and least-privilege tokens limit what one bad package can do. Publishing packages from CI adds provenance ([the npm ecosystem lesson](https://zudojs.oyinlola.site/learn/npm-ecosystem)).
- **Watch after deploying.** A health check proves the app starts, not that it works. Watch error rate and latency for a few minutes after each production deploy, and roll back on a clear regression.

## Practice

TRY IT YOURSELF

### Fix the hasty workflow

Rewrite the workflow that actionlint complained about so that it passes: fix the `needs`, the step key, and pass the commit message and the deploy key through `env` instead of pasting them into the scripts.

**Show a solution**

```ts
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npm ci && npm test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v7
      - env:
          MESSAGE: ${{ github.event.head_commit.message }}
        run: echo "deploying $MESSAGE"
      - env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
        run: ./deploy.sh
        timeout-minutes: 10
```

`deploy.sh` now reads `DEPLOY_KEY` from its environment instead of its command line, where any process on the runner could see it. actionlint prints nothing for this version. It would still be worth adding `permissions: contents: read` at the top and a `concurrency` group for the deploy job.

TRY IT YOURSELF

### Stale exceptions

Extend the audit gate idea: an exception for a package that is no longer in the report is dead weight that could hide a future problem with the same package. Write `staleExceptions(report, exceptions)` that returns the package names of exceptions that match nothing in the report.

**Show a solution**

stale-exceptions.ts

```ts
interface Exception { readonly packageName: string; readonly expires: string }

function staleExceptions(report: { vulnerabilities: Record<string, unknown> }, exceptions: Exception[]): string[] {
  return exceptions.map((e) => e.packageName).filter((name) => !(name in report.vulnerabilities));
}

const afterOverrides = { vulnerabilities: {} };
const exceptions = [
  { packageName: "mysql2", expires: "2026-10-15" },
  { packageName: "deepmerge-ts", expires: "2026-09-01" },
];
console.log(staleExceptions(afterOverrides, exceptions));
console.log(staleExceptions({ vulnerabilities: { mysql2: { severity: "high" } } }, exceptions));
```

Output of `npx tsx stale-exceptions.ts` and of the browser terminal

```json
[ 'mysql2', 'deepmerge-ts' ]
[ 'deepmerge-ts' ]
```

After the overrides, both exceptions are stale: delete them in the same pull request. Failing the gate on stale exceptions keeps the list honest.

TRY IT YOURSELF

### Plan a rename

The team wants to rename `tasks.name` to `tasks.title`. Plan the releases so that every deploy can be rolled back to the release before it, and say what each migration and each release does.

**Show a solution**

1. **Release A (expand).** Migration: add nullable `title`. Code: writes both `name` and `title`, reads `name`. Rolling back to the previous release is safe: it ignores `title`.
2. **Release B (migrate reads).** Migration: `UPDATE tasks SET title = name WHERE title IS NULL`, then make `title` `NOT NULL`. Code: reads `title`, still writes both. Rolling back to A is safe: A reads `name`, which is still written.
3. **Release C (contract).** Only after B has run for a while and you will not roll back to A: migration drops `name`; code no longer mentions it. Rolling back to B would now fail, so this is the one step where you fix forward if needed.

Run `migration-compat.ts`-style checks in CI for each step: the previous release's queries against the new schema.

## Summary

- A pipeline runs the same gates for every change on a clean machine: install, type check (tests included), lint, unit tests, integration tests with real migrations, security checks, build, deploy. Exit codes decide, and the first failure stops everything after it.
- Run every stage locally on a fresh clone first. It found a test nobody type-checked, a setting that only existed in one `.env`, and four high-severity advisories in build tools.
- Triage audit findings: fix with updates or `overrides`, accept only with a reason and an expiry date. Scan the whole history for secrets, and rotate any secret that leaked.
- In GitHub Actions: `needs` orders jobs, `permissions` stays minimal, `concurrency` keeps deploys one at a time, services give integration tests a real database, and actionlint checks the file, including script injection.
- Environments hold per-target secrets and approval rules. CI holds only what it needs to deploy; application secrets stay on the servers.
- Build images once, tagged with the commit. Deploy: migrate, start, check health, and roll back to the previous tag automatically. Migrations only expand until you are sure, so older releases keep working and rollback stays possible.

The Task API is now reviewed, measured, deployed and shipped by a pipeline. Next, in framework engineering, you look inside ZudoJS itself: [reading ZudoJS internals](https://zudojs.oyinlola.site/learn/zudo-internals).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
