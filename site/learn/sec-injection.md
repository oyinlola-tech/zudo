---
title: "Writing injection-safe code — ZudoJS Academy"
description: "Keep untrusted data from becoming code: safe SQL, shell args, confined paths, SSRF-safe URLs, unambiguous HTTP, safe merges, linear-time regex."
source: https://zudojs.oyinlola.site/learn/sec-injection
---

LEVEL 10 · LESSON 4 OF 6

Attacks and defences Core

# Writing injection-safe code

Keep untrusted data from becoming code: safe SQL, shell args, confined paths, SSRF-safe URLs, unambiguous HTTP, safe merges, linear-time regex.

- **60 min** to read and try
- **You need:** SQL basics, Events, processes and workers, Prototypes in depth, Regular expressions, and Browser attacks and defences
- **You build:** A supplier catalogue importer for a shop whose database queries, thumbnail command, file storage, image downloads, settings merge and SKU checks each keep data separate from code, with a test per defence

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why building SQL, shell commands and paths from strings lets data become code, and use parameters, argument arrays and structured APIs instead
- Store and read back hostile-looking text through parameterized PGlite queries, and allow-list identifiers such as sort columns
- Confine user-supplied file names to a base folder with resolve, a separator-aware prefix check and realpath
- Allow-list outbound URLs by scheme and host, refuse private addresses at connection time, and explain DNS rebinding
- Explain request smuggling and why one strict HTTP parser prevents it
- Merge untrusted objects without prototype pollution and write regular expressions that run in linear time

## One import feature, seven ways out

Your shop is adding suppliers. A shop admin pastes the address of a supplier's catalogue, and the server does the rest:

1. It downloads the catalogue (JSON) and each product image from the supplier's servers.
2. It stores every product in PostgreSQL: name, SKU, price, description.
3. It runs a command-line image tool to make thumbnails.
4. It saves the files under an `uploads` folder, named after the supplier's file names.
5. It merges the supplier's display settings into the shop's defaults.
6. It checks every SKU with a regular expression.

Every one of those steps takes text that someone else wrote and hands it to something that *interprets* text: the SQL parser, the shell, the file system's path rules, the network, the JavaScript object model, the regular expression engine. And in front of all of it sits a seventh interpreter: the HTTP parser that decides where each request starts and ends.

An **injection** happens when data crosses into one of these interpreters and is read as instructions instead of as data. A product name that contains a quote character is ordinary data; if it is glued into a SQL string, the quote ends the string early and the rest of the name is read as SQL. The name did not change. What changed is that the code let the interpreter decide where the data ends.

So every defence in this lesson follows one rule: **keep data and code in separate channels**. Send the query and its values separately. Pass a program its arguments as a list, not a command line. Build paths from checked parts. Choose outbound hosts from a list you wrote. Where separation is impossible, **allow-list**: accept only values you have decided in advance are safe.

| Interpreter | What goes wrong | Safe pattern |
| --- | --- | --- |
| SQL database | Text is spliced into a query string | Parameterized queries; allow-listed identifiers |
| Shell | Text is spliced into a command line | `execFile` with an argument array, no shell |
| File system | A name contains path syntax | Server-chosen names, or resolve + prefix check + realpath |
| Network (outbound) | A URL points inside your own network | Scheme and host allow-list, private addresses refused at connect time |
| HTTP framing | Two servers disagree about where a request ends | One strict parser that rejects ambiguous requests |
| Object model | Special keys reach `Object.prototype` | Merges that skip `__proto__`, `constructor`, `prototype` |
| Regex engine | A pattern takes exponential time on some inputs | Length limits and patterns with one way to match |

