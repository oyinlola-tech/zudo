# zudojs-cli

Command-line interface for scaffolding, generating, and managing Zudojs framework projects.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-cli](https://zudojs.oyinlola.site/docs/packages-cli) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-cli.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

### First time

```bash
npm install -g zudojs      # or: npm install -g zudojs-cli
```

Both packages install the same CLI under two names, `zudojs` and the short
alias `zudo`; use whichever you prefer. `zudojs` is a thin wrapper that runs
`zudojs-cli`, so the two can never disagree. Help, usage lines and error
messages repeat the name you typed (`zudo create …` or `zudojs create …`).

### Upgrading from an old version?

If `zudojs -v` doesn't match the latest npm version, clear the cache:

```bash
npm cache clean --force
npm install -g zudojs-cli@latest
```

### Getting permission errors?

Don't use `sudo`. Set up a user-local npm prefix instead:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g zudojs-cli@latest
```

## Quick Start

```bash
# Create a new backend project (`new` is an alias of `create`)
zudo new my-api

# Create a frontend project
zudojs create my-web --type frontend --frontend react

# Create a fullstack project
zudojs create my-system --type fullstack --frontend next --architecture monolith

# Start development servers
zudojs dev

# Generate a module
zudojs generate module users

# Add a feature
zudojs add database

# Build the project
zudojs build
```

`zudojs build` and `zudojs doctor` exit with a non-zero status when they fail,
so they can be used as CI gates.

### Interactive menu

Run `zudo` (or `zudojs`) with no arguments in a terminal to get a numbered
menu:

```text
◆  What would you like to do?
│  ● 1. Create a new project
│  ○ 2. Start dev server
│  ○ 3. Generate code
│  ○ 4. Add a feature
│  ○ 5. Build
│  ○ 6. Doctor
│  ○ 7. Info
│  ○ 8. Help
│  ○ 0. Exit
└  ↑/↓ move · 0-8 pick · Enter select · Esc exit
```

Press a digit to pick an entry at once, or move with ↑/↓ and press Enter.
The entry runs the ordinary command and asks for anything it needs:
"Create" runs the usual `create` prompts, "Generate code" asks for the
schematic and name, and "Add a feature" asks which feature. "Start dev
server", "Generate code", "Add a feature" and "Build" need a Zudojs project;
outside one, the menu says so and shows itself again. `0` exits with status 0;
Esc or Ctrl+C prints "Operation cancelled." and exits with status 130, like
every other prompt.

The menu only opens when both stdin and stdout are terminals and `CI` is not
set. Piped, redirected and CI runs (`zudo | cat`) print the help text and exit
0, and `--help` / `--version` never open it.

### Exit codes and usage errors

| Status | Meaning |
| ------ | ------- |
| `0`    | Success (also `--help`, `--version`, and "Exit" from the menu) |
| `1`    | The command ran and failed (build error, not in a project, …) |
| `2`    | Usage error: missing argument, unknown or malformed option, option before the command |
| `3`    | Unknown command (with a "Did you mean …?" suggestion when one is close) |
| `130`  | Cancelled with Ctrl+C or Esc |

Options go after the command name (`zudo dev --port 4000`); an option placed
before it is reported instead of being dropped. Only the first word can be the
command, so a typo such as `zudo creat my-api` is an error rather than a
different command.

### Update check

`zudojs info` asks npm whether a newer `zudojs-cli` exists and prints the
version if so. Set `ZUDOJS_NO_UPDATE_CHECK=1` to turn it off; it is skipped
automatically when `CI` is set or npm is offline. Nothing runs at install
time.

### What a new project contains

`zudojs create` records the project's type, architecture, package manager and
capabilities in `.zudojs/manifest.json` (machine-managed) and in the `zudojs`
block of `package.json`. Every follow-up command reads those; no
`zudojs.config.ts` is written. Framework packages are added as `^1.0.0`
ranges, and projects created for pnpm carry a `pnpm-workspace.yaml` that
allows esbuild's build script, which pnpm 10+ would otherwise refuse to run.

- **A running server.** `src/server.ts` starts the runtime and serves HTTP
  with `@zudojs/http` on `PORT` (default 3000; each microservice app on its
  own port), answering `GET /health`. SIGINT/SIGTERM stop the HTTP server,
  then the runtime.
- **Databases:** `--database postgresql|mysql|sqlite` sets `DATABASE_URL` in
  `.env.example` and the database container. `mongodb` is not supported.
- **Language:** backend code is TypeScript. `--language javascript` is
  rejected for `--type backend`; in a fullstack project it applies to the
  frontend only.
- **Fullstack + microservice:** the gateway and services are written at
  `apps/gateway` and `apps/services/<name>`, next to `apps/web`, and are part
  of the root workspace.
- **Capabilities:** `--capabilities cqrs,events,messaging,queue,observability,openapi,database,security`
  picks what the project is wired with. The interactive prompt starts from
  the same list, so both ways of running `create` can produce the same
  project. Without the flag, a non-interactive run enables `cqrs`,
  `messaging`, `observability`, `openapi` and `database`.
- **Failed installs fail the command.** If dependency installation fails,
  `create` keeps the generated project, prints the command to retry with and
  exits non-zero, so CI cannot go green with no `node_modules`.
- **Ctrl-C** during `create` removes the half-written project and exits with
  status 130.

### Generating code

`zudojs generate module <name>` writes a runtime module (a `BaseModule`
subclass), exports it from the modules barrel and registers it in `app.ts`.
`zudojs generate` refuses to overwrite a file that already exists and would
change, and lists those files; pass `--force` to overwrite them. Barrels are
only appended to. `--dry-run` lists the files without writing anything.

It can be run from any directory inside the project: the project root is
found by walking up, and everything is generated relative to that root.
Outside a Zudojs project the command fails instead of writing files into the
current directory.

**Schematics:** `service`, `module`, `command`, `query`, `controller`,
`repository`, `middleware`, `event`, `job`, `route`, `model`, `dto`,
`validator`.

**Options:**

| Option            | Applies to                    | Description                                                        |
| ----------------- | ----------------------------- | ------------------------------------------------------------------ |
| `--module <name>` | every schematic but `module`  | Generates inside `<root>/modules/<name>` instead of the schematic's default directory |
| `--service <name>`| microservice projects          | Selects the microservice app a schematic (including `command`/`query`) is written into |
| `--dry-run`       | all                           | Lists the files without writing anything                           |
| `--force`         | all                           | Overwrites files that already exist                                |

Where a schematic lands depends on the architecture: a `monolith` puts
services in `src/services` and modules in `src/modules`; a
`modular-monolith` has modules only, so `generate service` there generates a
module and registers it in `app.ts`; in a `microservice` project a schematic
goes to the gateway app, or to `apps/services/<name>` with `--service <name>`.

`generate service` is **refused** in a microservice project. A service there is
a whole workspace app — its own `package.json`, `tsconfig.json`, `Dockerfile`
and port — which the schematic does not produce; it used to write a bare class
into a directory pnpm skipped and no build compiled. Create services with
`zudojs create <project> --architecture microservice --services <names>`, and
add domain logic to an existing app with
`zudojs generate module <name> --service <existing-service>`.

## Commands

| Command    | Description                                                              |
| ---------- | ------------------------------------------------------------------------ |
| `create` (`new`) | Scaffold a new project (backend, frontend, or fullstack)           |
| `generate` (`g`) | Generate files — see the schematics below                                |
| `add`      | Add feature packages (database, queue, messaging, etc.); `--service` targets one microservice app |
| `dev` (`d`) | Start development servers through the project's package manager (`pnpm run dev`, …) |
| `build` (`b`) | Build the project with its detected package manager                      |
| `doctor`   | Run project diagnostics                                                  |
| `info`     | Show project information                                                 |

## Supported Frameworks

- **Backend:** Node.js (Zudojs runtime)
- **Frontend:** React, Next.js, Vue, Nuxt, Angular, Svelte, SvelteKit, Astro, Vanilla, Flutter, React Native
- **Architectures:** Monolith, Modular Monolith, Microservice

## Documentation

See the [Zudojs README](https://github.com/oyinlola-tech/zudo) for full documentation.
