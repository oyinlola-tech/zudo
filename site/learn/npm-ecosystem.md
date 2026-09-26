---
title: "The npm ecosystem in depth — ZudoJS Academy"
description: "Go beyond npm install: exact semver rules, the dependency tree and lockfile, peer dependencies, lifecycle scripts, publishing and supply-chain defence."
source: https://zudojs.oyinlola.site/learn/npm-ecosystem
---

LEVEL 4 · LESSON 7 OF 21

npm and packages Core

# The npm ecosystem in depth

Go beyond npm install: exact semver rules, the dependency tree and lockfile, peer dependencies, lifecycle scripts, publishing and supply-chain defence.

- **50 min** to read and try
- **You need:** npm and packages
- **You build:** A shop monorepo with a linked invoice-kit package, a reproducible install, and small tools that read a lockfile, compare versions and flag typosquats

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Predict exactly which versions a range allows, including 0.x versions and prereleases
- Read a lockfile and explain why a package is installed, duplicated or overridden
- Diagnose and fix a peer dependency conflict without --force
- Use lifecycle scripts, script arguments and npm environment variables
- Test a package as a tarball, publish it with the right access and dist-tag, and version prereleases
- Assess npm audit output honestly and defend against typosquatting and dependency confusion

## "It worked yesterday"

Monday morning, the shop's automated build fails. Nobody changed any code since Friday. The error comes from deep inside a package nobody on the team has heard of. How can code that nobody touched break?