Several earlier lessons touched these topics: safe paths in [Files, paths and your computer](https://zudojs.oyinlola.site/learn/node-apis#path), shell injection in [Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes#child-processes), prototype pollution in [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#pollution), catastrophic backtracking in [Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp#redos), and SSRF checks with @zudojs/security in [Security for every public API](https://zudojs.oyinlola.site/learn/zudo-security#ssrf). This lesson goes deeper into the defences, the edge cases that break naive versions of them, and how to test them. Every runnable example shows the safe pattern, and every test feeds it input that looks hostile and proves nothing bad happens.

REASON IT OUT

### Before you build the importer

Take the step "store every product in PostgreSQL" and think it through:

- Which parts of the `INSERT` statement are fixed by you, and which come from the supplier?
- Product names can legitimately contain apostrophes (`Mama's Kitchen Rice`), semicolons and words like `select` or `drop`. Should the importer reject such names?
- The admin can sort the product list by a column chosen in the URL. Can that column name be passed the same way as a value?
- Suppose one defence has a bug. What limits the damage?

**Show the reasoning**

The statement's shape (table, columns, keywords) is yours; the values (name, SKU, price, description) are the supplier's. Those two must never be mixed into one string. With a parameterized query the statement is sent with placeholders (`$1`, `$2`), and the values are sent separately. The database parses the statement before it ever sees a value, so a value cannot change the statement's structure.

Rejecting apostrophes would be wrong: they are real data, and "Mama's" is a real name. The goal is not to filter "dangerous" characters (a losing game, and one that corrupts legitimate data) but to make every character harmless by keeping it in the data channel.

A column name is part of the statement's structure, and placeholders can only stand for values. So identifiers need a different defence: an allow-list that maps the few sort options you support to column names you wrote.

If a defence fails anyway, **least privilege** limits the damage: the importer's database user can insert and read products, but cannot drop tables or read the users table. Defences are layered because each one will eventually have a bug.

## SQL: send values separately

Why is building SQL from strings unsafe? A SQL statement is a small program. When you write `"... WHERE name = '" + name + "'"`, the database receives one piece of text and has to work out, character by character, where your program ends and the data begins. The quote characters you typed are the only boundary markers, and the data can contain the same characters. Whoever controls the data can therefore move the boundary, and anything after it is parsed as SQL. Escaping quotes by hand is fragile (character sets, backslashes and numeric contexts all have their own rules), and it is easy to forget in one place out of a hundred.

A **parameterized query** (also called a prepared statement) removes the problem instead of patching it. PostgreSQL's protocol sends the statement text with numbered placeholders in one message, and the values in another. The statement is parsed first, so its structure is fixed before any value arrives; values are only ever values. In PGlite (PostgreSQL compiled to run inside Node.js, used throughout the database lessons) that is `db.query(text, values)`.

Here is the test the reasoning block asked for: a customer name with an apostrophe and a delivery note full of SQL words and punctuation, stored and read back:

db.js

```ts
import { PGlite } from "@electric-sql/pglite";

export async function openShopDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE customers (id serial PRIMARY KEY, name text NOT NULL, note text NOT NULL);
    CREATE TABLE products (
      sku text PRIMARY KEY,
      name text NOT NULL,
      price_kobo integer NOT NULL CHECK (price_kobo > 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return db;
}
```

params.jsNode.js only

```ts
import { openShopDb } from "./db.js";

const db = await openShopDb();
const name = "Chidi O'Neil";
const note = "Leave it at gate 2; DROP OFF after 5pm -- call first, don't SELECT the side door";

const inserted = await db.query("INSERT INTO customers (name, note) VALUES ($1, $2) RETURNING id", [name, note]);
console.log("rows inserted:", inserted.affectedRows);

const { rows } = await db.query("SELECT name, note FROM customers WHERE name = $1", [name]);
console.log("rows found:", rows.length);
console.log("name stored exactly:", rows[0].name === name);
console.log("note stored exactly:", rows[0].note === note);

const count = await db.query("SELECT count(*)::int AS n FROM customers");
console.log("customers in table:", count.rows[0].n);
```

Output of `node params.js`

```ts
rows inserted: 1
rows found: 1
name stored exactly: true
note stored exactly: true
customers in table: 1
```

Every character arrived as data: one row inserted, one found, both strings identical to the input, and the table still has exactly one customer. The apostrophe did not need escaping and the note did not need filtering.

PGlite also offers a tagged template, `db.sql\`… ${value} …\``, which turns every `${…}` into a placeholder for you. A tagged template is safe because the tag function receives the fixed text and the values separately; an ordinary template string (without the tag) glues them together and is exactly the unsafe pattern.

### Where placeholders are not enough

Three situations catch people who have learned "always use parameters":

- **LIKE patterns.** In `LIKE $1`, the value is safely a value, but inside it `%` and `_` are wildcards. A search for `50%` would also match `500g`. Escape the wildcard characters in the search term.
- **Identifiers.** Table names, column names and sort directions are structure. A placeholder cannot stand for them. Map the user's choice through an allow-list.
- **Lists.** For "any of these SKUs", do not build `IN ('a', 'b', …)` as text. Pass one array parameter: `sku = ANY($1)`.

search.jsNode.js only

```ts
import { openShopDb } from "./db.js";

const db = await openShopDb();
for (const [sku, name, price] of [
  ["RICE-5", "Rice 5kg, 50% extra free", 4_500_000],
  ["RICE-500", "Rice 500g", 120_000],
  ["BEANS_2", "Beans 2kg", 380_000],
]) {
  await db.query("INSERT INTO products (sku, name, price_kobo) VALUES ($1, $2, $3)", [sku, name, price]);
}

const escapeLike = (text) => text.replace(/[\\%_]/g, "\\$&");
async function search(term) {
  const { rows } = await db.query("SELECT sku FROM products WHERE name ILIKE $1 ESCAPE '\\' ORDER BY sku", [
    `%${escapeLike(term)}%`,
  ]);
  return rows.map((row) => row.sku);
}
console.log("search '50%':", await search("50%"));
console.log("search 'rice':", await search("rice"));

const SORTS = { price: "price_kobo", name: "name", newest: "created_at" };
async function list(sortKey, direction) {
  const column = Object.hasOwn(SORTS, sortKey) ? SORTS[sortKey] : "sku";
  const dir = direction === "desc" ? "DESC" : "ASC";
  const { rows } = await db.query(`SELECT sku FROM products ORDER BY ${column} ${dir}, sku`);
  return rows.map((row) => row.sku);
}
console.log("sort by price desc:", await list("price", "desc"));
console.log("unknown sort key:  ", await list("price_kobo; anything", "sideways"));

const wanted = ["RICE-5", "BEANS_2", "NOT-A-SKU"];
const found = await db.query("SELECT sku FROM products WHERE sku = ANY($1) ORDER BY sku", [wanted]);
console.log("any of the list:", found.rows.map((row) => row.sku));
```

Output of `node search.js`

```ts
search '50%': [ 'RICE-5' ]
search 'rice': [ 'RICE-5', 'RICE-500' ]
sort by price desc: [ 'RICE-5', 'BEANS_2', 'RICE-500' ]
unknown sort key:   [ 'BEANS_2', 'RICE-5', 'RICE-500' ]
any of the list: [ 'BEANS_2', 'RICE-5' ]
```

The sort column is the one place where text is put into the statement, and it is text you wrote: the user's input only chooses *which* of your strings is used. Unknown keys fall back to a default. `Object.hasOwn` matters here: `SORTS["constructor"]` would otherwise find a function inherited from `Object.prototype`.

### Other layers

- **Never pass user input to multi-statement APIs.** PGlite's `db.exec` (like many drivers' "simple query" functions) runs several statements and takes no parameters. Keep it for fixed migrations like `openShopDb`.
- **ORMs and query builders** parameterize for you, but all of them have a raw-SQL escape hatch. Treat every use of it like hand-written SQL.
- **Least privilege.** The application's database user should own only what it needs. Migrations run as a different user.

> CODE REVIEW
>
> Search for SQL built with `+` or untagged template strings containing `${`. Every value must be a parameter; every identifier must come from an allow-list; `LIKE` terms must have their wildcards escaped; raw-SQL helpers need a comment explaining why they are safe.

## Running programs without a shell

The importer makes thumbnails with a command-line tool. The unsafe way is to build a command line as one string and run it with `exec`, which hands the string to a **shell** (`/bin/sh` or `cmd.exe`). A shell is a programming language: spaces separate words, quotes group them, and characters such as `;`, `|`, `&`, `$`, backticks and redirections are instructions. A file name placed into that string is parsed by the shell's rules, so its characters can change what the command does. [Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes#child-processes) showed the problem; here is the defence in depth.

Operating systems start programs with an **argument array**, not a command line: the program receives a list of separate strings. A shell is just one way to produce that list from text. `execFile(program, args)` skips the shell and hands your array to the operating system directly, so each element arrives as exactly one argument, whatever characters it contains. There is nothing to parse, so there is nothing to inject into.

To see exactly what a program receives, here is a stand-in for the thumbnail tool that prints its arguments:

