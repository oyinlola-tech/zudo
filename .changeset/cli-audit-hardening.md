---
"zudojs-cli": major
---

A full audit of the CLI: 55 findings, all fixed, each with a regression test that fails against
the unfixed code.

**Read this before upgrading.** Several commands now refuse where they previously proceeded. In
every case the old behaviour was a bug, but a script or CI job written against it will notice.

### Breaking

- **A failed dependency install now exits non-zero.** `zudojs create` used to downgrade an install
  failure to a warning and then print "Project created successfully" and exit 0, so a CI job went
  green with no `node_modules`. The project is still kept and the retry hint is still printed; only
  the exit code and the closing message changed. `zudojs add` already behaved this way — the two
  commands no longer disagree.
- **`zudojs build` refuses outside a Zudojs project.** `findProjectRoot` accepted any ancestor
  holding a bare `package.json`, so from an unrelated subdirectory the CLI climbed out and executed
  that project's `scripts.build` — content from a file on disk — then reported success. It now
  requires a real Zudojs project and throws `CLINotInProjectError` otherwise.
- **`zudojs generate` outside a project throws** instead of warning and writing files into the
  current directory, matching `dev`, `build` and `add`. It also walks up to the project root, so
  running it from a subdirectory no longer creates a second `src/` tree.
- **Cancelling a prompt exits 130**, not 0. `zudojs create my-api && cd my-api` no longer runs the
  `cd` after you pressed Ctrl-C. Ctrl-C mid-scaffold is now honoured at all — `@clack/prompts`
  registers a SIGINT listener per spinner that only prints "Canceled", which suppressed Node's
  default termination, so the run used to continue to completion; it now rolls back and exits 130.
- **`CLI_ENVIRONMENT` no longer carries `NODE_ENV` or `DEBUG: "DEBUG"`.** Nothing read either, and
  honouring a bare `DEBUG` would have changed behaviour. It now names the four variables the CLI
  really reads: `ZUDOJS_DEBUG`, `CI`, `NO_UPDATE_CHECK`, `NPM_OFFLINE`.
- **`RollbackManager.rollback()` returns a `RollbackResult`** instead of `void`, and
  `CapabilityResolutionResult.conflicts` is gone — it was structurally incapable of being non-empty.
- A project name must now start with a letter or digit. `zudojs create -- --weird` used to create a
  directory `cd` could not enter and `rm -rf` could not remove.
- A schematic name may no longer start with a digit. `zudojs generate module 2fa` used to write
  `import { 2faModule } …` into your existing `src/app.ts` — a syntax error in the entry point — and
  exit 0.
- The printed app name is now `zudojs` rather than `Zudojs`, so usage lines show the command you type.

### New projects no longer arrive with services nobody asked for

`zudojs create` invented example domains when no service list was given — four for a microservice
project (`identity`, `enrollment`, `assessment`, `notification`) and three for a modular monolith.
A modular monolith was never even asked. An empty list now means no services: a microservice project
gets its gateway, a modular monolith gets an empty module barrel, and both READMEs say how to add
one. Named services are generated exactly as named.

### `generate service` now works in every architecture

It was broken in all three. In a monolith it wrote to `src/<name>/` while the template's services
live in `src/services/`; it now nests under the template's directory. In a modular monolith it
logged `Mapping "service" → "module"` and then did not, producing four inert files the runtime never
loaded; the mapping is now real and the module is registered in `app.ts`. In a microservice project
it created an app directory with no `package.json`, so pnpm skipped it and `pnpm -r run build` never
compiled it; it now refuses and names the two commands that do work.

### Fixes worth calling out

- **Generated projects pinned `latest`.** The frontend install path resolved every dependency to a
  pinned range and then passed only the names to the package manager, so two `zudojs create
  --frontend react` runs a month apart produced different majors. The resolved range is now
  installed, and the resolver's "no version range known" warnings are no longer discarded.
- **Ticking "Security" did nothing.** The capabilities prompt offered eight options and the command
  read six; `events` and `security` were silently dropped — no dependency, no manifest entry, no
  message. Both are now consumed. A new `--capabilities <list>` flag makes the interactive and
  non-interactive branches produce the same project.
- **Writes could escape the project through a symlink.** Path containment was checked on the literal
  string only, so a symlinked subdirectory sent generated files to the symlink's target. Containment
  is now re-checked after resolving the real path.
- **`zudojs doctor`'s feature check could never fail** — the templates hardcoded
  `zudojs.features: []`. They now record the real capability list and install the packages backing
  it. The modular-monolith template ignored the `enable*` flags entirely, so `--database` installed
  nothing.
- **`pnpm run test` failed in a brand-new project.** The sample spec was `tests/index.ts`, which
  matches no vitest include pattern, so the first thing you ran exited 1. It is now `tests/app.test.ts`.
- **The manifest is now durable.** It is written atomically, serialized by a lock so concurrent
  `zudojs add` runs cannot lose an update, validated on read, and a corrupt manifest is reported
  distinctly from a missing one. `add` reads and validates it before touching any `package.json`,
  so a failure can no longer leave the project half-updated.
- **A framework scaffolder is no longer killed at 120 s** and silently replaced by the built-in
  fallback template; it gets 15 minutes, the failure says whether it timed out, and the child's real
  stderr is shown.
- Per-command help works: `zudojs create --help` prints usage, arguments, options, shorts and
  defaults, instead of rejecting `--help` as an invalid option.
- A flag-shaped token is no longer swallowed as an option value, so `--type --frontend react` names
  the right problem. Surplus positionals are reported by every command. All four registries throw on
  a duplicate registration rather than silently replacing the earlier entry.

### Not verified on Windows

The `cmd.exe` quoting hardening (arguments containing `"`, `%` or `!` are now rejected rather than
escaped, because a backslash is not a cmd escape) and `NoDefaultCurrentDirectoryInExePath` were
tested as pure functions on Linux by passing `"win32"` explicitly. They have not been exercised on a
real Windows host.