Because your project is not only your code. You met npm in [npm and packages](https://zudojs.oyinlola.site/learn/npm-packages): install, ranges, the lockfile, scripts, workspaces and the basic safety habits. This lesson looks at what happens underneath, because that is where "it worked yesterday" problems come from. Start by installing one popular web framework into an empty project:

Terminal on your computer

```bash
$ mkdir shop-api
$ cd shop-api
$ npm init -y
Wrote to ~/shop-api/package.json:
…
$ npm install express

added 68 packages, and audited 69 packages in 9s

28 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

One command, 68 packages. You chose one; its authors chose the rest, and their authors chose more. Each of those 68 has its own version range, maintainers, release schedule and security history. Every one can change your build.

REASON IT OUT

### The build that broke overnight

Before reading on, list every way the build could have changed between Friday and Monday without anyone editing code. Think about:

- What does the build machine run: `npm install` or `npm ci`? Is `package-lock.json` committed?
- What does a range like `^4.4.0` allow, and who decides when a new version inside it appears?
- What else comes from outside your repository: the Node.js version, the registry itself?

**Show the reasoning**

- If the lockfile is not committed, or the build runs `npm install`, every build resolves ranges again. Any of the 68 packages may have published a new version inside its range over the weekend. Semver says a minor or patch release should not break you, but it is a promise made by people, and people make mistakes. So the first fix is: commit the lockfile, build with `npm ci`.
- A new version may be *malicious*, not just buggy: a stolen maintainer account publishing a patch release is a real, repeated attack. The lockfile protects you from this too, until you update.
- The build machine's Node.js version may have changed (a floating "latest" image). The `engines` field and a pinned version in the build configuration prevent that.
- The registry may be down or slow, or a package may have been removed. Builds that cache dependencies survive that.

Each point is a section of this lesson: versions, the lockfile, the tree, and the supply chain.

## Semantic versioning, precisely

You know the basics: `MAJOR.MINOR.PATCH`, `^` accepts new minor versions and `~` only new patches. The full rules have three more parts that matter in real projects.

### Prerelease versions

A version can carry a **prerelease** label after a hyphen: `2.0.0-beta.3`, `1.4.0-rc.1`. It means "not final yet". The label is split at the dots, and the parts are compared one by one: numbers as numbers, text alphabetically, and a version *with* a label comes before the same version without one. The official `semver` command sorts versions when you give it no range:

Terminal on your computer

```bash
$ npx semver 1.0.0 1.0.0-beta.10 1.0.0-beta.2 1.0.0-alpha 1.0.0-rc.1 0.9.9 1.0.0-alpha.1
0.9.9
1.0.0-alpha
1.0.0-alpha.1
1.0.0-beta.2
1.0.0-beta.10
1.0.0-rc.1
1.0.0
```

Two details trip people up: `beta.2` comes before `beta.10` (numbers compare as numbers, not as text), and `alpha` comes before `alpha.1` (fewer parts comes first when all shared parts are equal). Here is the same comparison written out, so you can see every rule. A plus sign starts **build metadata** (`1.0.0+build.42`), which is ignored when comparing:

semver-compare.js

```ts
function parse(version) {
  const [core, pre] = version.split("+")[0].split(/-(.*)/s);
  const [major, minor, patch] = core.split(".").map(Number);
  return { major, minor, patch, pre: pre ? pre.split(".") : [] };
}

function compareIdentifiers(a, b) {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compare(x, y) {
  const a = parse(x);
  const b = parse(y);
  for (const part of ["major", "minor", "patch"]) {
    if (a[part] !== b[part]) return a[part] - b[part];
  }
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const order = compareIdentifiers(a.pre[i], b.pre[i]);
    if (order !== 0) return order;
  }
  return a.pre.length - b.pre.length;
}

const published = ["1.0.0", "1.0.0-beta.10", "1.0.0-beta.2", "1.0.0-alpha", "1.0.0-rc.1", "0.9.9", "1.0.0-alpha.1"];
console.log(published.toSorted(compare).join("  "));
console.log(compare("1.0.0+build.42", "1.0.0"));
```

Output of `node semver-compare.js` and of the browser terminal

```ts
0.9.9  1.0.0-alpha  1.0.0-alpha.1  1.0.0-beta.2  1.0.0-beta.10  1.0.0-rc.1  1.0.0
0
```

The order matches the `semver` command exactly. In `compare`, the line with `b.pre.length - a.pre.length` encodes "a release beats its prereleases": if only one version has a label, the one *without* it is greater.

### Prereleases and ranges

You would not want `^1.2.0` to install someone's experimental `1.3.0-beta.1` on your production server. So ranges skip prereleases, unless the range itself mentions a prerelease of the *same* `MAJOR.MINOR.PATCH`:

Terminal on your computer

```bash
$ npx semver --range "^1.2.0" 1.2.5 1.3.0-beta.1 2.0.0-rc.1 1.9.9
1.2.5
1.9.9
$ npx semver --range "^1.3.0-beta.1" 1.3.0-beta.0 1.3.0-beta.2 1.3.0 1.4.0-beta.1
1.3.0-beta.2
1.3.0
```

Opting into `1.3.0-beta.1` lets you receive later betas of 1.3.0 and the final 1.3.0, but not betas of 1.4.0.

### The 0.x rule

Before 1.0.0, a package promises nothing: any release may break. So `^` is stricter there. It allows changes only to the right of the first non-zero number:

Terminal on your computer

```bash
$ npx semver --range "^0.2.3" 0.2.3 0.2.9 0.3.0 1.0.0
0.2.3
0.2.9
$ npx semver --range "^0.0.3" 0.0.3 0.0.4
0.0.3
```

Every `^` and `~` is shorthand for a pair of comparisons. Writing the translation yourself makes the rule concrete:

desugar.js

```ts
function desugar(range) {
  const [major, minor, patch] = range.slice(1).split(".").map(Number);
  const low = `>=${major}.${minor}.${patch}`;
  if (range[0] === "~") return `${low} <${major}.${minor + 1}.0`;
  if (major > 0) return `${low} <${major + 1}.0.0`;
  if (minor > 0) return `${low} <0.${minor + 1}.0`;
  return `${low} <0.0.${patch + 1}`;
}

for (const range of ["^1.2.3", "~1.2.3", "^0.2.3", "~0.2.3", "^0.0.3"]) {
  console.log(range.padEnd(7), "means", desugar(range));
}
```

Output of `node desugar.js` and of the browser terminal

```ts
^1.2.3  means >=1.2.3 <2.0.0
~1.2.3  means >=1.2.3 <1.3.0
^0.2.3  means >=0.2.3 <0.3.0
~0.2.3  means >=0.2.3 <0.3.0
^0.0.3  means >=0.0.3 <0.0.4
```

### More range forms

You will meet these in other people's `package.json` files:

| Range | Means |
| --- | --- |
| `>=1.2.0 <1.5.0` | Both conditions (space means AND) |
| `^1.2.0 \|\| ^2.0.0` | Either range (`\|\|` means OR); common for peer dependencies that support two majors |
| `1.2.0 - 1.4.0` | Hyphen range: `>=1.2.0 <=1.4.0` |
| `1.x`, `1.*`, `1` | Any 1.x.x version, the same as `^1.0.0` |
| `*` or `""` | Any version at all. Avoid |
| `latest`, `next` | Not a range but a **dist-tag** (see [Publishing](#publishing)) |

Terminal on your computer

```bash
$ npx semver --range ">=1.2.0 <1.5.0 || >=2.1.0" 1.1.9 1.4.9 1.5.0 2.0.0 2.1.3
1.4.9
2.1.3
$ npx semver --range "1.x" 0.9.0 1.0.0 1.9.3 2.0.0
1.0.0
1.9.3
```

When npm installs a range, it picks the **highest** published version that satisfies it, with one exception: if the `latest` dist-tag satisfies the range, npm uses that, so a publisher can hold back a version that is technically higher.

### Which range should you write?

- **Applications** (a server you deploy): keep npm's default `^`. The committed lockfile already pins exact versions; the range only matters when you deliberately update. Some teams set `save-exact=true` in `.npmrc` so every update is an explicit change in `package.json`; that works too.
- **Libraries** (packages others install): use `^` ranges for dependencies. If your library pins `ms` exactly at `2.1.2` and another library pins `2.1.3`, users get two copies. Wide ranges let npm share one.
- **0.x dependencies**: remember that `^0.4.0` already means "0.4.x only". Read the changelog on every update.

## The dependency tree

npm installs a **tree**: your dependencies, their dependencies, and so on. Node.js finds an imported package by looking in the nearest `node_modules` folder, then in the parent folder's `node_modules`, all the way up. npm uses that rule to save space: it puts packages as high as possible (**hoisting**) so they can be shared, and nests a copy only when two packages need incompatible versions. `npm ls` shows the tree, `npm explain` shows why a package is there:

Terminal on your computer

```bash
$ npm ls ms
shop-api@1.0.0 ~/shop-api
└─┬ express@5.2.1
  ├─┬ debug@4.4.3
  │ └── ms@2.1.3
  └─┬ send@1.2.1
    └── ms@2.1.3 deduped
$ npm explain ms
ms@2.1.3
node_modules/ms
  ms@"^2.1.3" from debug@4.4.3
  node_modules/debug
    debug@"^4.4.3" from body-parser@2.3.0
    node_modules/body-parser
      body-parser@"^2.2.1" from express@5.2.1
      node_modules/express
        express@"^5.2.1" from the root project
…
```

`deduped` means "this need is met by a copy installed higher up": one `ms` in `node_modules/ms` serves both. Now watch what happens when your project also needs an old major version of a package the tree already uses. Some older code in the shop imports `debug` version 2:

Terminal on your computer

```bash
$ npm install debug@2

added 6 packages, changed 1 package, and audited 75 packages in 2s
…
$ npm ls ms
shop-api@1.0.0 ~/shop-api
├─┬ debug@2.6.9
│ └── ms@2.0.0
└─┬ express@5.2.1
  ├─┬ body-parser@2.3.0
  │ └─┬ debug@4.4.3
  │   └── ms@2.1.3 deduped
  ├─┬ debug@4.4.3
  │ └── ms@2.1.3
…
$ find node_modules -path "*/debug/package.json"
node_modules/body-parser/node_modules/debug/package.json
node_modules/debug/package.json
node_modules/express/node_modules/debug/package.json
node_modules/finalhandler/node_modules/debug/package.json
node_modules/router/node_modules/debug/package.json
node_modules/send/node_modules/debug/package.json
```

Your direct dependency takes the top-level slot, `node_modules/debug`, so version 2.6.9 lives there. Five packages need `debug` 4, which no longer fits at the top, so each gets its own nested copy: one package added to your `package.json`, six copies of `debug` on disk. And `debug@2` needs `ms@2.0.0`, which conflicts with the shared `ms@2.1.3`, so it is nested too. Duplicates like these cost disk space and download time, and they can cause real bugs: two copies of a library each have their own state, and an `instanceof` check against one copy's class fails for objects made by the other.

The placement rule is simple enough to simulate. Each package is placed at the top level if that slot is free or already holds the same version; otherwise it is nested inside the package that needs it. Your direct dependencies are placed first:

hoist.js

```ts
const requests = [
  { by: "(root)", name: "debug", version: "2.6.9" },
  { by: "(root)", name: "express", version: "5.2.1" },
  { by: "express@5.2.1", name: "debug", version: "4.4.3" },
  { by: "express@5.2.1", name: "send", version: "1.2.1" },
  { by: "send@1.2.1", name: "debug", version: "4.4.3" },
  { by: "debug@4.4.3", name: "ms", version: "2.1.3" },
  { by: "debug@2.6.9", name: "ms", version: "2.0.0" },
];

const top = new Map();
const placedAt = new Map([["(root)", ""]]);

for (const { by, name, version } of requests) {
  const id = `${name}@${version}`;
  let path;
  if (!top.has(name) || top.get(name) === version) {
    top.set(name, version);
    path = `node_modules/${name}`;
  } else {
    path = `${placedAt.get(by)}/node_modules/${name}`;
  }
  if (!placedAt.has(id)) placedAt.set(id, path);
  console.log(id.padEnd(14), "for", by.padEnd(14), "->", path);
}
```

Output of `node hoist.js` and of the browser terminal

```ts
debug@2.6.9    for (root)         -> node_modules/debug
express@5.2.1  for (root)         -> node_modules/express
debug@4.4.3    for express@5.2.1  -> node_modules/express/node_modules/debug
send@1.2.1     for express@5.2.1  -> node_modules/send
debug@4.4.3    for send@1.2.1     -> node_modules/send/node_modules/debug
ms@2.1.3       for debug@4.4.3    -> node_modules/ms
ms@2.0.0       for debug@2.6.9    -> node_modules/debug/node_modules/ms
```

This matches the real install: `debug@2.6.9` and `ms@2.1.3` at the top, every other version nested under the package that asked for it. The order of the requests matters, though. Move the last line to the front and `ms@2.0.0` takes the top slot, so every `debug@4` would need its own nested `ms@2.1.3`. Real npm therefore does not place packages naively one by one: it builds the whole tree and prefers placements that need fewer copies. The core rule stays the same: one version per name per folder, and a conflict means a nested copy.

Two tools manage the tree. `npm dedupe` looks for duplicates that one shared version could replace. **overrides** in `package.json` force a version anywhere in the tree, which you need when a deep dependency has a security fix that its parent has not adopted yet:

Terminal on your computer

```bash
$ npm pkg set overrides.ms=2.1.3
$ npm install

removed 1 package, and audited 74 packages in 2s
…
$ npm ls ms
shop-api@1.0.0 ~/shop-api
├─┬ debug@2.6.9
│ └── ms@2.1.3 overridden
…
```

`debug@2` asked for `ms@2.0.0` and got 2.1.3. That is a promise you now make on the package's behalf, so test it, and remove the override once the parent package updates. An override can also be scoped to one parent, such as `"overrides": { "debug": { "ms": "2.1.3" } }`.

## Reading the lockfile

The lockfile is the tree written down. Since npm 7 it uses `"lockfileVersion": 3`: a `packages` object whose keys are folder paths inside `node_modules`, and `""` for your own project. This is a real lockfile from a small project with one dependency (`lodash`) and one dev dependency (`minimatch`, which brings two more packages with it):

package-lock.json

```json
{
  "name": "invoice-app",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "invoice-app",
      "version": "1.0.0",
      "license": "ISC",
      "dependencies": {
        "lodash": "^4.17.20"
      },
      "devDependencies": {
        "minimatch": "^3.0.4"
      }
    },
    "node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/brace-expansion": {
      "version": "1.1.21",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz",
      "integrity": "sha512-9zeA+KLZNNzglF2TPKRQEDyx6Yby7daAkuy8MiPzpXPsYDWi/DRM8jmwUDxokQjYqBpv5DgPiwD4h4ZZSy1Ujw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    },
    "node_modules/concat-map": {
      "version": "0.0.1",
      "resolved": "https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz",
      "integrity": "sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/lodash": {
      "version": "4.18.1",
      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.18.1.tgz",
      "integrity": "sha512-dMInicTPVE8d1e5otfwmmjlxkZoUpiVLwyeTdUsi/Caj/gfzzblBcCE5sRHV/AsjuCmxWrte2TNGSYuCeCq+0Q==",
      "license": "MIT"
    },
    "node_modules/minimatch": {
      "version": "3.1.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz",
      "integrity": "sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    }
  }
}
```

A lockfile is data, so a program can answer questions about it. This one works out, for each package, whether it is direct or transitive, who needs it, and whether a production install would include it:

lock-report.jsNode.js only

```ts
import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const root = lock.packages[""];
const direct = new Set([...Object.keys(root.dependencies ?? {}), ...Object.keys(root.devDependencies ?? {})]);

const neededBy = new Map();
for (const [path, info] of Object.entries(lock.packages)) {
  const parent = path === "" ? "(your project)" : path.replace("node_modules/", "");
  for (const name of Object.keys({ ...info.dependencies, ...info.devDependencies })) {
    if (!neededBy.has(name)) neededBy.set(name, []);
    neededBy.get(name).push(parent);
  }
}

for (const [path, info] of Object.entries(lock.packages)) {
  if (path === "") continue;
  const name = path.replace("node_modules/", "");
  const kind = direct.has(name) ? "direct" : "transitive";
  console.log(`${name}@${info.version}`.padEnd(22), kind.padEnd(11), (info.dev ? "dev" : "prod").padEnd(5), "needed by", neededBy.get(name).join(", "));
}

const production = Object.entries(lock.packages).filter(([path, info]) => path !== "" && !info.dev);
console.log("npm ci --omit=dev installs:", production.map(([path]) => path.replace("node_modules/", "")));
```

Output of `node lock-report.js`

```ts
balanced-match@1.0.2   transitive  dev   needed by brace-expansion
brace-expansion@1.1.21 transitive  dev   needed by minimatch
concat-map@0.0.1       transitive  dev   needed by brace-expansion
lodash@4.18.1          direct      prod  needed by (your project)
minimatch@3.1.5        direct      dev   needed by (your project)
npm ci --omit=dev installs: [ 'lodash' ]
```

The `dev` flag is set on every package that is only reachable through dev dependencies, including transitive ones such as `concat-map`. That is how npm knows what to skip. The real commands agree:

Terminal on your computer

```bash
$ npm ci

added 5 packages, and audited 6 packages in 2s

found 0 vulnerabilities
$ npm ci --omit=dev

added 1 package, and audited 2 packages in 2s

found 0 vulnerabilities
$ ls node_modules
lodash
```

The `integrity` field is a **Subresource Integrity** string: the hash algorithm, a dash, and the digest in base64. npm hashes every downloaded tarball and refuses it if the digest differs, using exactly the hashing you learned in [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#hashes):

integrity.jsNode.js only

```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const recorded = lock.packages["node_modules/lodash"].integrity;
const [algorithm, digest] = recorded.split(/-(.*)/s);
console.log(algorithm, Buffer.from(digest, "base64").length, "bytes");

function sri(bytes) {
  return "sha512-" + createHash("sha512").update(bytes).digest("base64");
}

const tarball = Buffer.from("pretend these are the bytes of lodash-4.18.1.tgz");
const expected = sri(tarball);
const tampered = Buffer.concat([tarball, Buffer.from("\nsteal(process.env)")]);
console.log("original accepted:", sri(tarball) === expected);
console.log("tampered accepted:", sri(tampered) === expected);
```

Output of `node integrity.js`

```ts
sha512 64 bytes
original accepted: true
tampered accepted: false
```

So the lockfile protects you in two ways: the `version` fixes *which* release is installed, and the `integrity` fixes *which bytes*, even if someone manages to replace a file on a registry mirror.

### npm install versus npm ci

|  | `npm install` | `npm ci` |
| --- | --- | --- |
| Starts from | Your existing `node_modules` | Deletes `node_modules` first |
| Lockfile | Updates it when `package.json` changed | Never writes it; fails if it does not match `package.json` |
| Use it | On your computer, when you change dependencies | In CI, Docker builds and deployments |

When two people change dependencies on different branches, `package-lock.json` gets a merge conflict. Do not edit it by hand: take either side, then run `npm install`, which rebuilds the lockfile from the merged `package.json`.

## Kinds of dependencies

You know `dependencies` and `devDependencies`. Three more fields exist, and one of them causes most confusing install errors.

### peerDependencies

Some packages are **plugins**: they do not work on their own, only together with a host package that the *project* installs. `react-dom` renders React components, so it needs React, but it must use the *same* React as the rest of the app. Two copies of React in one app break it. So `react-dom` declares React as a **peer dependency**: "I need this, but my user provides it, in a version I accept":

Terminal on your computer

```bash
$ npm view react-dom@19.3.0 peerDependencies
{ react: '^19.3.0' }
$ npm install react@18
…
$ npm install react-dom@19
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error
npm error While resolving: storefront@1.0.0
npm error Found: react@18.3.1
npm error node_modules/react
npm error   react@"^18.3.1" from the root project
npm error
npm error Could not resolve dependency:
npm error peer react@"^19.3.0" from react-dom@19.3.0
npm error node_modules/react-dom
npm error   react-dom@"19" from the root project
npm error
npm error Fix the upstream dependency conflict, or retry this command with --force or --legacy-peer-deps to accept an incorrect (and potentially broken) dependency resolution.
…
```

Read it from the bottom up: `react-dom@19.3.0` needs a peer `react@^19.3.0`, but the project has `react@18.3.1`. npm refuses rather than install a combination that the authors say does not work. The fix is to make the versions agree, here by moving both to 19 in one command:

Terminal on your computer

```bash
$ npm install react@19 react-dom@19

added 2 packages, removed 2 packages, changed 1 package, and audited 4 packages in 2s

found 0 vulnerabilities
$ npm ls
storefront@1.0.0 ~/storefront
├── react-dom@19.3.0
└── react@19.3.0
```

> --force AND --legacy-peer-deps
>
> The error suggests two flags. `--legacy-peer-deps` ignores peer dependencies entirely, as npm 6 did; `--force` installs the conflicting versions anyway. Both make the error disappear and leave you with a combination the authors say is broken, which fails later, at run time, in a harder way. Use them only as a temporary step when you know the peer range is simply out of date, and write down why.

Peer dependencies are common for plugins of all kinds: ESLint plugins peer-depend on ESLint, and TypeScript tooling on `typescript`. If you publish a plugin yourself, declare the host as a peer with a range as wide as you actually support (`"^8.0.0 || ^9.0.0"`), and also as a dev dependency so your own tests have it.

### optionalDependencies and bundleDependencies

- **optionalDependencies** may fail to install without failing the whole install. Tools that ship a fast native program per operating system use them: on Linux, the Windows build simply is not installed.
- **bundleDependencies** are packed inside your package's tarball instead of downloaded separately. Rare; used when a dependency must not be fetched from the registry.

## Scripts in depth

Scripts are more than named commands. npm runs `pre<name>` before and `post<name>` after a script automatically, passes extra arguments after `--` to the command, and gives every script a set of environment variables. Take a package with these scripts:

package.json

```json
{
  "name": "@naija-shop/invoice-kit",
  "version": "1.0.0",
  "type": "module",
  "exports": "./index.js",
  "scripts": {
    "prebuild": "node scripts/clean.js",
    "build": "node scripts/build.js",
    "postbuild": "node scripts/report.js"
  }
}
```

The build script prints what npm gave it: `npm_lifecycle_event` is the name of the script being run, and `npm_package_name` and `npm_package_version` come from `package.json`:

scripts/build.js

```ts
const args = process.argv.slice(2);
console.log(`[${process.env.npm_lifecycle_event}] building ${process.env.npm_package_name}@${process.env.npm_package_version}`);
console.log(`[${process.env.npm_lifecycle_event}] extra arguments: ${JSON.stringify(args)}`);
```

Terminal on your computer

```bash
$ npm run build -- --minify --target=node24

> @naija-shop/invoice-kit@1.0.0 prebuild
> node scripts/clean.js

[prebuild] removing old dist/

> @naija-shop/invoice-kit@1.0.0 build
> node scripts/build.js --minify --target=node24

[build] building @naija-shop/invoice-kit@1.0.0
[build] extra arguments: ["--minify","--target=node24"]

> @naija-shop/invoice-kit@1.0.0 postbuild
> node scripts/report.js

[postbuild] done
$ npm run build --silent
[prebuild] removing old dist/
[build] building @naija-shop/invoice-kit@1.0.0
[build] extra arguments: []
[postbuild] done
```

- Everything after `--` goes to the script's command, not to npm. Without the `--`, npm would treat `--minify` as its own option.
- `--silent` (or `-s`) hides npm's `>` header lines, which matters when a script's output is piped into another program.
- If any step fails, the chain stops, and `npm run` exits with the failing step's exit code:

Terminal on your computer

```bash
$ npm run build

> @naija-shop/invoice-kit@1.0.0 prebuild
> node scripts/clean.js

[prebuild] cannot remove dist/: permission denied
$ echo $?
1
```

Some script names are special **lifecycle scripts** that npm runs by itself: `prepare` runs after `npm install` in your own project and before packing, which is where libraries often build; `prepublishOnly` runs only before `npm publish`, a good place for "run the tests first". A dependency's `preinstall`, `install` and `postinstall` scripts are the **install scripts** that npm 11 asks you to approve, as you saw in [npm and packages](https://zudojs.oyinlola.site/learn/npm-packages#security).

> TIP
>
> Scripts run in a shell: `sh` on macOS and Linux, `cmd.exe` on Windows. A script like `rm -rf dist` fails on Windows. Write anything beyond a single command as a small Node.js file (`node scripts/clean.js`, which can call `fs.rm`), and it works everywhere.

## Local packages, scopes and registries

### Testing a package before you publish it

Workspaces (from [npm and packages](https://zudojs.oyinlola.site/learn/npm-packages#workspaces)) link a folder, which is convenient but hides mistakes: a file you forgot in `files`, or a wrong `exports` path, still works through a link because the whole folder is there. The honest test installs the **tarball**, exactly what the registry would receive:

Terminal on your computer

```bash
$ cd invoice-kit
$ npm pack --silent
naija-shop-invoice-kit-1.1.0.tgz
$ cd ../checkout
$ npm install ../invoice-kit/naija-shop-invoice-kit-1.1.0.tgz

added 1 package, and audited 2 packages in 1s

found 0 vulnerabilities
$ node main.js
₦52,500.00
$ ls node_modules/@naija-shop/invoice-kit
index.js
package.json
README.md
```

Only the three allowed files arrived: no tests, no `.env`. `package.json` now contains `"@naija-shop/invoice-kit": "file:../invoice-kit/naija-shop-invoice-kit-1.1.0.tgz"`. A `file:` dependency can also point at a folder (`npm install ../invoice-kit`), which npm installs as a link, like a workspace. `npm link` does the same across unrelated projects on your computer. Folder links are fine while developing; run the tarball test before every first release.

### Scopes and registries

A **scope** (`@naija-shop/`) is a namespace owned by an npm user or organisation: nobody else can publish `@naija-shop/anything`. Scopes can also point to a different **registry**, for example your company's private one or GitHub Packages. That is configured in `.npmrc`, in the project or in your home folder:

```ts
@naija-shop:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

The token is read from the `NPM_TOKEN` environment variable at install time, so the file can be committed without the secret. Never commit a `.npmrc` with a real token in it; that is one of the commonest ways npm tokens leak.

### Workspaces at scale

A **monorepo** is one repository holding several packages and apps. npm can create workspace packages and target commands at them with `-w` (one workspace) or `--workspaces` (all of them):

Terminal on your computer

```bash
$ npm init -y -w packages/invoice-kit --scope=@naija-shop
Wrote to ~/shop-mono/packages/invoice-kit/package.json:
…
added 1 package in 690ms
$ npm init -y -w apps/api
…
added 1 package in 621ms
$ npm install @naija-shop/invoice-kit -w apps/api

up to date, audited 5 packages in 516ms

found 0 vulnerabilities
$ npm install ms -w apps/api

added 1 package, and audited 6 packages in 18s

found 0 vulnerabilities
$ npm ls
shop-mono@ ~/shop-mono
├── @naija-shop/invoice-kit@1.0.0 -> ./packages/invoice-kit
└─┬ api@1.0.0 -> ./apps/api
  ├── @naija-shop/invoice-kit@1.0.0 deduped -> ./packages/invoice-kit
  └── ms@2.1.3
$ npm run test --workspaces --if-present

> @naija-shop/invoice-kit@1.0.0 test
> node --test

✔ adds up invoice lines (1.3123ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 184.467108
```

- `npm init -w` created each folder with its own `package.json` and added it to the root's `workspaces` list.
- Installing `@naija-shop/invoice-kit` into `apps/api` downloaded nothing ("up to date"): npm saw a workspace with that name and a matching version and linked it.
- `--if-present` skips workspaces without a `test` script instead of failing.
- There is one lockfile and one `node_modules` at the root, shared by all workspaces.

Larger monorepos often use **pnpm** or Yarn instead of npm. pnpm stores each package version once on disk and links it into projects, and it only lets a package import what it declares, which catches missing dependencies that npm's hoisting hides. The ZudoJS repository itself is a pnpm workspace, where internal dependencies are written `"workspace:*"` so they always resolve to the local folder. The ideas are the same; the commands differ slightly.

## Publishing and versioning

Before a first release, a library's `package.json` needs a few fields beyond name and version:

package.json

```json
{
  "name": "@naija-shop/invoice-kit",
  "version": "1.1.0",
  "description": "Invoice helpers for Nigerian shops",
  "license": "MIT",
  "type": "module",
  "exports": "./index.js",
  "files": ["index.js"],
  "engines": { "node": ">=24" },
  "repository": { "type": "git", "url": "git+https://github.com/naija-shop/invoice-kit.git" }
}
```

- **exports** is the package's public entry point. Anything not listed cannot be imported by users (`import "@naija-shop/invoice-kit/internal.js"` fails), so you can reorganise internals without breaking anyone. It can also map several entry points and give different files to `import` and `require`; [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems) goes into that.
- **engines** states which Node.js versions you support. npm warns on install when it does not match.
- **repository** links the package to its source code; provenance (below) checks it.

The `engines` field is only a warning at install time, so a server should also check at startup. `process.versions.node` holds the running version as text:

engines-check.jsNode.js only

```ts
const required = ">=24";
const minimum = Number(required.replace(">=", ""));
const running = Number(process.versions.node.split(".")[0]);

if (running < minimum) {
  console.error(`This server needs Node.js ${required}, but this is ${process.version}.`);
  process.exit(1);
}
console.log(`Node.js major version ${running >= minimum ? "is supported" : "is too old"} (needs ${required})`);
```

Output of `node engines-check.js`

```ts
Node.js major version is supported (needs >=24)
```

### npm version and prereleases

`npm version` bumps the version in `package.json` and the lockfile. Inside a Git repository it also commits and creates a tag such as `v1.1.0`, which you will use in [Professional Git](https://zudojs.oyinlola.site/learn/git-collaboration):

Terminal on your computer

```bash
$ npm version minor
v1.1.0
$ npm version prerelease --preid beta
v1.1.1-beta.0
$ npm version prerelease
v1.1.1-beta.1
```

Notice that `prerelease` from 1.1.0 made a beta of **1.1.1**. For a beta of the next minor or major, use `preminor` or `premajor` (`1.2.0-beta.0`, `2.0.0-beta.0`).

### dist-tags and access

A **dist-tag** is a name pointing at one version. `npm install express` means "install the version tagged `latest`". Projects keep other tags for other audiences:

Terminal on your computer

```bash
$ npm view express dist-tags
{ latest: '5.2.1', 'latest-4': '4.22.3' }
```

Express 4 still gets fixes, published under `latest-4` so that they do not become the default install. When you publish, npm moves `latest` to your new version unless you pass `--tag`. A beta published as `latest` would be what every new user installs, so npm 11 refuses to publish a prerelease without an explicit tag. `npm publish --dry-run` shows what would happen, without uploading. First at version 1.1.0, then at 1.1.1-beta.1:

Terminal on your computer

```bash
$ npm publish --dry-run
npm notice
npm notice 📦  @naija-shop/invoice-kit@1.1.0
npm notice Tarball Contents
npm notice 75B README.md
npm notice 238B index.js
npm notice 397B package.json
…
npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access (dry-run)
+ @naija-shop/invoice-kit@1.1.0
$ npm version 1.1.1-beta.1
v1.1.1-beta.1
$ npm publish --dry-run
npm error You must specify a tag using --tag when publishing a prerelease version.
…
$ npm publish --dry-run --tag next --access public
…
npm notice Publishing to https://registry.npmjs.org/ with tag next and public access (dry-run)
+ @naija-shop/invoice-kit@1.1.1-beta.1
```

"Default access" for a scoped package means **restricted**: private, which needs a paid npm account. The first publish of a public scoped package needs `--access public` (or `"publishConfig": { "access": "public" }` in `package.json`).

### After publishing

- A published version can never be changed. To fix a bad release, publish a new patch.
- `npm deprecate @naija-shop/invoice-kit@1.1.0 "Wrong VAT rate, use 1.1.1"` shows a warning to everyone who installs that version.
- `npm unpublish` is heavily restricted: within 72 hours of publishing only if no other public package depends on the version, and after that only for packages nobody depends on that are barely downloaded. Deleting published code breaks everyone who uses it. In 2016, the removal of a tiny package called `left-pad` broke builds across the internet, and these rules came from that.
- Publish from CI rather than from a laptop, with **provenance**: `npm publish --provenance` from GitHub Actions (or npm's **trusted publishing**, which needs no long-lived token at all) attaches a signed statement of which repository and which workflow built the package. Users can check it with `npm audit signatures`.
- Tools such as Changesets automate the version bumps and changelogs for many packages at once; the ZudoJS packages are released that way.

## Supply-chain security

Every dependency is code from strangers that runs with your permissions. Attacks on that **supply chain** are not hypothetical. Each of these happened:

| Attack | What happened | What defends you |
| --- | --- | --- |
| Typosquatting | `crossenv` (2017) copied `cross-env` and stole environment variables | Copy names from official docs; check with `npm view` |
| Malicious maintainer | `event-stream` (2018): a new maintainer added code targeting a Bitcoin wallet app | Lockfile; reviewing updates; fewer dependencies |
| Account takeover | `ua-parser-js` (2021): a stolen account published versions with a password stealer and crypto miner | Lockfile; `npm ci`; waiting a few days before adopting new releases |
| Dependency confusion | 2021: public packages named like companies' private ones were installed inside those companies | Scoped names you own; a scoped registry in `.npmrc` |
| Install-script worm | 2025: a worm stole npm tokens through install scripts and published itself into more packages | npm 11 install-script approval; `--ignore-scripts` in CI |

The registry cleans up after such incidents. The malicious `event-stream` version is gone, and the typosquat name now belongs to npm itself:

Terminal on your computer

```bash
$ npm view event-stream@3.3.6
npm error code E404
npm error 404 No match found for version 3.3.6
…
$ npm view crossenv
crossenv@0.0.2-security | Proprietary | deps: none | versions: 4
security holding package
https://github.com/npm/security-holder#readme
…
```

### Catching typos before they install

Typosquats are one or two keystrokes away from a real name. The number of single-character edits (insert, delete, replace) that turn one word into another is the **edit distance**, and it makes a simple, useful check:

typosquat.js

```ts
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

const popular = ["express", "lodash", "cross-env", "react", "dotenv", "axios"];

function check(name) {
  if (popular.includes(name)) return `${name}: known package`;
  const close = popular.filter((p) => editDistance(name, p) <= 2);
  return close.length ? `${name}: suspicious, looks like ${close.join(", ")}` : `${name}: not similar to a popular package`;
}

for (const name of ["express", "expres", "crossenv", "lodahs", "dotenv", "invoice-kit"]) {
  console.log(check(name));
}
```

Output of `node typosquat.js` and of the browser terminal

```ts
express: known package
expres: suspicious, looks like express
crossenv: suspicious, looks like cross-env
lodahs: suspicious, looks like lodash
dotenv: known package
invoice-kit: not similar to a popular package
```

Real tools use the same idea with the thousands of most-downloaded names, and some registries block new names that are too close to popular ones.

### npm audit, honestly

`npm audit` compares your installed versions with the public advisory database. It is useful, and it is also noisy. Here a project has an old `lodash` as a dependency and an old `minimatch` as a dev dependency:

Terminal on your computer

```bash
$ npm audit
# npm audit report

lodash  <=4.17.23
Severity: high
Command Injection in lodash - https://github.com/advisories/GHSA-35jh-r3h4-6jhm
Regular Expression Denial of Service (ReDoS) in lodash - https://github.com/advisories/GHSA-29mw-wpgm-hmr9
lodash vulnerable to Code Injection via `_.template` imports key names - https://github.com/advisories/GHSA-r5fr-rjxr-66jc
lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit` - https://github.com/advisories/GHSA-f23m-r3pf-42rh
Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions - https://github.com/advisories/GHSA-xxjr-mmjv-4gpg
fix available via `npm audit fix`
node_modules/lodash

minimatch  <=3.1.3
Severity: high
minimatch ReDoS vulnerability - https://github.com/advisories/GHSA-f8q6-p94x-37v3
…
fix available via `npm audit fix`
node_modules/minimatch

2 high severity vulnerabilities

To address all issues, run:
  npm audit fix
$ npm audit --omit=dev
…
1 high severity vulnerability
…
$ npm audit fix

changed 2 packages, and audited 6 packages in 2s

found 0 vulnerabilities
$ npm ls
audit-demo@1.0.0 ~/audit-demo
├── lodash@4.18.1
└── minimatch@3.1.5
```

How to read a report like this:

- **Does the vulnerable code run in production?** `--omit=dev` leaves out dev dependencies. A ReDoS in a build tool that only ever reads your own files is far less urgent than one in code that handles requests.
- **Do you use the affected feature?** The lodash advisories concern specific functions such as `_.template` and `_.unset`. Read the advisory before deciding how urgent it is, but do not skip the update because of this: code changes, and someone may start using that function next month.
- **Is the fix inside your range?** Here it was, so `npm audit fix` updated both packages within their `^` ranges. When it is not, npm suggests `npm audit fix --force`, which may jump a major version and break your code. Update deliberately instead, or use an override for a transitive dependency.
- **Exit code.** `npm audit` exits with 1 when it finds anything, so it can fail a CI job. Many teams fail only on high severity in production dependencies: `npm audit --omit=dev --audit-level=high`.

That CI rule is easy to state as code. Given the findings of an audit (the fields mirror what `npm audit --json` reports), decide whether the build should fail:

audit-gate.js

```ts
const levels = ["info", "low", "moderate", "high", "critical"];
const findings = [
  { name: "lodash", severity: "high", dev: false, fixAvailable: true },
  { name: "minimatch", severity: "high", dev: true, fixAvailable: true },
  { name: "tough-cookie", severity: "moderate", dev: false, fixAvailable: false },
];

function gate(findings, { omitDev, auditLevel }) {
  const min = levels.indexOf(auditLevel);
  const blocking = findings.filter((f) => !(omitDev && f.dev) && levels.indexOf(f.severity) >= min);
  return { exitCode: blocking.length > 0 ? 1 : 0, blocking: blocking.map((f) => f.name) };
}

console.log("everything:          ", gate(findings, { omitDev: false, auditLevel: "low" }));
console.log("prod, high and above:", gate(findings, { omitDev: true, auditLevel: "high" }));
console.log("after fixing lodash: ", gate(findings.slice(1), { omitDev: true, auditLevel: "high" }));
```

Output of `node audit-gate.js` and of the browser terminal

```ts
everything:           { exitCode: 1, blocking: [ 'lodash', 'minimatch', 'tough-cookie' ] }
prod, high and above: { exitCode: 1, blocking: [ 'lodash' ] }
after fixing lodash:  { exitCode: 0, blocking: [] }
```

The moderate finding without a fix still deserves a look, in a regular review rather than a failed build: a CI gate that fails on things nobody can fix teaches the team to ignore it.

### Habits that cover the rest

- Commit the lockfile and install with `npm ci` everywhere except your own computer.
- Prefer fewer dependencies. Ten lines you write and test yourself have no maintainer who can be hacked.
- Before adding a package: `npm view` it, check how long it has existed, its weekly downloads, its repository, and whether it has an install script it does not obviously need.
- Give private packages a scope you own, so a public package cannot take their name.
- In CI, `npm ci --ignore-scripts` when your build does not need install scripts, and keep npm tokens out of jobs that do not publish.
- Turn on automated update pull requests (GitHub's Dependabot or Renovate). They update one package at a time, run your tests, and show the changelog, which makes updating a routine instead of a yearly emergency.

## Practice

TRY IT YOURSELF

### Pick the highest version a range allows

Write `maxSatisfying(versions, range)` for caret ranges without prereleases, using the `desugar` idea: a version satisfies `^X.Y.Z` when it is at least `X.Y.Z` and below the upper bound. Try it on `^1.2.0`, `^0.2.0` and `^2.0.0`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`upperBound` is exactly the desugaring table from earlier in this lesson, written as code instead of a string. `maxSatisfying` filters, then picks the last one after sorting with `lessThan`.

HINT 2

`const ok = versions.filter((v) => !lessThan(parse(v), low) && lessThan(parse(v), high)); return ok.sort((a, b) => (lessThan(parse(a), parse(b)) ? -1 : 1)).at(-1) ?? null;`

SOLUTION

max-satisfying.js

```ts
const parse = (v) => v.split(".").map(Number);
const lessThan = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

function upperBound([major, minor, patch]) {
  if (major > 0) return [major + 1, 0, 0];
  if (minor > 0) return [0, minor + 1, 0];
  return [0, 0, patch + 1];
}

function maxSatisfying(versions, range) {
  const low = parse(range.slice(1));
  const high = upperBound(low);
  const ok = versions.filter((v) => !lessThan(parse(v), low) && lessThan(parse(v), high));
  return ok.sort((a, b) => (lessThan(parse(a), parse(b)) ? -1 : 1)).at(-1) ?? null;
}

const published = ["0.2.1", "0.2.7", "0.3.0", "1.2.0", "1.4.2", "1.10.0", "2.0.0"];
for (const range of ["^1.2.0", "^0.2.0", "^2.0.0", "^3.0.0"]) {
  console.log(range, "->", maxSatisfying(published, range));
}
```

Output of `node max-satisfying.js` and of the browser terminal

```ts
^1.2.0 -> 1.10.0
^0.2.0 -> 0.2.7
^2.0.0 -> 2.0.0
^3.0.0 -> null
```

`1.10.0` beats `1.4.2` because versions compare as numbers, part by part. Sorting them as strings would pick `1.4.2`, a classic bug. `^3.0.0` has no match, which is when npm reports `ETARGET`.

TRY IT YOURSELF

### Find duplicated packages in a lockfile

Write a program that reads the `packages` of a lockfile and lists every package name installed in more than one version, with the paths. Test it on this excerpt of the `shop-api` lockfile after `npm install debug@2`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Build two levels of `Map`, the same shape as the worked example: `byName` maps a package name to another `Map`, which maps a version to an array of paths.

HINT 2

`const name = path.split("node_modules/").at(-1); if (!byName.has(name)) byName.set(name, new Map()); const versions = byName.get(name); if (!versions.has(info.version)) versions.set(info.version, []); versions.get(info.version).push(path);`

SOLUTION

duplicates.js

```ts
const packages = {
  "": {},
  "node_modules/debug": { version: "2.6.9" },
  "node_modules/debug/node_modules/ms": { version: "2.0.0" },
  "node_modules/express/node_modules/debug": { version: "4.4.3" },
  "node_modules/send/node_modules/debug": { version: "4.4.3" },
  "node_modules/ms": { version: "2.1.3" },
  "node_modules/express": { version: "5.2.1" },
};

const byName = new Map();
for (const [path, info] of Object.entries(packages)) {
  if (path === "") continue;
  const name = path.split("node_modules/").at(-1);
  if (!byName.has(name)) byName.set(name, new Map());
  const versions = byName.get(name);
  if (!versions.has(info.version)) versions.set(info.version, []);
  versions.get(info.version).push(path);
}

for (const [name, versions] of byName) {
  if (versions.size < 2) continue;
  console.log(name);
  for (const [version, paths] of versions) console.log(`  ${version}: ${paths.join(", ")}`);
}
```

Output of `node duplicates.js` and of the browser terminal

```ts
debug
  2.6.9: node_modules/debug
  4.4.3: node_modules/express/node_modules/debug, node_modules/send/node_modules/debug
ms
  2.0.0: node_modules/debug/node_modules/ms
  2.1.3: node_modules/ms
```

The package name is whatever follows the *last* `node_modules/` in the path, which handles nested copies (and scoped names like `@naija-shop/invoice-kit`). Two versions of `debug` are expected here, since the project asked for version 2; the check is useful to spot duplicates nobody asked for.

TRY IT YOURSELF

### Diagnose the peer conflict

A teammate ran `npm install eslint-plugin-shop@3` and got `ERESOLVE` with `peer eslint@"^9.0.0" from eslint-plugin-shop@3.0.0` and `Found: eslint@8.57.0`. List the three possible fixes, and say which one you would choose and why.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Re-read the `react`/`react-dom` walkthrough in [Kinds of dependencies](#kinds): the same three routes apply whenever a peer range and an installed version disagree.

HINT 2

One route changes the peer (upgrade ESLint), one changes the plugin (an older major that already accepts ESLint 8), and one route overrides the check itself instead of resolving the disagreement.

SOLUTION

1. **Upgrade ESLint to 9** so it satisfies the peer range. This is usually right, but ESLint 9 is a major version, so read its migration notes and run the linter on the whole project.
2. **Use the previous major of the plugin** (`eslint-plugin-shop@2`), if its peer range includes ESLint 8. This is the safe short-term choice when you cannot upgrade ESLint yet.
3. **`--legacy-peer-deps`**: installs the plugin against a version its authors say it does not support. Only acceptable if you have checked that the plugin really works with ESLint 8 and the range is merely conservative, and then only with a note explaining it.

Check the options with `npm view eslint-plugin-shop@2 peerDependencies` before deciding. Choose 1 when you have time for the upgrade, 2 when you do not; avoid 3.

## Recap

- Prereleases sort before their release and are skipped by normal ranges. Below 1.0.0, `^` only allows changes to the right of the first non-zero number. npm installs the highest match, or `latest` if it matches.
- npm hoists packages to share them and nests copies when versions conflict. `npm ls`, `npm explain`, `npm dedupe` and `overrides` inspect and shape the tree.
- The lockfile pins versions and integrity hashes; `dev` flags drive `npm ci --omit=dev`. Build with `npm ci`; fix lockfile conflicts by re-running `npm install`.
- Peer dependencies say "my user provides this". Fix `ERESOLVE` by making versions agree, not with `--force`.
- Scripts get `pre`/`post` hooks, arguments after `--` and `npm_*` variables. Test packages as tarballs, publish scoped packages with `--access public`, betas with `--tag next`, from CI with provenance.
- Read `npm audit` with judgement: production or dev, affected feature, fix in range. Defend against typosquats, takeovers and dependency confusion with lockfiles, scopes, fewer dependencies and careful names.

Next, [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http) builds a server with no dependencies at all.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