thumbnail-tool.js

```ts
// Stand-in for a real image tool: prints the arguments it received, one per line.
for (const [i, arg] of process.argv.slice(2).entries()) {
  console.log(`argv[${i}] = ${JSON.stringify(arg)}`);
}
```

run-tool.jsNode.js only

```ts
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const tool = fileURLToPath(new URL("./thumbnail-tool.js", import.meta.url));

async function makeThumbnail(inputName) {
  const { stdout } = await run(process.execPath, [tool, "--width", "200", "--", inputName], {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH },
  });
  return stdout.trimEnd();
}

console.log(await makeThumbnail("Chidi's rice (5kg); photo 2 & $HOME `final`.jpg"));
console.log(await makeThumbnail("-rf.jpg"));
```

Output of `node run-tool.js`

```ts
argv[0] = "--width"
argv[1] = "200"
argv[2] = "--"
argv[3] = "Chidi's rice (5kg); photo 2 & $HOME `final`.jpg"
argv[0] = "--width"
argv[1] = "200"
argv[2] = "--"
argv[3] = "-rf.jpg"
```

The whole name, with its apostrophe, semicolon, ampersand, dollar sign and backticks, arrived as *one* argument, byte for byte. Nothing was expanded, because no shell ever saw it. The options do the rest of the work:

- **`"--"`** is the usual "end of options" marker. A file name that starts with `-` (the second call) could otherwise be read as an option by the tool, a problem called **argument injection** that argument arrays alone do not prevent. Most command-line tools honour `--`; check the tool's documentation, or make sure names can never start with `-` (for example, prefix them with `./` or generate them yourself).
- **`timeout` and `maxBuffer`** stop a stuck or chatty process from tying up your server.
- **`env`** gives the child only what it needs, so your secrets in `process.env` are not inherited by a third-party tool.
- **The program is fixed.** Only arguments come from data; the program path is yours. If users may choose between tools, map their choice through an allow-list, like the SQL sort column.

> SHELL: TRUE BRINGS THE SHELL BACK
>
> Both `execFile` and `spawn` accept an option `shell: true`, which joins the arguments into a command line and runs it through the shell, bringing back every problem above. On Windows, `.bat` and `.cmd` files always run through `cmd.exe`; Node.js refuses to start them without `shell: true` for that reason. Prefer a real executable, or better, a library that does the job inside your process (an image library instead of an image command).

> CODE REVIEW
>
> Look for `exec`, `execSync`, `shell: true` and template strings passed to any child-process function. Data must only ever appear as separate elements of an argument array, after `--`, with a fixed program, a timeout and a minimal environment.

## Confining file paths to a folder

The importer saves images under `uploads/` using names from the supplier's catalogue. A file path is also a tiny language: `/` separates folders, `..` means "go up one level", and a leading `/` means "start at the root of the disk". If a name from outside is joined to your folder, those rules apply to it, and a name can walk out of the folder to read or overwrite files elsewhere. That is **path traversal**.

The strongest defence avoids the problem: **do not use outside names as file names at all**. Generate the file name yourself (an id, or a random value), store it, and keep the supplier's name in the database as a label. When a path must come from outside (serving files a user picked, for example), confine it:

1. **Resolve** it against the base folder with `path.resolve(base, name)`. That applies every `..` and `/` and gives the absolute path the file system would really use.
2. **Check the prefix**: the result must start with the base folder *plus a separator*. Without the separator, a base of `/srv/uploads` would also accept `/srv/uploads-old/…`, a sibling folder that merely starts with the same letters.
3. **Follow links**: a symbolic link inside the folder can point anywhere. Before opening, take the `realpath` (the path with every link followed) of both the file and the base, and check the prefix again.

confine.js

```ts
import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

/** Returns the absolute path inside baseDir, or null if the name would leave it. */
export function confine(baseDir, name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 255 || name.includes("\0")) return null;
  const base = resolve(baseDir);
  const full = resolve(base, name);
  return full.startsWith(base + sep) ? full : null;
}

/** Like confine, but also follows symbolic links. The file must exist. */
export async function confineExisting(baseDir, name) {
  const full = confine(baseDir, name);
  if (full === null) return null;
  try {
    const [realBase, realFull] = await Promise.all([realpath(baseDir), realpath(full)]);
    return realFull.startsWith(realBase + sep) ? realFull : null;
  } catch {
    return null;
  }
}
```

The test builds a small folder tree in a temporary directory, including a sibling folder with a similar name and a symbolic link that points out of `uploads`:

confine-test.jsNode.js only

```ts
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { confine, confineExisting } from "./confine.js";

const root = await mkdtemp(join(tmpdir(), "shop-"));
const uploads = join(root, "uploads");
await mkdir(join(uploads, "2026"), { recursive: true });
await mkdir(join(root, "uploads-old"));
await mkdir(join(root, "config"));
await writeFile(join(uploads, "RICE-5.jpg"), "image");
await writeFile(join(uploads, "2026", "BEANS-2.jpg"), "image");
await writeFile(join(root, "config", "app.env"), "DATABASE_URL=...");
await symlink(join(root, "config", "app.env"), join(uploads, "linked.jpg"));

const names = [
  "RICE-5.jpg",
  "2026/BEANS-2.jpg",
  "2026/../RICE-5.jpg",
  "../config/app.env",
  "../uploads-old/RICE-5.jpg",
  join(root, "config", "app.env"),
  "RICE-5.jpg\0.png",
  "",
  "linked.jpg",
];
for (const name of names) {
  const shown = JSON.stringify(name.replace(root, "<root>"));
  const lexical = confine(uploads, name);
  const real = await confineExisting(uploads, name);
  const verdict = real ? `ok: ${relative(uploads, real)}` : lexical ? "refused: link leaves the folder" : "refused";
  console.log(shown.padEnd(30), verdict);
}
await rm(root, { recursive: true, force: true });
```

Output of `node confine-test.js`

```ts
"RICE-5.jpg"                   ok: RICE-5.jpg
"2026/BEANS-2.jpg"             ok: 2026/BEANS-2.jpg
"2026/../RICE-5.jpg"           ok: RICE-5.jpg
"../config/app.env"            refused
"../uploads-old/RICE-5.jpg"    refused
"<root>/config/app.env"        refused
"RICE-5.jpg\u0000.png"         refused
""                             refused
"linked.jpg"                   refused: link leaves the folder
```

