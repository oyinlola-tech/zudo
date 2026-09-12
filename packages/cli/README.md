# zudojs-cli

Command-line interface for scaffolding, generating, and managing Zudojs framework projects.

## Installation

### First time

```bash
npm install -g zudojs-cli
```

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
# Create a new backend project
zudojs create my-api

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

## Commands

| Command    | Description                                                              |
| ---------- | ------------------------------------------------------------------------ |
| `create`   | Scaffold a new project (backend, frontend, or fullstack)                 |
| `generate` | Generate files (service, module, command, query, controller, repository) |
| `add`      | Add feature packages (database, queue, messaging, etc.); `--service` targets one microservice app |
| `dev`      | Start development servers through the project's package manager (`pnpm run dev`, …) |
| `build`    | Build the project with its detected package manager                      |
| `doctor`   | Run project diagnostics                                                  |
| `info`     | Show project information                                                 |

## Supported Frameworks

- **Backend:** Node.js (Zudojs runtime)
- **Frontend:** React, Next.js, Vue, Nuxt, Angular, Svelte, SvelteKit, Astro, Vanilla, Flutter, React Native
- **Architectures:** Monolith, Modular Monolith, Microservice

## Documentation

See the [Zudojs README](https://github.com/oyinlola-tech/zudo) for full documentation.
