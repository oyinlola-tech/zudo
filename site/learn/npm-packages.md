---
title: "npm and packages — ZudoJS Academy"
description: "Install, update and remove packages with npm, read package.json and the lockfile, use version ranges and scripts, and keep the packages you install safe."
source: https://zudojs.oyinlola.site/learn/npm-packages
---

LEVEL 4 · LESSON 6 OF 20

npm and packages Core

# npm and packages

Install, update and remove packages with npm, read package.json and the lockfile, use version ranges and scripts, and keep the packages you install safe.

- **40 min** to read and try
- **You need:** What Node.js is, Files, paths and your computer, and Cryptography with node:crypto
- **You build:** A task-tools project with a dependency, a dev tool, npm scripts and an approved install script

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Check a package with npm view, then install it as a dependency or a dev dependency
- Read package.json and explain what each field is for
- Say which versions a caret, tilde or exact range allows, and why the lockfile and npm ci make installs repeatable
- Name, list and run npm scripts, and use npx with care
- Keep installs safe with npm audit, install-script approval and careful package names

## What npm is

A **package** is a folder of code with a `package.json` file, published so other people can use it. Every ZudoJS module you will use later is a package, and so are most of the tools a JavaScript developer runs.

**npm** is two things with one name:

- the **registry** at [npmjs.com](https://www.npmjs.com), a huge public library of packages, and
- the **npm command**, installed with Node.js, which downloads packages from the registry into your project, runs your scripts and publishes your own packages.

Every example in this lesson is a real session in a terminal. Make a new project to follow along:

Terminal on your computer

```bash
$ mkdir task-tools
$ cd task-tools
$ npm init -y
Wrote to ~/task-tools/package.json:
…
$ npm pkg set type=module
```

## Installing a package

Suppose your tasks need due dates like "in 2 days". Converting that to milliseconds is fiddly, and a small, popular package called `ms` already does it.

REASON IT OUT

### Before you install: what are you really adding?

`npm install ms` takes a few seconds. Before you type it, think about what the command does to your project:

- Who wrote the code you are about to run, and how could you find out?
- A package can depend on other packages. How many strangers' code does one install really bring in?
- Where will this code run: only on your laptop, or also on your server with its secrets?
- Next month the author publishes a new version. Does your project change by itself?

**Show the reasoning**

Anyone can publish to npm, so a package is code from a stranger until you have checked it: its description, its source repository, how long it has existed and how widely it is used. `npm view` shows all of that without installing anything.

Every dependency of the package is installed too, and their dependencies, so one command can add hundreds of packages. A package with no dependencies, like `ms`, is the easy case; `npm view` shows the count.

A normal dependency runs on your server, with access to its environment variables and files. That is why the rest of this lesson ends with a section on installing safely.

Whether a new version arrives by itself depends on the version range and the lockfile, the two things this lesson explains next.

Before installing anything, look it up. `npm view` shows what the registry knows about a package:

Terminal on your computer

```bash
$ npm view ms

ms@2.1.3 | MIT | deps: none | versions: 32
Tiny millisecond conversion utility
https://github.com/vercel/ms#readme
…
dist-tags:
latest: 2.1.3
…
```

It has no dependencies of its own (`deps: none`), a clear description, a link to its source code, and an MIT licence. Now install it:

Terminal on your computer

```bash
$ npm install ms

added 1 package, and audited 2 packages in 20s

found 0 vulnerabilities
```

Three things changed in your folder:

- `node_modules/ms` now holds the package's code. Node.js looks in `node_modules` when you import a name without `./`.
- `package.json` has a new section, `"dependencies": { "ms": "^2.1.3" }`.
- A new file, `package-lock.json`, appeared. You will see why below.

Use the package like any module:

due.jsNode.js only

```ts
import ms from "ms";

console.log(ms("2 days"));
console.log(ms("1.5h"));
console.log(ms(90_000));
console.log(ms(90_000, { long: true }));
```

Terminal on your computer

```bash
$ node due.js
172800000
5400000
2m
2 minutes
```

Text in, milliseconds out, and the other way round. 90,000 ms is 1.5 minutes, which `ms` rounds to `2m`. Reading a package's README tells you about details like that before they surprise you.

> NOTE
>
> Never commit `node_modules`. It can hold thousands of files, and anyone can rebuild it from `package.json` and `package-lock.json` with one command. Put `node_modules/` in `.gitignore`, next to `.env`.

## package.json and dev dependencies

Some packages are tools you only need while writing code: a formatter, a test runner, TypeScript. Install those as **dev dependencies** with `-D` (short for `--save-dev`). A server in production installs only the normal dependencies, which keeps it smaller and gives attackers less code to aim at. Prettier formats code consistently:

Terminal on your computer

```bash
$ npm install -D prettier

added 1 package, and audited 3 packages in 5s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

"Looking for funding" just means the authors accept donations; `npm fund` lists where. After you add a few scripts in the next section, `package.json` looks like this:

package.json

```json
{
  "name": "task-tools",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "start": "node due.js",
    "format": "prettier --write .",
    "check-format": "prettier --check ."
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "dependencies": {
    "ms": "^2.1.3"
  },
  "devDependencies": {
    "prettier": "^3.9.9"
  }
}
```

- **name** and **version** identify the package. They only matter much if you publish it.
- **type**: `"module"` makes `.js` files ES modules.
- **main** (or the newer **exports**) says which file another project gets when it imports this package.
- **scripts** are named commands, run with `npm run`.
- **dependencies** are needed to run the program; **devDependencies** only to develop it.
- **license** says what others may do with the code. `ISC` and `MIT` are both short, permissive licences.

`package.json` is plain JSON, so your own code can read it too. Tools do this all the time, for example to print a version number. This program lists the dependencies of the `package.json` above:

deps.jsNode.js only

```ts
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
console.log(`${pkg.name} ${pkg.version}`);

for (const section of ["dependencies", "devDependencies"]) {
  for (const [name, range] of Object.entries(pkg[section] ?? {})) {
    console.log(`  ${section}: ${name} ${range}`);
  }
}
```

Output of `node deps.js`

```ts
task-tools 1.0.0
  dependencies: ms ^2.1.3
  devDependencies: prettier ^3.9.9
```

## npm scripts

The `scripts` section gives names to the commands your project uses, so nobody has to remember them. You can edit `package.json` by hand, or let `npm pkg` do it. These commands add the three scripts you saw above and remove the placeholder `test` script. They print nothing when they work:

Terminal on your computer

```bash
$ npm pkg set scripts.start="node due.js" scripts.format="prettier --write ." scripts.check-format="prettier --check ."
$ npm pkg delete scripts.test
```

To give the formatter something to do, save this badly formatted file as `messy.js`:

messy.js

```ts
const  x = {a:1,
  b:2}
console.log( x )
```

`npm run` on its own lists the scripts. Then run them:

Terminal on your computer

```bash
$ npm run
Lifecycle scripts included in task-tools@1.0.0:
  start
    node due.js
available via `npm run`:
  format
    prettier --write .
  check-format
    prettier --check .
$ npm start

> task-tools@1.0.0 start
> node due.js

172800000
5400000
2m
2 minutes
$ npm run check-format

> task-tools@1.0.0 check-format
> prettier --check .

Checking formatting...
[warn] messy.js
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
$ npm run format

> task-tools@1.0.0 format
> prettier --write .

due.js 94ms (unchanged)
messy.js 15ms
package-lock.json 14ms (unchanged)
package.json 3ms (unchanged)
```

- A few names are special: `npm start` and `npm test` work without `run`. Everything else needs `npm run <name>`.
- Scripts can call tools from `node_modules` (here `prettier`) directly, without `npx`.
- `check-format` failed with a non-zero exit code, which is exactly what an automated check needs. Exit codes came up in [What Node.js is](https://zudojs.oyinlola.site/learn/node-runtime#process).

After `npm run format`, `messy.js` reads `const x = { a: 1, b: 2 };` and `console.log(x);`. A common script while writing a server is `"dev": "node --watch server.js"`, which restarts the program every time you save a file. You will add one in the practice section.

## Versions and ranges

Package versions follow **semantic versioning** (semver): three numbers, `MAJOR.MINOR.PATCH`, such as `2.1.3`.

- **PATCH** goes up for bug fixes: `2.1.3` to `2.1.4`.
- **MINOR** goes up for new features that don't break existing code: `2.1.3` to `2.2.0`.
- **MAJOR** goes up when something changes in a way that can break your code: `2.1.3` to `3.0.0`.

In `package.json`, a dependency is a **range**: which versions you accept. `npx` runs a package's command without installing it into your project, so you can ask the official `semver` package which versions each range allows. The first time, npx asks before downloading:

Terminal on your computer

```bash
$ npx semver --range "^2.1.0" 2.0.0 2.1.0 2.1.3 2.9.0 3.0.0
Need to install the following packages:
semver@7.8.5
Ok to proceed? (y) y
2.1.0
2.1.3
2.9.0
$ npx semver --range "~2.1.0" 2.0.0 2.1.0 2.1.3 2.9.0 3.0.0
2.1.0
2.1.3
$ npx semver --range "2.1.0" 2.0.0 2.1.0 2.1.3 2.9.0 3.0.0
2.1.0
```

The command prints the versions from the list that fit the range:

- `^2.1.0` (caret) accepts new minor and patch versions, never a new major. This is what `npm install` writes by default.
- `~2.1.0` (tilde) accepts only new patch versions.
- `2.1.0` with no symbol is **exact**: that version and nothing else.

The caret rule is simple enough to write yourself, which is a good way to be sure you understand it. This version handles plain `MAJOR.MINOR.PATCH` numbers:

caret.js

```ts
function parse(version) {
  return version.split(".").map(Number);
}

function isNewerOrSame(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

function satisfiesCaret(version, range) {
  const v = parse(version);
  const base = parse(range.slice(1));
  return v[0] === base[0] && isNewerOrSame(v, base);
}

for (const version of ["2.0.0", "2.1.0", "2.1.3", "2.9.0", "3.0.0"]) {
  console.log(version, satisfiesCaret(version, "^2.1.0"));
}
```

Output of `node caret.js` and of the browser terminal

```ts
2.0.0 false
2.1.0 true
2.1.3 true
2.9.0 true
3.0.0 false
```

Same answers as the real `semver` package: the major number must match, and the version must be at least the one in the range. The real rules have more cases, such as versions starting with `0.`, where `^0.2.0` only accepts `0.2.x`, because before 1.0.0 every minor version may break things. That is why you use the `semver` package rather than your own function in real code. [The npm ecosystem in depth](https://zudojs.oyinlola.site/learn/npm-ecosystem#semver) covers those cases, prereleases and the other range forms.

> npx RUNS CODE FROM THE INTERNET
>
> The prompt is there for a reason: `npx some-name` downloads a package and runs it on your computer, with your permissions. Read the name carefully before you type `y`. A spelling mistake can run someone else's package.

## The lockfile

A range like `^2.1.3` could mean a different version next month. `package-lock.json` records the **exact** version npm actually installed, where it came from, and a fingerprint of its contents:

```ts
"node_modules/ms": {
  "version": "2.1.3",
  "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
  "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
  "license": "MIT"
}
```

The `integrity` value is a SHA-512 hash, the same idea as the SHA-256 checksums in [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#hashes). If the downloaded file does not match it, npm refuses to install it. So the lockfile gives everyone on the team, and your server, exactly the same code. **Commit it.**

On a server or in automated builds, install with `npm ci` ("clean install") instead of `npm install`. It deletes `node_modules`, installs exactly what the lockfile says, and refuses to run if `package.json` and the lockfile disagree, rather than quietly changing versions:

Terminal on your computer

```bash
$ npm ci

added 2 packages, and audited 3 packages in 11s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
# after someone edits package.json by hand without running npm install:
$ npm ci
npm error code EUSAGE
npm error
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.
npm error
npm error Invalid: lock file's ms@2.1.3 does not satisfy ms@1.0.0
…
```

## Updating and removing

Packages get bug fixes and security fixes, so you need to update them. To see how that works, install an older version on purpose, then ask npm what is out of date:

Terminal on your computer

```bash
$ npm install ms@2.0.0

changed 1 package, and audited 3 packages in 3s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
$ npm outdated
Package  Current  Wanted  Latest  Location         Depended by
ms         2.0.0   2.1.3   2.1.3  node_modules/ms  task-tools
$ npm update

changed 1 package, and audited 3 packages in 3s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
$ npm ls
task-tools@1.0.0 ~/task-tools
+-- ms@2.1.3
`-- prettier@3.9.9
```

- **Current** is what is installed, **Wanted** is the newest version your range allows, and **Latest** is the newest version published.
- `npm update` moves every package up to its Wanted version, and updates the lockfile. It never crosses a major version. For that, run `npm install ms@latest` deliberately, and read the package's changelog first: a major version can break your code.
- `npm ls` shows what is installed.

To remove a package, and its entry in `package.json`:

Terminal on your computer

```bash
$ npm uninstall prettier

removed 1 package, and audited 2 packages in 3s

found 0 vulnerabilities
```

## Local packages: workspaces

As a project grows, you may want to split out a piece of it as its own package, used by several parts of the project, without publishing it. npm **workspaces** do that: one root folder lists the folders that hold packages. The root `package.json`:

```json
{
  "name": "task-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"]
}
```

A package in `packages/format/package.json`, with its code in `packages/format/index.js`:

```json
{
  "name": "@tasks/format",
  "version": "1.0.0",
  "type": "module",
  "exports": "./index.js"
}
```

packages/format/index.jsNode.js only

```ts
export function formatTask(task) {
  return `${task.done ? "[x]" : "[ ]"} #${task.id} ${task.title}`;
}
```

And `main.js` at the root imports it by its package name, as if it came from the registry:

main.jsNode.js only

```ts
import { formatTask } from "@tasks/format";

console.log(formatTask({ id: 1, title: "Buy milk", done: true }));
console.log(formatTask({ id: 2, title: "Write report", done: false }));
```

Terminal on your computer

```bash
$ npm install

added 1 package, and audited 3 packages in 3s

found 0 vulnerabilities
$ npm ls
task-monorepo@ ~/task-monorepo
`-- @tasks/format@1.0.0 -> ./packages/format
$ node main.js
[x] #1 Buy milk
[ ] #2 Write report
```

`npm install` linked `node_modules/@tasks/format` to the folder (the arrow in `npm ls`), so a change in `packages/format` is seen at once. A name like `@tasks/format` is **scoped**: `@tasks` groups related packages, the same way every ZudoJS package is `@zudojs/something`. `"private": true` stops the root from ever being published by accident. [The npm ecosystem in depth](https://zudojs.oyinlola.site/learn/npm-ecosystem#local) compares workspaces with other ways to use a local package.

## Publishing a package

To share a package with the world you would create an account on npmjs.com, turn on two-factor authentication, run `npm login`, then `npm publish`. Don't publish these demo packages. The registry is public and permanent, and names are first come, first served.

What you should always do first is look at exactly which files would be uploaded. `npm pack --dry-run` shows that without sending anything. Here it runs in the `packages/format` folder from above, after adding a `README.md` and a test file, `index.test.js`:

Terminal on your computer

```bash
$ cd packages/format
$ npm pack --dry-run
npm notice
npm notice package: @tasks/format@1.0.0
npm notice Tarball Contents
npm notice 53B README.md
npm notice 104B index.js
npm notice 41B index.test.js
npm notice 99B package.json
npm notice Tarball Details
npm notice name: @tasks/format
npm notice version: 1.0.0
npm notice filename: tasks-format-1.0.0.tgz
npm notice package size: 367 B
npm notice unpacked size: 297 B
npm notice shasum: 0c826c2d753d39791fad4921e16e97067249740c
npm notice integrity: sha512-qDREbD78Tfa1W[...]6TURDl9LkVUxg==
npm notice total files: 4
npm notice
tasks-format-1.0.0.tgz
```

By default npm packs everything in the folder, including the test file nobody needs. Worse, it would also pack a `.env` file. Here is a different demo package with a `.env` in its folder and no `.gitignore`:

Terminal on your computer

```bash
$ npm pack --dry-run
…
npm notice 25B .env
npm notice 20B index.js
npm notice 69B package.json
…
```

Publishing that would hand your secrets to everyone. The safe habit is an **allow-list**: the `files` field in `package.json` names what to include, and everything else stays out:

Terminal on your computer

```bash
$ npm pkg set description="Formats a task as one line of text" license=MIT "files[]=index.js"
$ npm pack --dry-run
npm notice
npm notice package: @tasks/format@1.0.0
npm notice Tarball Contents
npm notice 53B README.md
npm notice 104B index.js
npm notice 207B package.json
…
npm notice total files: 3
```

npm always adds `package.json` and the README. A real release would also bump the version first, with `npm version patch` (or `minor` or `major`, following the semver rules above). The next lesson walks through a real publish, access, dist-tags and prereleases.

## Installing packages safely

Every package you install is code written by strangers that runs with your permissions, on your computer and on your server. Real attacks go through npm packages. These habits protect you.

### Check for known vulnerabilities: npm audit

npm compares your installed versions with a public list of known security problems. Here is an old version of `minimist`, a popular argument parser, installed on purpose:

Terminal on your computer

```bash
$ npm install minimist@1.2.5

added 1 package, and audited 3 packages in 7s

1 critical severity vulnerability

To address all issues, run:
  npm audit fix

Run `npm audit` for details.
$ npm audit
# npm audit report

minimist  1.0.0 - 1.2.5
Severity: critical
Prototype Pollution in minimist - https://github.com/advisories/GHSA-xvch-5gv4-984h
fix available via `npm audit fix`
node_modules/minimist

1 critical severity vulnerability

To address all issues, run:
  npm audit fix
$ npm audit fix

changed 1 package, and audited 3 packages in 6s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
$ npm ls
task-tools@1.0.0 ~/task-tools
+-- minimist@1.2.8
`-- ms@2.1.3
```

The report names the package, the affected versions, how serious it is and a link to the details. `npm audit fix` moved `minimist` to 1.2.8, a fixed version inside your range. Sometimes npm suggests `npm audit fix --force` instead. `--force` is allowed to jump major versions and break your code, so only use it after reading what it will change.

### Install scripts: npm 11 asks first

A package can declare an **install script**: a command that runs automatically when you install it. Some packages need one, for example to download a program built for your system. But an install script can do anything your user can do, which makes it the favourite trick of malicious packages: several real attacks, including a self-spreading worm in 2025, stole tokens and keys this way.

So npm 11 no longer runs install scripts of your dependencies unless you approve them. `esbuild`, a fast code bundler, has one:

Terminal on your computer

```bash
$ npm install -D esbuild

added 2 packages, and audited 5 packages in 12s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
$ npm install-scripts ls
1 package has install scripts not yet covered by allowScripts:
  esbuild@0.28.2 (postinstall: node install.js)

Run `npm install-scripts approve <pkg>` to allow, or `npm install-scripts deny <pkg>` to deny.
```

Look at what the script does before approving it. esbuild's `install.js` only checks that the right esbuild program for your system was downloaded, and it is a widely used, well-known package. Approve it, then run its script once with `npm rebuild`:

Terminal on your computer

```bash
$ npm install-scripts approve esbuild
Approved esbuild:
  added esbuild@0.28.2
$ npm rebuild esbuild
rebuilt dependencies successfully
```

The approval is saved in `package.json`, pinned to the version you reviewed. When esbuild releases a new version, npm asks you again:

```ts
"allowScripts": {
  "esbuild@0.28.2": true
}
```

If you don't recognise a package asking to run a script, run `npm install-scripts deny <pkg>` instead, and find out why it is in your project (`npm ls <pkg>` shows which of your dependencies pulled it in).

### Typosquatting

Attackers publish packages whose names are one small typo away from popular ones, and wait for someone to mistype. In 2017, a package called `crossenv` copied the popular `cross-env` and sent the environment variables of everyone who installed it, including their secrets, to its author. Before installing:

- Copy the exact name from the project's official documentation, not from memory.
- Run `npm view <name>` and check the description, the source repository link, the maintainers and how long the package has existed.
- Be suspicious of a brand-new package with a well-known-sounding name, or one that has an install script it does not obviously need.

### Lockfiles and signatures

Your committed `package-lock.json` plus `npm ci` means your server installs the code you tested, byte for byte, instead of whatever was published this morning. npm can also check that each package really came from the registry, and which ones carry **provenance**: a signed statement saying which source code repository and which automated build produced the package:

Terminal on your computer

```bash
$ npm audit signatures
audited 4 packages in 76s

4 packages have verified registry signatures

2 packages have verified attestations
(use --json --include-attestations to view attestation details)
```

A package with provenance can be traced back to its source. When you publish your own packages from GitHub Actions, add `--provenance` to `npm publish` so your users get the same guarantee.

## Practice

TRY IT YOURSELF

### Read a version range

Your `package.json` says `"ms": "~2.0.1"`. Which of `2.0.0`, `2.0.1`, `2.0.9`, `2.1.0` and `3.0.0` could npm install? Work it out, then check with `npx semver`.

**Show a solution**

Terminal on your computer

```bash
$ npx semver --range "~2.0.1" 2.0.0 2.0.1 2.0.9 2.1.0 3.0.0
2.0.1
2.0.9
```

A tilde range allows newer patch versions only, starting at the version given.

TRY IT YOURSELF

### A dev script with --watch

Add a script called `dev` that runs `due.js` with `node --watch`. Run it, change a line in `due.js`, save, and watch it restart. Press Ctrl + C to stop it.

**Show a solution**

Terminal on your computer

```bash
$ npm pkg set scripts.dev="node --watch due.js"
$ npm run dev

> task-tools@1.0.0 dev
> node --watch due.js

172800000
5400000
2m
2 minutes
Completed running 'due.js'. Waiting for file changes before restarting...
```

`--watch` is built into Node.js, so no extra package is needed. You will use the same idea for a server, where it restarts after every save.

TRY IT YOURSELF

### Which files would you publish?

In the `packages/format` folder, add a `notes.txt` file. Run `npm pack --dry-run` and check whether it would be published. Explain the result.

**Show a solution**

Terminal on your computer

```bash
$ echo "private notes" > notes.txt
$ npm pack --dry-run
npm notice
npm notice package: @tasks/format@1.0.0
npm notice Tarball Contents
npm notice 53B README.md
npm notice 104B index.js
npm notice 207B package.json
…
npm notice total files: 3
```

`notes.txt` is not in the list, because the `files` field only allows `index.js`. With an allow-list, new files stay private until you add them on purpose.

## Recap

- npm is the public registry and the command that installs from it. Check a package with `npm view` before you install it.
- `dependencies` are needed at run time; `devDependencies` (`-D`) only while developing.
- Versions are `MAJOR.MINOR.PATCH`. `^` accepts new minor versions, `~` only patches, and no symbol means exact. The lockfile records the exact versions; commit it and use `npm ci` on servers.
- `npm outdated`, `npm update` and `npm uninstall` keep packages current. `npm run` lists and runs scripts; `npx` runs a package's command.
- Workspaces link local packages. Before publishing, check `npm pack --dry-run` and use a `files` allow-list.
- Run `npm audit`, review install scripts before `npm install-scripts approve`, type package names carefully, and check `npm audit signatures`.

Next: [The npm ecosystem in depth](https://zudojs.oyinlola.site/learn/npm-ecosystem), where you read the dependency tree and the lockfile in detail, fix peer dependency conflicts, publish a package properly and defend against supply-chain attacks.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