- `2026/../RICE-5.jpg` is accepted: it goes up and back down, and ends inside the folder. Confinement checks where a path *ends up*, not whether it contains `..`. Searching the text for `..` would refuse legitimate names and miss other tricks.
- `../uploads-old/RICE-5.jpg` resolves to a path that begins with the letters `…/uploads`; only the separator in the prefix check refuses it.
- An absolute path and a name containing a NUL character (`\0`) are refused. Node.js's file functions also throw on NUL, but refusing early gives one clear error path.
- `linked.jpg` passes the text check (it is a name inside the folder) and is refused by `realpath`. Links can also be swapped between your check and your `open`; for folders that other people can write to, open the file first and then check the opened file, or do not allow links at all.

On Windows, paths are case-insensitive and have drive letters, and `path.resolve` handles both, which is one more reason to use it instead of your own string checks.

> CODE REVIEW
>
> Any `path.join` or `path.resolve` with request or file data needs a confinement check with a separator-aware prefix, and `realpath` if links are possible. Better still, ask whether the name needs to come from outside at all.

## Outbound URLs: server-side request forgery

The importer downloads whatever catalogue URL an admin pastes, and whatever image URLs the catalogue lists. Your server runs *inside* your network, next to things the internet cannot reach: databases, admin panels, and the cloud provider's metadata service, which hands out the server's own credentials. When outside data decides where your server sends requests, someone can use your server to reach those internal places. That is **server-side request forgery** (SSRF).

The defence has four parts. Each closes a gap the previous one leaves open:

1. **Allow-list scheme and host.** Accept `https` only, on the default port, with no user name or password in the URL, and only for hosts on a list you maintain (your suppliers' catalogue hosts). An allow-list of what is expected is far stronger than a deny-list of what is dangerous, because you cannot list every dangerous thing.
2. **Refuse private addresses.** Even an allowed name can resolve (through DNS) to an internal address, by mistake or because someone controls that name's DNS. Check every address the name resolves to, and refuse loopback, private, link-local and other special ranges.
3. **Check at connection time.** If you look the name up, check the answer, and then let the HTTP client look it up *again* to connect, the second answer can differ from the first. A DNS server that answers "public address" to the check and "internal address" a moment later is called **DNS rebinding**. The fix is to make the check and the connection use the same lookup: the address that was checked is the address that is dialled.
4. **Do not follow redirects blindly.** An allowed host can answer "moved to" an internal URL. Turn redirects off, or run every hop through steps 1 to 3 again. Add a timeout and a maximum response size.

outbound.js

```ts
import { lookup as dnsLookup } from "node:dns";
import { BlockList } from "node:net";

export const ALLOWED_HOSTS = new Set(["catalogue.supplier-one.example", "images.supplier-one.example"]);

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
]) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]]) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** Step 1: returns null if the URL may be fetched, or the reason it may not. */
export function checkUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return "not a URL";
  }
  if (url.protocol !== "https:") return "only https is allowed";
  if (url.username !== "" || url.password !== "") return "credentials in URL";
  if (url.port !== "") return "non-default port";
  if (!ALLOWED_HOSTS.has(url.hostname)) return "host not on the allow-list";
  return null;
}

/** Step 2: true if an address is public. */
export function isPublicAddress(address, family) {
  return !blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

/** Step 3: a lookup function for http.request/https.request that refuses private answers. */
export function guardedLookup(resolve = defaultResolve) {
  return (hostname, options, callback) => {
    resolve(hostname).then((addresses) => {
      const bad = addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address, a.family));
      if (bad) {
        const error = new Error(`refused to connect to ${hostname}: private or missing address`);
        error.code = "ERR_OUTBOUND_BLOCKED";
        return callback(error);
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    }, callback);
  };
}

function defaultResolve(hostname) {
  return new Promise((resolve, reject) =>
    dnsLookup(hostname, { all: true }, (error, addresses) => (error ? reject(error) : resolve(addresses))),
  );
}
```

First, the URL rules. Only the first URL passes:

check-urls.jsNode.js only

```ts
import { checkUrl } from "./outbound.js";

for (const url of [
  "https://catalogue.supplier-one.example/products.json",
  "http://catalogue.supplier-one.example/products.json",
  "https://catalogue.supplier-one.example:8443/products.json",
  "https://ada@catalogue.supplier-one.example/products.json",
  "https://admin.shop.internal/",
  "file:///etc/hostname",
  "catalogue.supplier-one.example/products.json",
]) {
  console.log((checkUrl(url) ?? "allowed").padEnd(28), url);
}
```

Output of `node check-urls.js`

```ts
allowed                      https://catalogue.supplier-one.example/products.json
only https is allowed        http://catalogue.supplier-one.example/products.json
non-default port             https://catalogue.supplier-one.example:8443/products.json
credentials in URL           https://ada@catalogue.supplier-one.example/products.json
host not on the allow-list   https://admin.shop.internal/
only https is allowed        file:///etc/hostname
not a URL                    catalogue.supplier-one.example/products.json
```

Then the address rules, fed with the answers a DNS server might give for an allowed name. The test uses a fake resolver so it does not depend on the network:

check-addresses.jsNode.js only

```ts
import { isPublicAddress } from "./outbound.js";

for (const [address, family] of [
  ["203.0.113.40", 4],
  ["10.0.0.8", 4],
  ["127.0.0.1", 4],
  ["169.254.169.254", 4],
  ["172.20.1.1", 4],
  ["::1", 6],
  ["::ffff:127.0.0.1", 6],
  ["fd12:3456::1", 6],
  ["2001:db8::1", 6],
]) {
  console.log(address.padEnd(18), isPublicAddress(address, family) ? "public" : "refused");
}
```

Output of `node check-addresses.js`

```ts
203.0.113.40       public
10.0.0.8           refused
127.0.0.1          refused
169.254.169.254    refused
172.20.1.1         refused
::1                refused
::ffff:127.0.0.1   refused
fd12:3456::1       refused
2001:db8::1        public
```

`::ffff:127.0.0.1` is an IPv4 address written in IPv6 form; `BlockList` understands that it is the loopback address. The documentation ranges `203.0.113.0/24` and `2001:db8::/32` count as public here because they are only used in examples; a production list should come from a maintained source and include every special-purpose range your network uses.

Finally, the connection-time check. A local HTTP server plays an internal service. The fake DNS answers "127.0.0.1" for an allowed supplier host, which is what a rebinding DNS server would do. The request goes through `guardedLookup`, which is called by the HTTP client at the moment it connects:

rebinding-test.jsNode.js only

```ts
import { once } from "node:events";
import { createServer, get } from "node:http";
import { guardedLookup } from "./outbound.js";

let internalHits = 0;
const internal = createServer((req, res) => {
  internalHits++;
  res.end("internal data");
});
internal.listen(0, "127.0.0.1");
await once(internal, "listening");

const fakeDns = async (hostname) =>
  hostname === "images.supplier-one.example" ? [{ address: "127.0.0.1", family: 4 }] : [];

const url = `http://images.supplier-one.example:${internal.address().port}/RICE-5.jpg`;
const outcome = await new Promise((resolve) => {
  const request = get(url, { lookup: guardedLookup(fakeDns), agent: false, timeout: 5_000 }, (res) => {
    res.resume();
    resolve(`connected: ${res.statusCode}`);
  });
  request.on("error", (error) => resolve(`refused: ${error.code}`));
});
console.log(outcome);
console.log("requests that reached the internal service:", internalHits);
internal.close();
```

Output of `node rebinding-test.js`

```ts
refused: ERR_OUTBOUND_BLOCKED
requests that reached the internal service: 0
```

The request never left: the lookup refused the address, so no connection was made and the internal service saw nothing. (The test uses `http` and a port so it can target a local server; in the importer, `checkUrl` would already have refused both.) Because the check lives *inside* the lookup the client uses to connect, there is no second lookup for a rebinding DNS server to answer differently.

`fetch` in Node.js has no `lookup` option. You get the same effect by giving it a custom dispatcher whose connector uses a checked lookup (the undici package's `Agent` with `connect: { lookup }`), or by using `http.request`/`https.request` as above. With `fetch`, also pass `redirect: "manual"` or `"error"`. [@zudojs/security](https://zudojs.oyinlola.site/learn/zudo-security#ssrf) provides `isSafeUrl` and `isPrivateHostname` for steps 1 and 2.

At the network level, add a second layer that does not depend on your code at all: run the importer where outbound traffic can only reach the internet (an egress proxy or firewall rules), and require a token for the cloud metadata service (for example IMDSv2 on AWS).

> CODE REVIEW
>
> Every outbound request whose URL, host or path is influenced by data should go through one function that applies the allow-list, refuses private addresses in the connection's own lookup, and disables or re-checks redirects, with a timeout and a size limit.

## Ambiguous HTTP: request smuggling

HTTP/1.1 sends requests one after another over the same connection, so every server must work out where one request's body ends and the next request begins. There are two ways to say it: a `Content-Length` header gives the body's size in bytes, and `Transfer-Encoding: chunked` says the body comes in pieces, each prefixed with its size, ending with an empty piece. The standard says a request must not use both, and must not repeat `Content-Length` with different values.

Most sites have more than one HTTP parser in a row: a load balancer, a CDN or a reverse proxy in front, and your Node.js server behind. If the front server and the back server read an ambiguous request differently (one trusts `Content-Length`, the other `Transfer-Encoding`), they disagree about where the request ends. Bytes that the front server considered part of one request's body are, for the back server, the start of a *new* request, which the front server never inspected. That is **request smuggling**: a request slipped past the front server's checks, and possibly attached to another user's connection.

```ts
               one ambiguous request
 client  ───────────────────────────────►  proxy: "body ends HERE ▲"
                                              │  forwards everything
                                              ▼
                                           app server: "body ends here ▲,
                                                        and the rest is a new request"
```

Two parsers, two answers to "where does this request end?". Any bytes they disagree about are a request only one of them has seen.

The defence is not in your route handlers; it is in how requests are parsed:

- **One strict parser.** Every server in the chain must reject ambiguous framing (both headers, conflicting lengths, malformed chunk sizes) with `400` and close the connection, instead of guessing. If no server guesses, they cannot guess differently.
- **Keep Node.js's strict parser on.** Node.js's HTTP parser (llhttp) is strict by default. The `insecureHTTPParser` option and the `--insecure-http-parser` flag turn leniency on; they exist for broken legacy clients and should not appear in your code.
- **Keep the proxy updated and strict**, prefer HTTP/2 from the proxy to your server where supported (it frames requests in binary and has no such ambiguity), and let the proxy normalise requests rather than pass odd ones through.

You can test the first property directly: send your server requests with ambiguous framing over a raw socket and check that each one is refused. The requests below contain no hidden second request; they only check that the parser refuses to guess:

framing-test.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";
import { connect } from "node:net";

let handled = 0;
const server = createServer((req, res) => {
  handled++;
  req.resume();
  req.on("end", () => res.end("order received\n"));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");

function send(head, body = "") {
  return new Promise((resolve) => {
    const socket = connect(server.address().port, "127.0.0.1", () => socket.end(`${head}\r\n\r\n${body}`));
    let reply = "";
    socket.on("data", (chunk) => (reply += chunk));
    socket.on("close", () => resolve(reply.split("\r\n")[0] || "(no response)"));
  });
}

const start = "POST /orders HTTP/1.1\r\nHost: shop.test\r\nConnection: close";
console.log("normal request:        ", await send(`${start}\r\nContent-Length: 2`, "{}"));
console.log("both length headers:   ", await send(`${start}\r\nContent-Length: 5\r\nTransfer-Encoding: chunked`, "0\r\n\r\n"));
console.log("two different lengths: ", await send(`${start}\r\nContent-Length: 2\r\nContent-Length: 3`, "{}"));
console.log("no Host header:        ", await send("POST /orders HTTP/1.1\r\nConnection: close\r\nContent-Length: 2", "{}"));
console.log("requests handled:", handled);
server.close();
```

Output of `node framing-test.js`

```ts
normal request:         HTTP/1.1 200 OK
both length headers:    HTTP/1.1 400 Bad Request
two different lengths:  HTTP/1.1 400 Bad Request
no Host header:         HTTP/1.1 400 Bad Request
requests handled: 1
```

Only the well-formed request reached the handler. The ambiguous ones were refused by the parser before any of your code ran, and so was the request without a `Host` header (HTTP/1.1 requires one, and Node.js enforces it by default with the `requireHostHeader` option). A test like this belongs in the suite of any service that sits behind a proxy, together with the same test run through the proxy in a staging environment.

> CODE REVIEW
>
> Search for `insecureHTTPParser`, `--insecure-http-parser` and custom HTTP parsing code. Proxy configuration changes deserve the same review as code: they are the other half of the parsing chain.

## Merging objects safely: prototype pollution

The importer merges the supplier's display settings (JSON) into the shop's defaults. [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#pollution) explained why a naive deep merge is dangerous: `JSON.parse` creates an ordinary own property named `"__proto__"`, and a merge that then writes `target["__proto__"][key]` is writing to `Object.prototype`, which every object in the program inherits from. Afterwards, a check such as `if (user.isAdmin)` can find a property that no user object ever had. The same happens through the key path `constructor.prototype`.

In backend code, the pattern shows up in more places than hand-written merges: helpers that set a value by a dotted path (`set(settings, "display.theme", value)`) with a path from the request, query-string parsers that build nested objects from names like `filter[price][max]`, and configuration loaders that combine several files. The defence is the same everywhere:

- Skip the keys `__proto__`, `constructor` and `prototype` whenever keys come from data.
- Only walk into **own** properties (`Object.hasOwn`), and only into plain objects.
- Build objects keyed by data with `Object.create(null)` or a `Map`, so there is no prototype to reach.
- Best of all, validate first with a strict schema ([Types are not security](https://zudojs.oyinlola.site/learn/ts-security#validate)) and copy only known fields.

safe-merge.js

```ts
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const isPlainObject = (value) =>
  typeof value === "object" && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Deep-merges source into a copy of target. Ignores forbidden keys and inherited properties. */
export function safeMerge(target, source, depth = 0) {
  if (depth > 10) throw new Error("settings nested too deeply");
  const result = Object.assign(Object.create(null), target);
  for (const key of Object.keys(source)) {
    if (FORBIDDEN.has(key)) continue;
    const value = source[key];
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? safeMerge(result[key], value, depth + 1)
      : value;
  }
  return result;
}

/** Sets a value by a dotted path such as "display.theme". Returns false for forbidden paths. */
export function setByPath(target, path, value) {
  const parts = path.split(".");
  if (parts.length > 10 || parts.some((part) => part === "" || FORBIDDEN.has(part))) return false;
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!Object.hasOwn(node, part) || !isPlainObject(node[part])) node[part] = Object.create(null);
    node = node[part];
  }
  node[parts.at(-1)] = value;
  return true;
}
```

merge-test.jsNode.js only

```ts
import { safeMerge, setByPath } from "./safe-merge.js";

const defaults = { display: { theme: "light", perPage: 20 }, currency: "NGN" };
const supplierJson =
  '{"display":{"theme":"dark","__proto__":{"isAdmin":true}},"constructor":{"prototype":{"isAdmin":true}},"__proto__":{"isAdmin":true}}';

const settings = safeMerge(defaults, JSON.parse(supplierJson));
console.log(JSON.stringify(settings));
console.log("every object isAdmin?", ({}).isAdmin, "| settings.isAdmin:", settings.isAdmin);

const prefs = Object.create(null);
console.log(setByPath(prefs, "display.perPage", 50), JSON.stringify(prefs));
console.log(setByPath(prefs, "__proto__.isAdmin", true), setByPath(prefs, "constructor.prototype.isAdmin", true));
console.log("after path attempts:", ({}).isAdmin, Object.prototype.hasOwnProperty.call(Object.prototype, "isAdmin"));
```

Output of `node merge-test.js`

```json
{"display":{"theme":"dark","perPage":20},"currency":"NGN"}
every object isAdmin? undefined | settings.isAdmin: undefined
true {"display":{"perPage":50}}
false false
after path attempts: undefined false
```

The supplier's real setting (`theme: "dark"`) was merged; every forbidden key was ignored at every depth; and a fresh `{}` still has no `isAdmin`. The result objects have a `null` prototype, so even a key that slipped through would have no prototype to write into. The depth limit stops a deeply nested document from exhausting the stack.

### Hardening the whole process

Two process-wide switches make pollution much harder even if a dependency has the bug. `node --disable-proto=delete` removes the `__proto__` accessor from `Object.prototype`, and `Object.freeze(Object.prototype)` at startup makes the shared prototype unchangeable. Both can break old libraries that rely on these features, so turn them on with a full test run, but they are worth trying on a new service.

> CODE REVIEW
>
> Any code that copies keys from data into objects (merges, path setters, query parsers, `Object.assign` into shared objects) must skip `__proto__`, `constructor` and `prototype`, walk only own properties, and have a test that `({}).polluted` stays `undefined`.

## Regular expressions that run in linear time

Every SKU in the catalogue goes through a regular expression. JavaScript's regex engine is a backtracking engine: when a match fails, it goes back and tries other ways to split the text among the pattern's parts. For most patterns there are few ways. But a pattern that offers *many* ways to match the same text (the classic shapes are a repeated group that itself repeats, and alternatives that overlap) can make the engine try an exponential number of splits on an input that almost matches. Node.js runs your JavaScript on one thread ([The event loop](https://zudojs.oyinlola.site/learn/js-event-loop)), so one such match can freeze the whole server for every user. This is **ReDoS**, regular-expression denial of service. [Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp#redos) showed the problem; here is how to design patterns that cannot have it.

Rules for a **linear-time** pattern, one where the time grows in proportion to the input length:

- **Limit the length first.** Check `text.length` before matching. A SKU is never 5,000 characters. This alone caps the worst case of any pattern.
- **Anchor it** with `^` and `$`, so the engine does not retry from every starting position.
- **Give every piece of text exactly one way to match.** Make each repetition begin with a character the previous part cannot consume: `^[A-Z]+(?:-[A-Z0-9]+)*$` (every repeat starts with `-`, which `[A-Z0-9]` cannot match) rather than a group that repeats a repeating class.
- **Bound repetitions** where the format allows: `[A-Z]{2,10}` instead of `[A-Z]+`.
- **Do not build patterns from user text.** If you must search for user text, escape it with `RegExp.escape`, or do not use a regex at all (`includes`, `startsWith`, `split`).
- **For patterns you do not control**, use an engine with a linear-time guarantee, such as the `re2` package.

sku.js

```ts
const SKU = /^[A-Z]{2,10}(?:-[A-Z0-9]{1,10}){0,4}$/;
const MAX_SKU_LENGTH = 40;

function checkSku(text) {
  if (typeof text !== "string") return "not text";
  if (text.length > MAX_SKU_LENGTH) return "too long";
  return SKU.test(text) ? "ok" : "bad format";
}

for (const sku of ["RICE-5", "RICE-5KG-BAG", "rice-5", "RICE--5", "RICE-5-", "A".repeat(50)]) {
  console.log(sku.padEnd(14).slice(0, 14), checkSku(sku));
}

const nearMiss = "RICE" + "-AAAAAAAAAA".repeat(20_000) + "!";
const start = performance.now();
const matched = /^[A-Z]+(?:-[A-Z0-9]+)*$/.test(nearMiss);
const elapsed = performance.now() - start;
console.log(`unbounded pattern on ${nearMiss.length} characters: matched=${matched}, under 100 ms: ${elapsed < 100}`);

const term = "₦5,000 (promo)";
const note = "Use code SAVE for ₦5,000 (promo) until Friday";
console.log("literal search:", new RegExp(RegExp.escape(term)).test(note));
```

Output of `node sku.js` and of the browser terminal

```ts
RICE-5         ok
RICE-5KG-BAG   ok
rice-5         bad format
RICE--5        bad format
RICE-5-        bad format
AAAAAAAAAAAAAA too long
unbounded pattern on 220005 characters: matched=false, under 100 ms: true
literal search: true
```

The timing line is the test that matters. Even the unbounded version of the pattern (no length limit, no `{…}` bounds) finished a 220,000-character near-miss quickly, because each repetition must start with `-`, so there is only one way to split the text and a failure is found in one pass. The production version adds the length check and the bounds anyway: defence in depth, and a clear error message for the user. `RegExp.escape` turns the user's search term into a pattern that matches only that literal text; brackets, commas and the naira sign lose any special meaning.

Pattern checks belong in tests too. For every regex that sees outside input, add a test with a long input that *almost* matches and assert that it finishes quickly, as above. Linters such as `eslint-plugin-regexp` can flag risky shapes in review, and a request-level timeout plus a body size limit keeps one slow request from taking the service down.

> CODE REVIEW
>
> Every regex applied to outside input needs a length check before it, anchors, and repetitions that cannot overlap. Any `new RegExp(…)` built from data must use `RegExp.escape` or be replaced by a plain string method.

## Testing the defences

Each section ended with a test that feeds hostile-looking input to the safe code. Collected, they form a pattern you can reuse for any interpreter your code talks to:

| Defence | Test input | Assertion |
| --- | --- | --- |
| Parameterized SQL | Text with quotes, semicolons and SQL words | Stored value equals the input exactly; row counts are what you expect |
| Allow-listed identifiers | Unknown sort keys, inherited names like `constructor` | The default is used |
| Argument arrays | Names with spaces, quotes, shell characters, a leading dash | The program receives each as one literal argument |
| Path confinement | `..` segments, absolute paths, similar sibling folders, NUL, links | Refused, and legitimate nested names accepted |
| Outbound allow-list | Other schemes, ports, hosts, credentials, private DNS answers | Refused before connecting; the internal service sees no request |
| Strict HTTP parsing | Both length headers, conflicting lengths, missing Host | `400`, handler never runs |
| Safe merge | `__proto__`, `constructor.prototype` at several depths | `({}).isAdmin` stays `undefined` |
| Linear regex | Very long near-matches | Finishes within a time budget |

Two habits make these tests trustworthy. First, test that **legitimate** input still works (an apostrophe in a name, a nested folder, a real supplier host), because a defence that refuses real data will be switched off by the next frustrated developer. Second, run the whole set on every change: injection bugs are usually introduced by a small later edit ("just add a sort option", "just allow one more host"), not by the original author.

## A code-review checklist

| Look for | Ask |
| --- | --- |
| SQL strings with `+` or `${` | Are all values parameters? Identifiers from an allow-list? `LIKE` wildcards escaped? No user data in multi-statement calls? |
| `exec`, `shell: true`, child processes | Fixed program, argument array, `--` before data, timeout, minimal `env`? Could a library replace the command? |
| `path.join`/`resolve` with data | Separator-aware prefix check? `realpath` when links are possible? Could the server choose the name instead? |
| Outbound requests | Scheme and host allow-list, private addresses refused in the connection's lookup, redirects off or re-checked, timeout and size limit? |
| HTTP server and proxy settings | No `insecureHTTPParser`? Proxy up to date and strict? |
| Merges and path setters | Forbidden keys skipped, own properties only, null-prototype results, depth limit? |
| Regular expressions | Length check first, anchored, non-overlapping repetitions, no patterns built from data? |
| Tests | Hostile-looking input for each defence, and legitimate input that must still work? |

## In production

- **Least privilege everywhere.** A database user without `DROP`, a process user that cannot read `/etc` or your secrets folder, a network that cannot reach internal services from the importer. Each limits what a missed injection can do.
- **A web application firewall is a layer, not a fix.** WAFs match known attack patterns in requests. They catch some attacks, miss others, and sometimes block legitimate data (such as the delivery note above). Fix the code; treat the WAF as an extra net.
- **Keep dependencies patched.** Many real injection bugs live in libraries: query builders, merge utilities, URL parsers, proxies. Automated dependency updates and advisories (`npm audit`, Dependabot) matter as much as your own code.
- **Log refusals.** Refused paths, blocked outbound hosts and rejected requests are signals. A spike often means someone is probing.
- **Use shared building blocks.** In ZudoJS, [@zudojs/security](https://zudojs.oyinlola.site/learn/zudo-security) provides URL and host checks, body limits and unsafe-key detection, and [@zudojs/database](https://zudojs.oyinlola.site/learn/zudo-database) runs parameterized queries. One well-tested implementation beats ten hand-written ones.

## Practice

TRY IT YOURSELF

### An invoice download route

Customers download invoices at `GET /invoices/:id`, where files are stored as `invoices/INV-1042.pdf`. Write `invoicePath(id)` that avoids path traversal without using `confine` at all, and explain why it is safe. Then say what else the route must check before sending the file.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`INVOICE_ID.test(id)` is your whole validity check; nothing else needs to inspect the id's characters one by one.

HINT 2

`if (typeof id !== "string" || !INVOICE_ID.test(id)) return null; return join("invoices", \`${id}.pdf\`);`

SOLUTION

invoice-path.jsNode.js only

```ts
import { join } from "node:path";

const INVOICE_ID = /^INV-\d{1,10}$/;

function invoicePath(id) {
  if (typeof id !== "string" || !INVOICE_ID.test(id)) return null;
  return join("invoices", `${id}.pdf`);
}

for (const id of ["INV-1042", "INV-1042/../../config", "../INV-1042", "INV-", "inv-1042"]) {
  console.log(JSON.stringify(id).padEnd(26), invoicePath(id));
}
```

Output of `node invoice-path.js`

```ts
"INV-1042"                 invoices/INV-1042.pdf
"INV-1042/../../config"    null
"../INV-1042"              null
"INV-"                     null
"inv-1042"                 null
```

The id is checked against an anchored pattern that allows only `INV-` and digits, and the server builds the file name itself. No accepted id can contain `/`, `.` or `\`, so path syntax never reaches the file system; this is the "server chooses the name" defence. The route must also check **authorization**: that the invoice belongs to the logged-in customer (return `404` otherwise, so ids cannot be probed). Path safety says the file is inside the folder, not that this user may read it.

TRY IT YOURSELF

### Safe product search with several filters

Write `searchProducts(db, filters)` using the `products` table from this lesson. `filters` may contain `text` (a substring of the name), `maxPriceKobo` (a whole number) and `skus` (an array). Build the `WHERE` clause from fixed fragments and numbered placeholders only, and test it with a search term containing `%` and an apostrophe.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Each filter is independent: `if (typeof filters.text === "string" && filters.text.length <= 100) where.push(...)`, then a separate `if` for each of the other two.

HINT 2

`where.push(\`name ILIKE ${param(\`%${filters.text.replace(/[\\%_]/g, "\\$&")}%\`)} ESCAPE '\\'\`)`; `where.push(\`price_kobo <= ${param(filters.maxPriceKobo)}\`)`; `where.push(\`sku = ANY(${param(filters.skus.map(String))})\`)`.

SOLUTION

filters.jsNode.js only

```ts
import { openShopDb } from "./db.js";

async function searchProducts(db, filters) {
  const where = [];
  const values = [];
  const param = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (typeof filters.text === "string" && filters.text.length <= 100) {
    where.push(`name ILIKE ${param(`%${filters.text.replace(/[\\%_]/g, "\\$&")}%`)} ESCAPE '\\'`);
  }
  if (Number.isInteger(filters.maxPriceKobo)) where.push(`price_kobo <= ${param(filters.maxPriceKobo)}`);
  if (Array.isArray(filters.skus)) where.push(`sku = ANY(${param(filters.skus.map(String))})`);
  const sql = `SELECT sku FROM products${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY sku`;
  const { rows } = await db.query(sql, values);
  return rows.map((row) => row.sku);
}

const db = await openShopDb();
for (const [sku, name, price] of [
  ["RICE-5", "Mama's Rice 5kg, 50% extra", 4_500_000],
  ["RICE-500", "Rice 500g", 120_000],
  ["OIL-1", "Mama's Palm Oil 1L", 250_000],
]) {
  await db.query("INSERT INTO products (sku, name, price_kobo) VALUES ($1, $2, $3)", [sku, name, price]);
}

console.log(await searchProducts(db, { text: "mama's" }));
console.log(await searchProducts(db, { text: "50%" }));
console.log(await searchProducts(db, { text: "rice", maxPriceKobo: 1_000_000 }));
console.log(await searchProducts(db, { skus: ["OIL-1", "RICE-5"], maxPriceKobo: "cheap" }));
```

Output of `node filters.js`

```json
[ 'OIL-1', 'RICE-5' ]
[ 'RICE-5' ]
[ 'RICE-500' ]
[ 'OIL-1', 'RICE-5' ]
```

The SQL text is assembled only from fragments you wrote and placeholder numbers; every value, including the apostrophe in `mama's`, travels as a parameter. A `maxPriceKobo` that is not a whole number is ignored rather than passed along (a stricter API would answer `400`). This is how query builders work inside.

TRY IT YOURSELF

### Allow a second supplier, safely

A new supplier serves images from `cdn.supplier-two.example`. A colleague proposes changing the host check to `url.hostname.endsWith("supplier-two.example")` "so all their subdomains work". What is wrong with that, and what would you do instead?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Could someone register a completely different domain that also ends with the same characters as `supplier-two.example`, with nothing in front of it but more letters?

HINT 2

Compare a pattern-based check with adding the one exact host you actually need to an allow-list. Which one is easy to review at a glance?

SOLUTION

`endsWith("supplier-two.example")` also matches `evil-supplier-two.example`, a completely different domain that anyone could register, because there is no dot in front. Even `endsWith(".supplier-two.example")` trusts every subdomain the supplier has now or will ever have, including forgotten ones that could be taken over. Add the exact host `cdn.supplier-two.example` to `ALLOWED_HOSTS`, preferably from configuration, and add a test that the lookalike host is refused. Exact matches are easy to review; patterns are where allow-lists quietly turn into deny-lists.

## Summary

- Injection is data read as instructions by an interpreter. The cure is to keep data and code in separate channels, and to allow-list where separation is impossible. Filtering "bad characters" is not a defence.
- SQL: parameterized queries (`$1` with a values array, or a tagged template); allow-listed identifiers; escaped `LIKE` wildcards; `= ANY($1)` for lists; least-privilege database users.
- Programs: `execFile` with an argument array, no shell, `--` before data, a fixed program, a timeout and a minimal environment.
- Paths: let the server choose names; otherwise `resolve`, check the prefix with a separator, and `realpath` to follow links.
- SSRF: allow-list scheme and host, refuse private addresses inside the connection's own lookup (which defeats DNS rebinding), and do not follow redirects blindly.
- Request smuggling: ambiguous framing must be rejected by one strict parser in every hop; never enable the insecure parser.
- Prototype pollution: skip `__proto__`, `constructor` and `prototype`, walk own properties only, use null-prototype objects.
- ReDoS: length limits first, anchored patterns whose repetitions cannot overlap, `RegExp.escape` for user text, and a timing test on long near-matches.

Next: [Cryptography for developers](https://zudojs.oyinlola.site/learn/sec-crypto), where you choose between hashing, HMAC, encryption and signatures, and learn to manage and rotate the keys that protect everything else.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
