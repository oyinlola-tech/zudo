---
title: "Create the Task API project"
description: "Install the ZudoJS command-line tool, create the Task API project, start its server, and find your way around every file it generated."
source: https://zudojs.oyinlola.site/learn/zudo-create-project
---

LESSON 10 OF 10

Meet ZudoJS

# Create the Task API project

Install the ZudoJS command-line tool, create the Task API project, start its server, and find your way around every file it generated.

- **30 min** to read and try
- **You need:** Node.js 24 and a working internet connection
- **You build:** A running ZudoJS server that answers GET /health

## Install the ZudoJS command-line tool

So far you have installed single ZudoJS packages by hand. A real project needs a dozen of them, a server, a folder layout and scripts. The **ZudoJS CLI** (command-line interface) sets all of that up with one command.

It is published on npm as `zudojs-cli`, and the command it gives you is called `zudojs`. The `-g` flag installs it **globally**, so the command works in any folder:

Terminal on your computer

```bash
$ npm install -g zudojs-cli
added 12 packages in 3m
$ zudojs --version
2.0.1
```

The install time depends on your connection. Your version can be higher than 2.0.1.

> IF THE INSTALL FAILS WITH EACCES
>
> On macOS and Linux, a global install can fail with a permission error, depending on how Node.js was installed. Don't fix it with `sudo`. Skip the global install and put `npx` in front instead: `npx zudojs-cli --version` prints the same version, and `npx zudojs-cli create …` works for every command in this lesson.

> NOTE
>
> There is no npm package called `zudo` or `zudojs`. The CLI is `zudojs-cli`, and every framework package is named `@zudojs/something`.

## Create the project

Go to the folder where you keep your projects, **not** inside `ts-tasks`, and run:

Terminal on your computer

```bash
$ zudojs create task-api --package-manager npm --capabilities ""
◇  Project structure created
◇  Backend project generated (33 files)

added 71 packages, and audited 72 packages in 2m

16 packages are looking for funding
  run `npm fund` for details

2 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
│
◆  Dependencies installed
◇  Project validated
◇  Git repository initialized
│
◇  Next steps ──╮
│               │
│  cd task-api  │
│  npm run dev  │
│               │
├───────────────╯
│
└  Project created successfully.
```

What the options mean:

- `task-api` is the name of the project and of the folder it creates.
- `--package-manager npm` uses npm, which you already have. The CLI's default is `pnpm`, a faster alternative you would have to install first.
- `--capabilities ""` starts with no optional extras. You will add them one at a time as the course needs them, with `zudojs add`.

> ON WINDOWS POWERSHELL
>
> Windows PowerShell 5 does not pass an empty `""` on to programs. Leave `--capabilities ""` out. When the CLI asks which capabilities to add, press Enter without selecting any.

If you leave the options out and just run `zudojs create task-api`, the CLI asks you each question in turn, with arrow keys to choose. The flags simply answer them in advance.

Two things in that output are worth understanding, and neither is a problem:

- **The esbuild warning** is the same one you met in lesson 6. It is harmless.
- **"2 moderate severity vulnerabilities"** comes from `npm audit`, which checks installed packages against a list of known security issues. Run `npm audit` and you will see both are in Vitest, the test runner, which only runs on your own computer while you develop. Do not run `npm audit fix --force`: as the message says, it makes breaking changes, and here it would jump Vitest two major versions.

## Start the server

Terminal on your computer

```bash
$ cd task-api
$ npm run dev

> task-api@0.1.0 dev
> tsx watch src/server.ts

{
  timestamp: '2026-09-23T12:22:33.727Z',
  level: 'info',
  message: '2026-09-23T12:22:33.727Z [INFO] [app-service] app service initialized',
  logger: 'app-service',
  metadata: {}
}
…
Listening on port 3000
```

`npm run dev` runs the `dev` script from `package.json`: `tsx watch src/server.ts`. That is `tsx` from lesson 6, plus `watch`, which restarts the server every time you save a file.

The blocks before the last line are **log entries**, one per step as the application starts. Each has a time, a level (`info`) and which part of the app wrote it. The last line means it is ready: a backend is now listening on your computer, on **port** 3000. A port is a numbered door on your computer. Each program that listens for network requests uses a different one.

Leave it running. Open your web browser and go to [http://localhost:3000/health](http://localhost:3000/health). `localhost` means "this computer". You will see:

```json
{"status":"ok","timestamp":"2026-09-23T12:22:38.526Z"}
```

You can do the same from a second terminal window. `curl` sends a request and prints the answer. `-i` also prints the status line and headers:

Terminal on your computer

```bash
$ curl -i http://localhost:3000/health
HTTP/1.1 200 OK
content-type: application/json
content-length: 54
Date: Wed, 23 Sep 2026 12:22:38 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"status":"ok","timestamp":"2026-09-23T12:22:38.526Z"}
$ curl -i http://localhost:3000/tasks
HTTP/1.1 404 Not Found
content-type: application/json
content-length: 21
Date: Wed, 23 Sep 2026 12:22:40 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"error":"Not Found"}
```

This is the pattern from lesson 9, now real: a **status code** (200, 404) and a JSON **body**. `/tasks` does not exist yet, so the server answers 404. Building it is the next part of the course.

> TIP
>
> On Windows PowerShell, type `curl.exe` instead of `curl`. Plain `curl` there is a different command with different output.

The times and dates you see will be your own.

To stop the server, click into its terminal and press Ctrl + C.

## What the CLI generated

Open the `task-api` folder in your editor. These are the files that matter today:

| Path | What it is |
| --- | --- |
| `package.json` | The project's name, its 12 `@zudojs` dependencies, and its scripts: `dev`, `build`, `start`, `typecheck`, `test`. |
| `tsconfig.json` | TypeScript settings, like the one you wrote in lesson 6, with `strict` on. |
| `src/server.ts` | Starts the application, then the HTTP server. Right now it only knows `/health`; every other path gets 404. |
| `src/app.ts` | Builds the **runtime**: the part of ZudoJS that starts and stops every piece of your app in the right order. It wires in a logger, a dependency container and an event bus. Later lessons explain each one. |
| `src/modules/app.module.ts` | The first **module**, a self-contained piece of the app that the runtime starts and stops. Those were the "app module initialized" log entries. |
| `src/controllers/health.controller.ts` | The code that answers `/health`. A **controller** turns a request into a response. |
| `src/services/`, `src/repositories/`, `src/validators/`, … | Folders for each kind of code, most of them empty for now. Your `TaskService` from lesson 9 will go in `services/`, and its schema in `validators/`. |
| `tests/app.test.ts` | One placeholder test, so `npm test` works from day one. |
| `.env.example` | The settings the app reads from the environment, such as `PORT`. Never put real passwords in files you share. |
| `.zudojs/manifest.json` | What the CLI knows about the project, so later commands like `zudojs generate` put files in the right place. Don't edit it by hand. |

Here is the health controller. It is an ordinary class, like the ones you wrote in lesson 8:

health.controller.tsNode.js only

```ts
export class HealthController {
  check() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
```

And here is the part of `src/server.ts` that decides which code answers which request. It is shortened; open the file to see all of it:

server.ts (part)Node.js only

```ts
const server = createHttpServer({
  adapter: createNodeHttpAdapter({
    host: process.env["HOST"] ?? "0.0.0.0",
    port: resolvePort(),
  }),
  handler: (request: HttpRequestContext) => {
    if (request.path === "/health") {
      if (runtime.state !== "running") {
        return createResponseContext({ status: 503 }).json({ status: "unavailable" });
      }
      return new HealthController().check();
    }
    return createResponseContext({ status: 404 }).json({ error: "Not Found" });
  },
});
```

Every request reaches `handler`. If the path is `/health` and the app is running, the controller answers. Otherwise the server sends a 404 with a JSON body. The next part of the course replaces that `if` with a proper **router** that serves `/tasks`.

## Check the project

The project comes with the same check-then-run habits you learned in lesson 6, as npm scripts:

Terminal on your computer

```bash
$ npm run typecheck

> task-api@0.1.0 typecheck
> tsc --noEmit

$ npm test

> task-api@0.1.0 test
> vitest run


 RUN  v3.2.7 /home/you/projects/task-api

 ✓ tests/app.test.ts (1 test) 10ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  13:20:14
   Duration  738ms (transform 116ms, setup 0ms, collect 109ms, tests 10ms, environment 1ms, prepare 163ms)

$ zudojs doctor
Zudojs Doctor - Project Diagnostics

✔ Node.js version: Node.js v24.19.0 (meets minimum v24)
✔ Git: git version 2.53.0
✔ Package manager (npm): 11.19.0
✔ Zudojs project: backend (monolith) from .zudojs/manifest.json
✔ Package manager: npm (lock file present)
✔ Dependencies installed: node_modules present
✔ TypeScript configuration: tsconfig.json found in every app
✔ Zudojs dependencies: 12 Zudojs package(s) declared
✔ Features: Every declared feature has its package

All checks passed!
```

- `npm run typecheck` is `tsc --noEmit`. No output means no type errors.
- `npm test` runs the tests with Vitest. You will write real tests later in the course.
- `zudojs doctor` checks your whole setup: Node.js version, dependencies, configuration. Run it first whenever something seems wrong.

## Practice

TRY IT YOURSELF

### Change the health response

With `npm run dev` running, open `src/controllers/health.controller.ts` and add a `service: "task-api"` property to the object it returns. Save the file. Watch the terminal restart the server, then reload [http://localhost:3000/health](http://localhost:3000/health).

**Show a solution**

health.controller.tsNode.js only

```ts
export class HealthController {
  check() {
    return { status: "ok", service: "task-api", timestamp: new Date().toISOString() };
  }
}
```

The browser now shows `{"status":"ok","service":"task-api","timestamp":"…"}`. You changed a running backend without restarting it by hand, because `tsx watch` did it for you.

## Recap

- `npm install -g zudojs-cli` gives you the `zudojs` command. `npx zudojs-cli` works without a global install.
- `zudojs create task-api --package-manager npm` creates a project with a server, a runtime and scripts, installs its packages and sets up git.
- `npm run dev` starts the server and restarts it when you save. `/health` answers 200; everything else is 404 for now.
- `npm run typecheck`, `npm test` and `zudojs doctor` keep the project healthy.

You have a running ZudoJS backend. Next, you will give it real routes: `GET /tasks`, `POST /tasks` and friends, using the `TaskService` and schema you wrote in lesson 9.
