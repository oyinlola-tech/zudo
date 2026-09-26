---
title: "Documentation as data with @zudojs/docs — ZudoJS Academy"
description: "Turn the Task API's Markdown docs into checked data with @zudojs/docs: documents, frontmatter, a registry, link and navigation checks, and generated output."
source: https://zudojs.oyinlola.site/learn/zudo-docs
---

LEVEL 14 · LESSON 14 OF 18

Quality and insight Advanced

# Documentation as data with @zudojs/docs

Turn the Task API's Markdown docs into checked data with @zudojs/docs: documents, frontmatter, a registry, link and navigation checks, and generated output.

- **50 min** to read and try
- **You need:** The lessons on errors, testing and the Task API, and Markdown basics
- **You build:** A docs pipeline for the Task API that loads Markdown files, validates links and navigation in CI, generates an error reference from code, and builds a public index and search file

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Model documentation pages as documents with stable ids, categories and visibility
- Parse and write frontmatter safely
- Validate documents, links and navigation, and fail CI on warnings you care about
- Build breadcrumbs, page order and a search index from one navigation tree
- Generate reference pages from code and publish only public pages

## Docs that lie

The Task API has a `docs/` folder of Markdown files, and a small script turns every file into a page on the public website. It worked for months. Then three things happened in the same week:

- Someone renamed `session.md` to `sessions.md`. The "Getting started" page still links to the old name, and new users land on a 404.
- An on-call engineer added `internal/runbook.md` for the team. The script published it, and it showed up in the public search.
- The error table in the docs still says 403 for a code the API now answers with 404.

Here is that script, cut down. Nothing in it can notice any of the three problems:

naive-build.js

```ts
const pages = new Map([
  ["guides/start.md", "# Getting started\n\nFirst [log in](./auth/login), then read [sessions](./auth/session)."],
  ["guides/auth/login.md", "# Logging in\n\nSend your email and password."],
  ["guides/auth/sessions.md", "# Sessions and tokens\n\nA session ends after 30 idle minutes."],
  ["internal/runbook.md", "# On-call runbook\n\nThe mail provider's admin login is in the team vault."],
]);

// A tiny site build: every file becomes a public page.
for (const [path, text] of pages) {
  const url = "/" + path.replace(/\.md$/, "");
  const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  console.log(links.length === 0 ? `published ${url}` : `published ${url} with links ${links.join(", ")}`);
}
console.log("build finished without errors");
```

Output of `node naive-build.js` and of the browser terminal

```ts
published /guides/start with links ./auth/login, ./auth/session
published /guides/auth/login
published /guides/auth/sessions
published /internal/runbook
build finished without errors
```

The build "finished without errors" because, to this script, docs are just text. Code has a compiler and tests that fail when something is wrong; the docs had nothing. The fix is the same idea you applied to code: give the docs a **structure**, then check that structure automatically on every change. People call this **docs as code**.

`@zudojs/docs` gives you the pieces: a **document model** (every page is an object with an id, a title and typed metadata), **frontmatter** parsing, a **registry** that holds every page, **validators** for documents, links and navigation, **navigation** helpers and **generators** for Markdown and JSON output. It does not render HTML or host a website; it is the checked layer between your Markdown files and whatever site generator you use.

Terminal on your computer

```bash
$ npm install @zudojs/docs
```

## Documents

A **document** is one page. Its `id` is a stable, dot-separated name such as `guides.auth.login`. The id is what links, navigation and URLs use. The title can change freely; the id should not, because every link to the page depends on it. `createMarkdownDocument(id, title, markdown, extras)` builds one:

model.tsNode.js only

```ts
import { createMarkdownDocument, DocumentValidationError } from "@zudojs/docs";

const login = createMarkdownDocument(
  "guides.auth.login",
  "Logging in",
  "# Logging in\n\nSend your email and password to `POST /auth/login`.\n",
  { category: "guide", tags: ["auth", "basics"], status: "stable" },
);
console.log(login.id, "|", login.title, "|", login.category, login.tags, login.status);
console.log(login.content.type, Object.isFrozen(login), Object.isFrozen(login.tags));

for (const id of ["guides/auth/login", "guides..login", "guides.auth login"]) {
  try {
    createMarkdownDocument(id, "Logging in", "# Logging in");
  } catch (error) {
    if (error instanceof DocumentValidationError) console.log(error.statusCode, error.message);
  }
}
```

Output of `npx tsx model.ts`

```ts
guides.auth.login | Logging in | guide [ 'auth', 'basics' ] stable
markdown true true
422 Document ID "guides/auth/login" is invalid. Use dot-separated segments of letters, digits, "_" and "-".
422 Document ID "guides..login" is invalid. Use dot-separated segments of letters, digits, "_" and "-".
422 Document ID "guides.auth login" is invalid. Use dot-separated segments of letters, digits, "_" and "-".
```

- The result is **deep-frozen**: no code can change a page, or its tag list, after it was built.
- An id with slashes, empty segments or spaces is refused with a `DocumentValidationError` (status 422). The error lives in `@zudojs/errors`, like every error in ZudoJS.
- The optional fields are typed. `category` is one of `introduction`, `guide`, `tutorial`, `reference`, `api`, `architecture`, `configuration`, `deployment`, `security`, `migration` or `examples`; `status` is `stable`, `experimental`, `beta`, `deprecated` or `internal`. `visibility` is `"CLIENT"` (public) or `"SERVER"` (internal).

Content comes in four types: `markdown`, `mdx`, `html`, or `structured`, a list of typed nodes (headings, paragraphs, code, lists, links, tables, quotes and callouts). Structured content is for pages that *code* writes, as you will see in the section on generated references.

## Frontmatter

A Markdown file carries its metadata in **frontmatter**: a block of `key: value` lines between two `---` lines at the top. `parseFrontmatter(text)` splits a file into `metadata` and `content`. It reads a safe subset of YAML, the format frontmatter uses:

frontmatter.tsNode.js only

```ts
import { parseFrontmatter, serializeFrontmatter } from "@zudojs/docs";

const file = `---
title: Logging in
description: "Sign in: email and password"
tags: auth
version: 1.0
order: 2
draft: false
owner:
  team: identity
__proto__: polluted
---
# Logging in
`;

const { metadata, content } = parseFrontmatter(file);
console.log(metadata);
console.log(JSON.stringify(content));
console.log(parseFrontmatter("# No front matter here\n").metadata);

const written = serializeFrontmatter({ title: "Refunds: how they work", tags: ["payments"], version: "2", draft: "true" }, "# Refunds\n");
console.log(written);
console.log(parseFrontmatter(written).metadata);
```

Output of `npx tsx frontmatter.ts`

```json
{
  title: 'Logging in',
  description: 'Sign in: email and password',
  tags: [ 'auth' ],
  version: '1.0',
  order: 2,
  draft: false,
  owner: [Object: null prototype] { team: 'identity' }
}
"# Logging in\n"
{}
---
title: "Refunds: how they work"
tags:
  - payments
version: "2"
draft: "true"
---

# Refunds

{
  title: 'Refunds: how they work',
  tags: [ 'payments' ],
  version: '2',
  draft: 'true'
}
```

Read the parsed metadata carefully, because each line shows a rule:

- The quoted `description` keeps its `:`. Without quotes, a colon in a value is easy to misread.
- `tags: auth` became `[ 'auth' ]`. `tags` is always a list, so a lone tag never turns into four one-letter tags.
- `version: 1.0` stayed the string `'1.0'`. A number is only made when nothing is lost, which is why `order: 2` became the number 2 and a version never becomes `1`.
- `owner` is a one-level mapping. It is an object with a **null prototype**, so it has no inherited properties at all.
- `__proto__` was dropped. Keys that could change an object's prototype are refused, so a malicious file cannot pollute your objects.
- A file without a frontmatter block gives empty metadata and its text unchanged. So does a block that is never closed. Nothing throws: a missing title shows up later, in validation.

`serializeFrontmatter(metadata, content)` goes the other way. It quotes every value that the parser could misread: the colon in the title, the `"2"` that would otherwise come back as a number, the `"true"` that would come back as a boolean. Parsing its output gives back exactly what went in, which matters when a tool edits your files.

## From files to documents

These are the Task API's docs. The first four are public guides; the runbook is marked `visibility: SERVER`, internal only:

docs/guides/start.md

```ts
---
title: Getting started
description: Create your first task with the Task API in five minutes.
category: tutorial
tags: [basics]
---
# Getting started

First [log in](./auth/login), then [create a task](./tasks).
If something fails, look the code up in [the error reference](../reference/errors).
```

docs/guides/tasks.md

```ts
---
title: Working with tasks
description: Create, assign and complete tasks.
category: guide
tags: [tasks, basics]
---
# Working with tasks

Send `POST /tasks` with a title and the number of days until it is due.
Only the owner can [assign a task](#assign); the owner or the assignee can complete it.

## Assign
```

docs/guides/auth/login.md

```ts
---
title: Logging in
description: Get an access token with your email and password.
category: guide
tags: [auth, basics]
version: 1.0
---
# Logging in

Send your email and password to `POST /auth/login`. Keep the refresh token
safe: see [sessions](./sessions) for how long each token lives.
```

docs/guides/auth/sessions.md

```ts
---
title: Sessions and tokens
description: How long access tokens, refresh tokens and sessions live.
category: security
tags: [auth]
---
# Sessions and tokens

An access token lives 15 minutes. A session ends after 30 idle minutes.
```

docs/internal/runbook.md

```ts
---
title: On-call runbook
description: What to do when the email queue backs up.
category: deployment
visibility: SERVER
---
# On-call runbook

If the dead-letter list grows, check the mail provider's status page first.
```

The loader reads every `.md` file, parses its frontmatter and builds a document. `documentIdFromPath` turns `guides/auth/login.md` into `guides.auth.login`, and also understands Windows paths with `\`. When a file has no `title`, `extractTitleFromMarkdown` takes the first `# heading`:

load-docs.ts

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDocument, documentIdFromPath, extractTitleFromMarkdown, parseFrontmatter } from "@zudojs/docs";
import type { DocumentationCategory, DocumentationDocument, DocumentationStatus } from "@zudojs/docs";

/** Reads every .md file under `root` and turns it into a document. */
export async function loadDocs(root: string): Promise<DocumentationDocument[]> {
  const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith(".md")).sort();
  const documents: DocumentationDocument[] = [];
  for (const file of files) {
    const { metadata, content } = parseFrontmatter(await readFile(join(root, file), "utf8"));
    documents.push(createDocument({
      id: documentIdFromPath(file),
      title: metadata.title ?? extractTitleFromMarkdown(content) ?? file,
      description: metadata.description,
      content: { type: "markdown", value: content },
      category: metadata.category as DocumentationCategory | undefined,
      status: metadata.status as DocumentationStatus | undefined,
      tags: metadata.tags,
      version: metadata.version,
      visibility: metadata.visibility as "SERVER" | "CLIENT" | undefined,
    }));
  }
  return documents;
}
```

The `as DocumentationCategory` casts deserve a word. Frontmatter is text typed by people, so `category: blog` is possible. `createDocument` only refuses a missing or malformed id, title or content; it does not check the category. That is fine here, because the validation step below reports unknown categories and statuses. Build first, then validate everything in one place.

list-docs.tsNode.js only

```ts
import { loadDocs } from "./load-docs.js";

for (const doc of await loadDocs("docs")) {
  console.log(`${doc.id.padEnd(22)} ${doc.title.padEnd(20)} ${doc.category} ${doc.visibility ?? "CLIENT"}`);
}
```

Output of `npx tsx list-docs.ts`

```ts
guides.auth.login      Logging in           guide CLIENT
guides.auth.sessions   Sessions and tokens  security CLIENT
guides.start           Getting started      tutorial CLIENT
guides.tasks           Working with tasks   guide CLIENT
internal.runbook       On-call runbook      deployment SERVER
```

The files come back sorted by path, so the build is the same on every machine. Notice there is no error reference: that page will not be a Markdown file at all.

## A reference page generated from code

The third problem, an error table that no longer matches the API, happens to every hand-written reference sooner or later. The cure is to stop writing it by hand. The Task API throws errors from `@zudojs/errors`, and every error class knows its status code and error code. So the reference page can be *built* from those classes, as a structured document:

reference-errors.ts

```ts
import { createStructuredDocument } from "@zudojs/docs";
import type { DocumentationDocument } from "@zudojs/docs";
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@zudojs/errors";

/** The error reference, generated from the error classes the API really throws. */
export function errorReference(): DocumentationDocument {
  const errors = [ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError];
  const rows = errors.map((ErrorClass) => {
    const sample = new ErrorClass("sample");
    return [String(sample.statusCode), sample.code, ErrorClass.name];
  });
  return createStructuredDocument("reference.errors", "Error codes", [
    { type: "heading", level: 1, value: "Error codes" },
    { type: "paragraph", value: "Every error body has an error message and a code. Match on the code, never on the message." },
    { type: "table", headers: ["Status", "Code", "Class"], rows },
    { type: "callout", kind: "note", value: "This page is generated from @zudojs/errors, so it cannot drift from the code." },
  ], { category: "reference", status: "stable", description: "Every error code the Task API returns, with its status." });
}
```

`nodesToMarkdown` turns structured nodes into Markdown. Every value is escaped for its position, so a `|` in a cell cannot break the table and a `<` in text cannot become HTML:

structured.tsNode.js only

```ts
import { nodesToMarkdown } from "@zudojs/docs";
import { errorReference } from "./reference-errors.js";

const reference = errorReference();
if (reference.content.type === "structured") console.log(nodesToMarkdown(reference.content.nodes));
```

Output of `npx tsx structured.ts`

```ts
# Error codes

Every error body has an error message and a code. Match on the code, never on the message.

| Status | Code | Class |
| --- | --- | --- |
| 400 | ERR_VALIDATION_FAILED | ValidationError |
| 401 | ERR_AUTHENTICATION_FAILED | AuthenticationError |
| 403 | ERR_FORBIDDEN | AuthorizationError |
| 404 | ERR_RESOURCE_NOT_FOUND | NotFoundError |
| 409 | ERR_CONFLICT | ConflictError |

> **NOTE:** This page is generated from @zudojs/errors, so it cannot drift from the code.
```

If a developer changes `NotFoundError`'s code, the next docs build shows the new one. The same idea works for configuration keys, CLI commands, event names or HTTP routes: whenever the truth lives in code, generate the page from the code.

## The registry

A `DocumentRegistry` holds every page by id. It refuses a second page with the same id, which is how you find two files that became the same URL. It also answers the questions a site needs: pages by tag, by category, and by visibility:

registry.tsNode.js only

```ts
import { createDocumentRegistry, DuplicateDocumentError } from "@zudojs/docs";
import { loadDocs } from "./load-docs.js";
import { errorReference } from "./reference-errors.js";

const registry = createDocumentRegistry();
registry.registerAll(await loadDocs("docs"));
registry.register(errorReference());
console.log(registry.size, "documents");

try {
  registry.register(errorReference());
} catch (error) {
  if (error instanceof DuplicateDocumentError) console.log(error.name, "-", error.message);
}

console.log("tagged auth:", registry.byTag("auth").map((doc) => doc.id));
console.log("guides:", registry.byCategory("guide").map((doc) => doc.id));
console.log("public:", registry.getAll({ visibility: "CLIENT" }).map((doc) => doc.id));
console.log("internal:", registry.getAll({ visibility: "SERVER" }).map((doc) => doc.id));
```

Output of `npx tsx registry.ts`

```ts
6 documents
DuplicateDocumentError - Document "reference.errors" is already registered.
tagged auth: [ 'guides.auth.login', 'guides.auth.sessions' ]
guides: [ 'guides.auth.login', 'guides.tasks' ]
public: [
  'guides.auth.login',
  'guides.auth.sessions',
  'guides.start',
  'guides.tasks',
  'reference.errors'
]
internal: [ 'internal.runbook' ]
```

The visibility filter **fails closed**. `"CLIENT"` returns only pages whose `visibility` is unset or exactly `"CLIENT"`. Anything else, including a typo such as `visibility: server` in lower case, counts as internal. A mistake hides a page; it never publishes one. That is the right direction for the runbook problem.

## Validating documents and links

Before any code, think about what "correct docs" means.

REASON IT OUT

### What should a docs check refuse?

List what can go wrong with a set of pages and a navigation tree, and for each problem decide: should the build fail, or only warn? Think about links between pages, links to the outside, internal pages, pages nobody can reach, and very large files.

**Show the reasoning**

- **A page with a bad id, no title or empty content**: fail. It cannot be published correctly.
- **An unknown category or status** (a typo in frontmatter): fail. Filters and badges would silently skip the page.
- **A link to a page that does not exist**: users hit a 404. It should fail the build of a public site.
- **A public page that links to an internal page**: for the public site that link is broken, and it also tells readers the internal page exists. Fail.
- **A link with a dangerous scheme** such as `javascript:`: fail.
- **A navigation entry for a missing page, or a cycle in the tree**: fail; the sidebar would break.
- **A page nobody can reach from the navigation**: often a forgotten entry; at least warn.
- **Links to other websites and to `#sections`**: these cannot be checked by looking at your own pages; checking them needs the network, so do it separately.

The package's validators return a `ValidationResult`: `valid` plus a list of `issues`, each with a `severity` (`error` or `warning`), a `code` and a `message`. `validateLinks(document, ids)` finds every Markdown link and resolves relative ones against the page's id like file paths: from `guides.auth.login`, `./sessions` is `guides.auth.sessions`:

validate.tsNode.js only

```ts
import { createMarkdownDocument, resolveDocumentLink, validateDocument, validateLinks } from "@zudojs/docs";
import type { DocumentationDocument } from "@zudojs/docs";

const known = new Set(["guides.start", "guides.auth.login", "guides.auth.sessions", "reference.errors"]);
console.log(resolveDocumentLink("guides.auth.login", "./sessions"));
console.log(resolveDocumentLink("guides.start", "../reference/errors#404"));

const logout = createMarkdownDocument("guides.auth.logout", "Logging out", [
  "# Logging out",
  "Logout ends the [session](./session). Codes are in [the reference](../../reference/errors).",
  "Questions? [Email us](mailto:support@example.com) or read [Tokens](#tokens).",
  "```md",
  "[this is an example, not a link](./nowhere)",
  "```",
].join("\n\n"));
console.log(validateLinks(logout, known));

const fromFrontmatter = { ...logout, category: "blog", status: "draft" } as unknown as DocumentationDocument;
console.log(validateDocument(fromFrontmatter).issues.map((issue) => `${issue.severity} ${issue.code}`));
```

Output of `npx tsx validate.ts`

```ts
guides.auth.sessions
reference.errors
{
  valid: true,
  issues: [
    {
      severity: 'warning',
      code: 'BROKEN_LINK',
      message: 'Document "guides.auth.logout" links to "./session" which is not registered.',
      documentId: 'guides.auth.logout'
    }
  ]
}
[ 'error INVALID_STATUS', 'error INVALID_CATEGORY' ]
```

- `./session` points to nothing, and it is reported. `../../reference/errors` resolved to `reference.errors`; the `mailto:` link, the `#tokens` anchor and the link inside the fenced code block are skipped, as they should be.
- **Look at `valid: true`.** A broken link is only a *warning* in this package, and warnings never make a result invalid. If your CI checks `valid` alone, broken links pass. You decide which warnings fail your build; the next sections fail on all of them.
- `validateDocument` checks one page's shape and its metadata enums. Here it catches the `blog` category and the `draft` status that frontmatter let through.

> A LINK CHECKER IS NOT A SANITIZER
>
> validateLinks reports links with schemes outside http, https, mailto, tel, ftp and ftps as `UNSAFE_LINK` errors. Treat that as a helpful lint, not as security. It reads Markdown link syntax, not raw HTML inside Markdown, so it cannot promise that a rendered page is safe. When you render Markdown, HTML or MDX that anyone outside your team can write, run the output through a real HTML sanitizer; `generateMarkdown` accepts one as its `sanitizer` option for HTML and MDX content.

## Navigation

The sidebar is data too: a tree of items, each with a title, an optional `documentId` and optional children. A section can have its own page (Guides) or be only a heading (Authentication, Reference). The navigation is kept apart from the pages, so you can reorder the sidebar without touching any file:

navigation.ts

```ts
import type { DocumentationNavigationItem } from "@zudojs/docs";

export const navigation: DocumentationNavigationItem[] = [
  {
    title: "Guides",
    documentId: "guides.start",
    children: [
      { title: "Working with tasks", documentId: "guides.tasks" },
      {
        title: "Authentication",
        children: [
          { title: "Logging in", documentId: "guides.auth.login" },
          { title: "Sessions and tokens", documentId: "guides.auth.sessions" },
        ],
      },
    ],
  },
  { title: "Reference", children: [{ title: "Error codes", documentId: "reference.errors" }] },
];
```

One tree gives you breadcrumbs, the reading order and the pages next to a page:

nav.tsNode.js only

```ts
import { flattenNavigation, getAdjacent, getBreadcrumbs, validateNavigation } from "@zudojs/docs";
import { navigation } from "./navigation.js";

console.log(getBreadcrumbs("guides.auth.sessions", navigation).map((crumb) => crumb.title).join(" › "));
console.log(flattenNavigation(navigation));
console.log(getAdjacent("guides.auth.login", navigation));

const broken = [...navigation, { title: "Billing", documentId: "guides.billing" }, { title: "Coming soon" }];
console.log(validateNavigation(broken, new Set(flattenNavigation(navigation))).issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`));
```

Output of `npx tsx nav.ts`

```ts
Guides › Authentication › Sessions and tokens
[
  'guides.start',
  'guides.tasks',
  'guides.auth.login',
  'guides.auth.sessions',
  'reference.errors'
]
{ next: 'guides.auth.sessions' }
[
  'error NAVIGATION_UNKNOWN_DOCUMENT: Navigation item "Billing" references unknown document "guides.billing".',
  'warning NAVIGATION_EMPTY_ITEM: Navigation item "Coming soon" has neither a documentId nor children.'
]
```

`getBreadcrumbs` walks from the top to the page. `flattenNavigation` lists every page in reading order, which is also a good order for a printed or PDF version. `getAdjacent` only looks at the *same level*: "Logging in" has a next page inside Authentication and no previous one there. `validateNavigation` reports an entry for a page that does not exist as an error and an empty item as a warning. The walkers also stop at 64 levels and visit a shared node only once, so even a tree with a loop cannot hang your build.

## A docs check for CI

Now put the pieces together as one check. The public pages are validated with the navigation, so a public page that is missing from the sidebar is reported. The internal pages are validated on their own, without a navigation. And every issue counts, warnings included:

check-docs.ts

```ts
import { createDocumentRegistry, validateAll } from "@zudojs/docs";
import type { ValidationIssue } from "@zudojs/docs";
import { loadDocs } from "./load-docs.js";
import { navigation } from "./navigation.js";
import { errorReference } from "./reference-errors.js";

/** Loads, registers and validates every page. Warnings count as failures. */
export async function checkDocs(root: string): Promise<{ size: number; issues: ValidationIssue[] }> {
  const registry = createDocumentRegistry();
  registry.registerAll(await loadDocs(root));
  registry.register(errorReference());
  const published = validateAll(registry.getAll({ visibility: "CLIENT" }), navigation);
  const internal = validateAll(registry.getAll({ visibility: "SERVER" }));
  return { size: registry.size, issues: [...published.issues, ...internal.issues] };
}
```

The command prints each issue and sets the exit code, which is what makes a CI job fail:

check.tsNode.js only

```ts
import { checkDocs } from "./check-docs.js";

const { size, issues } = await checkDocs("docs");
for (const issue of issues) console.log(`${issue.severity.padEnd(7)} ${issue.code}  ${issue.message}`);
console.log(issues.length === 0 ? `docs check passed: ${size} documents` : `docs check failed: ${issues.length} issues`);
process.exitCode = issues.length === 0 ? 0 : 1;
```

Output of `npx tsx check.ts`

```ts
docs check passed: 6 documents
```

Six documents: five files plus the generated reference. Now someone adds a page about logging out. It has a typo in one link, links the internal runbook, and they forget the navigation:

docs/guides/auth/logout.md

```ts
---
title: Logging out
description: End one session, or every session of a user.
category: guide
tags: [auth]
---
# Logging out

`POST /auth/logout` ends the current [session](./session). After a password
change, call it for every device, as described in [the runbook](../../internal/runbook).
```

check.tsNode.js only

```ts
import { checkDocs } from "./check-docs.js";

const { size, issues } = await checkDocs("docs");
for (const issue of issues) console.log(`${issue.severity.padEnd(7)} ${issue.code}  ${issue.message}`);
console.log(issues.length === 0 ? `docs check passed: ${size} documents` : `docs check failed: ${issues.length} issues`);
process.exitCode = issues.length === 0 ? 0 : 1;
```

Output of `npx tsx check.ts`

```ts
warning BROKEN_LINK  Document "guides.auth.logout" links to "./session" which is not registered.
warning BROKEN_LINK  Document "guides.auth.logout" links to "../../internal/runbook" which is not registered.
warning NAVIGATION_ORPHAN_DOCUMENT  Document "guides.auth.logout" is not reachable from the navigation.
docs check failed: 3 issues
```

All three are warnings, so `validateAll` alone would have said `valid: true` and the page would have shipped with two dead links. The strict check fails instead. The link to the runbook is reported because the public pages are checked against the public ids only: from the public site's point of view, that page does not exist. Fix the page, and add it to the navigation:

docs/guides/auth/logout.md

```ts
---
title: Logging out
description: End one session, or every session of a user.
category: guide
tags: [auth]
---
# Logging out

`POST /auth/logout` ends the current [session](./sessions). After a password
change, the API ends every session of the user, on every device.
```

navigation.ts

```ts
import type { DocumentationNavigationItem } from "@zudojs/docs";

export const navigation: DocumentationNavigationItem[] = [
  {
    title: "Guides",
    documentId: "guides.start",
    children: [
      { title: "Working with tasks", documentId: "guides.tasks" },
      {
        title: "Authentication",
        children: [
          { title: "Logging in", documentId: "guides.auth.login" },
          { title: "Sessions and tokens", documentId: "guides.auth.sessions" },
          { title: "Logging out", documentId: "guides.auth.logout" },
        ],
      },
    ],
  },
  { title: "Reference", children: [{ title: "Error codes", documentId: "reference.errors" }] },
];
```

check.tsNode.js only

```ts
import { checkDocs } from "./check-docs.js";

const { size, issues } = await checkDocs("docs");
for (const issue of issues) console.log(`${issue.severity.padEnd(7)} ${issue.code}  ${issue.message}`);
console.log(issues.length === 0 ? `docs check passed: ${size} documents` : `docs check failed: ${issues.length} issues`);
process.exitCode = issues.length === 0 ? 0 : 1;
```

Output of `npx tsx check.ts`

```ts
docs check passed: 7 documents
```

In the Task API project, make this a script in `package.json`, such as `"docs:check": "tsx scripts/check-docs.ts"`, and run it in the same CI job as the type check and the tests.

## Code examples

Documentation is mostly examples, and examples rot fastest. The package models an example as its own object, with an id, a language and the code, so a tool can list, check and render them:

examples.tsNode.js only

```ts
import { renderExampleMarkdown, validateExample } from "@zudojs/docs";
import type { DocumentationExample } from "@zudojs/docs";

const login: DocumentationExample = {
  id: "login-curl",
  title: "Log in with curl",
  language: "sh",
  code: [
    "curl -X POST http://localhost:3000/auth/login \\",
    "  -H 'content-type: application/json' \\",
    "  -d '{\"email\":\"ada@example.com\",\"password\":\"…\"}'",
  ].join("\n"),
};
console.log(validateExample(login));
console.log(validateExample({ ...login, id: "", code: "   " }));

const markdownInside: DocumentationExample = {
  id: "readme-snippet",
  language: "md",
  code: "Wrap code in fences:\n\n```ts\nconst x = 1;\n```",
};
console.log(renderExampleMarkdown(login));
console.log(renderExampleMarkdown(markdownInside));
```

Output of `npx tsx examples.ts`

```ts
{ valid: true, errors: [] }
{
  valid: false,
  errors: [ 'Example ID is required.', 'Example requires code content.' ]
}
### Log in with curl

```sh
curl -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"…"}'
```
````md
Wrap code in fences:

```ts
const x = 1;
```
````
```

`validateExample` checks the shape: an id, a language, some code. `renderExampleMarkdown` writes a fenced code block, and picks a fence longer than any run of backticks inside the code: the second example contains `\`\`\``, so it is wrapped in four backticks and cannot close its own block early.

Neither function runs the code. Whether an example still *works* is a job for your tests. That is exactly how the lessons in this academy are built: every example on these pages is executed on each build, and the build fails if its output changes.

## Generating the output

The last step writes what the website needs. `generateMarkdown` writes a page back as Markdown with clean frontmatter (quoting anything that could be misread), `generateIndex` writes a list of pages for menus and sitemaps, and a search file holds the plain text of each page, made with `stripMarkdown`. The package has a `SearchDocument` type for such entries; you build them yourself:

build-docs.ts

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDocumentRegistry, generateIndex, generateMarkdown, nodesToMarkdown, stripMarkdown } from "@zudojs/docs";
import type { DocumentationDocument, SearchDocument } from "@zudojs/docs";
import { loadDocs } from "./load-docs.js";
import { errorReference } from "./reference-errors.js";

function plainText(doc: DocumentationDocument): string {
  const markdown = doc.content.type === "structured" ? nodesToMarkdown(doc.content.nodes) : doc.content.value;
  return stripMarkdown(markdown);
}

/** Writes one Markdown file per public page, a page index and a search index. */
export async function buildDocs(root: string, out: string): Promise<string[]> {
  const registry = createDocumentRegistry();
  registry.registerAll(await loadDocs(root));
  registry.register(errorReference());
  const pages = registry.getAll({ visibility: "CLIENT" });

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const written: string[] = [];
  for (const doc of pages) {
    await writeFile(join(out, `${doc.id}.md`), generateMarkdown(doc));
    written.push(`${doc.id}.md`);
  }
  const search: SearchDocument[] = pages.map((doc) => ({
    id: doc.id, title: doc.title, content: plainText(doc), tags: doc.tags ?? [], path: "/docs/" + doc.id.replaceAll(".", "/"),
  }));
  await writeFile(join(out, "index.json"), JSON.stringify(generateIndex(registry.getAll()), null, 2));
  await writeFile(join(out, "search.json"), JSON.stringify(search));
  return [...written, "index.json", "search.json"];
}
```

build.tsNode.js only

```ts
import { readFile } from "node:fs/promises";
import { buildDocs } from "./build-docs.js";

console.log(await buildDocs("docs", "dist/docs"));
console.log(await readFile("dist/docs/guides.auth.sessions.md", "utf8"));
const index = JSON.parse(await readFile("dist/docs/index.json", "utf8")) as { id: string }[];
console.log("index:", index.map((entry) => entry.id));
const search = JSON.parse(await readFile("dist/docs/search.json", "utf8")) as { id: string; content: string }[];
console.log(search.find((entry) => entry.id === "guides.tasks"));
console.log("internal page in search?", search.some((entry) => entry.id.startsWith("internal.")));
```

Output of `npx tsx build.ts`

```json
[
  'guides.auth.login.md',
  'guides.auth.logout.md',
  'guides.auth.sessions.md',
  'guides.start.md',
  'guides.tasks.md',
  'reference.errors.md',
  'index.json',
  'search.json'
]
---
title: Sessions and tokens
description: How long access tokens, refresh tokens and sessions live.
category: security
tags:
  - auth
---

# Sessions and tokens

An access token lives 15 minutes. A session ends after 30 idle minutes.

index: [
  'guides.auth.login',
  'guides.auth.logout',
  'guides.auth.sessions',
  'guides.start',
  'guides.tasks',
  'reference.errors'
]
{
  id: 'guides.tasks',
  title: 'Working with tasks',
  content: 'Working with tasks\n' +
    '\n' +
    'Send POST /tasks with a title and the number of days until it is due.\n' +
    'Only the owner can assign a task; the owner or the assignee can complete it.\n' +
    '\n' +
    'Assign',
  tags: [ 'tasks', 'basics' ],
  path: '/docs/guides/tasks'
}
internal page in search? false
```

Three layers keep the runbook private: `buildDocs` only takes `"CLIENT"` pages, `generateIndex` leaves out `"SERVER"` pages *by default* even though it received every page, and the check refuses public links to internal pages. A single mistake in one of them does not publish it.

## Testing the docs pipeline

The docs pipeline is code, so it gets tests. Three rules are worth pinning: the docs pass the strict check, no internal page is ever built, and the generated reference covers every status the API sends. This file uses `node:test`, from [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies); in the Task API project you would put the same tests in Vitest:

docs.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDocs } from "./build-docs.js";
import { checkDocs } from "./check-docs.js";
import { errorReference } from "./reference-errors.js";

describe("Task API docs", () => {
  it("pass the strict check", async () => {
    const { issues } = await checkDocs("docs");
    assert.deepEqual(issues.map((issue) => issue.message), []);
  });

  it("never publish an internal page", async () => {
    const files = await buildDocs("docs", "dist/test-docs");
    assert.ok(!files.some((file) => file.startsWith("internal.")), files.join(", "));
  });

  it("document every status the API sends", () => {
    const doc = errorReference();
    const table = doc.content.type === "structured" ? doc.content.nodes.find((node) => node.type === "table") : undefined;
    const statuses = table?.type === "table" ? table.rows.map((row) => row[0]) : [];
    assert.deepEqual(statuses, ["400", "401", "403", "404", "409"]);
  });
});
```

Output of `npx tsx docs.test.ts`

```ts
▶ Task API docs
  ✔ pass the strict check (109.295651ms)
  ✔ never publish an internal page (63.309195ms)
  ✔ document every status the API sends (1.389033ms)
✔ Task API docs (182.532129ms)
ℹ tests 3
ℹ suites 1
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 571.524017
```

The first test is the CI check again, as a test, so a broken link fails `npm test` too. The third test fails on purpose the day someone adds a `TooManyRequestsError` to the API without adding it to the reference.

### Production concerns

- **Ids are URLs.** Renaming a file changes its id and breaks every bookmark and search result pointing at it. When you must rename, keep a redirect from the old id; the strict check at least tells you about the internal links.
- **Keep visibility fail-closed.** Mark internal pages, but also keep them in a separate folder, and build the public site from the `"CLIENT"` filter only.
- **Large files.** `validateLinks` skips Markdown longer than 100,000 characters and reports a `LINK_VALIDATION_SKIPPED` warning instead, so one huge generated file cannot slow the check down. The strict policy turns that warning into a failure; raise `maxContentLength` if a file really is that big.
- **Links to other sites** are not checked by the package. Check them in a separate, scheduled job with retries, because the network is flaky and a docs build must not fail because someone else's site was down.
- **Sanitize what you render.** Text in structured nodes is escaped for you; Markdown, HTML and MDX written by outsiders need a real sanitizer at render time.

## Practice

TRY IT YOURSELF

### A rule of your own

Your team wants every public page to have a description of at least 20 characters, because search engines and link previews show it. Write `requireDescriptions(documents)` that returns a `ValidationResult` with one `DESCRIPTION_TOO_SHORT` error per page that breaks the rule. Use `toValidationResult` to build the result, so `valid` follows the same rule as the package's validators.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

A description "breaks the rule" when it is missing, or when `description.trim().length` is under 20. Push one issue object per broken document, with `severity: "error"`, `code: "DESCRIPTION_TOO_SHORT"`, and a `documentId` set to `doc.id`.

HINT 2

Once you have collected every issue, the whole function ends with `return toValidationResult(issues);` — you don't compute `valid` yourself.

SOLUTION

rule-description.tsNode.js only

```ts
import { createMarkdownDocument, toValidationResult } from "@zudojs/docs";
import type { DocumentationDocument, ValidationIssue, ValidationResult } from "@zudojs/docs";

function requireDescriptions(documents: readonly DocumentationDocument[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const doc of documents) {
    const length = doc.description?.trim().length ?? 0;
    if (length < 20) {
      issues.push({
        severity: "error",
        code: "DESCRIPTION_TOO_SHORT",
        message: `Document "${doc.id}" needs a description of at least 20 characters (has ${length}).`,
        documentId: doc.id,
      });
    }
  }
  return toValidationResult(issues);
}

console.log(requireDescriptions([
  createMarkdownDocument("guides.start", "Getting started", "# Getting started", { description: "Create your first task in five minutes." }),
  createMarkdownDocument("guides.faq", "FAQ", "# FAQ", { description: "Questions" }),
  createMarkdownDocument("guides.billing", "Billing", "# Billing"),
]));
```

Output of `npx tsx rule-description.ts`

```json
{
  valid: false,
  issues: [
    {
      severity: 'error',
      code: 'DESCRIPTION_TOO_SHORT',
      message: 'Document "guides.faq" needs a description of at least 20 characters (has 9).',
      documentId: 'guides.faq'
    },
    {
      severity: 'error',
      code: 'DESCRIPTION_TOO_SHORT',
      message: 'Document "guides.billing" needs a description of at least 20 characters (has 0).',
      documentId: 'guides.billing'
    }
  ]
}
```

Because your issues have the same shape as the package's, `checkDocs` can simply add them to its list: `[...published.issues, ...requireDescriptions(pages).issues]`.

TRY IT YOURSELF

### Previous and next across sections

At the bottom of each page you want "previous" and "next" links that continue across sections, like a book. `getAdjacent` stops at the edge of a section. Write `pager(id)` with `flattenNavigation`.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`flattenNavigation(navigation)` returns every document id in whole-site reading order, as a plain array. Find `documentId`'s position in that array with `indexOf`.

HINT 2

If the id isn't found, `indexOf` returns `-1` — return `{}` in that case. Otherwise return `{ previous: order[index - 1], next: order[index + 1] }`; indexing past either end of the array gives `undefined`, which is exactly what an edge page should show.

SOLUTION

pager.tsNode.js only

```ts
import { flattenNavigation, getAdjacent } from "@zudojs/docs";
import { navigation } from "./navigation.js";

function pager(documentId: string): { previous?: string; next?: string } {
  const order = flattenNavigation(navigation);
  const index = order.indexOf(documentId);
  if (index === -1) return {};
  return { previous: order[index - 1], next: order[index + 1] };
}

console.log("same level:", getAdjacent("guides.auth.logout", navigation));
console.log("whole site:", pager("guides.auth.logout"));
console.log("first page:", pager("guides.start"));
```

Output of `npx tsx pager.ts`

```ts
same level: { previous: 'guides.auth.sessions' }
whole site: { previous: 'guides.auth.sessions', next: 'reference.errors' }
first page: { previous: undefined, next: 'guides.tasks' }
```

"Logging out" is the last page of Authentication, so `getAdjacent` has no next page for it. In reading order, the next page is the error reference. `getAdjacent` is still the right tool for a "more in this section" box.

TRY IT YOURSELF

### Search the docs

Write `search(query)` over the `search.json` file the build wrote. Score each page 3 points for every query word in its title and 1 point for every word in its text, drop pages with no points, and sort by score, then by id. Return `SearchResult` objects.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Lowercase the query and split it on whitespace to get a list of words (`filter(Boolean)` drops empty strings from repeated spaces). For each entry, add 3 for every word found in `entry.title.toLowerCase()` and 1 for every word found in `entry.content.toLowerCase()`.

HINT 2

Only keep entries whose total score is greater than 0. Sort the survivors with `(a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id)` — score descending first, id alphabetically to break ties.

SOLUTION

search.tsNode.js only

```ts
import { readFile } from "node:fs/promises";
import type { SearchDocument, SearchResult } from "@zudojs/docs";

const entries = JSON.parse(await readFile("dist/docs/search.json", "utf8")) as SearchDocument[];

function search(query: string): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results: SearchResult[] = [];
  for (const entry of entries) {
    const title = entry.title.toLowerCase();
    const content = entry.content.toLowerCase();
    let score = 0;
    for (const word of words) score += (title.includes(word) ? 3 : 0) + (content.includes(word) ? 1 : 0);
    if (score > 0) results.push({ id: entry.id, title: entry.title, path: entry.path, score });
  }
  return results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id));
}

console.log(search("session"));
console.log(search("conflict").map((result) => result.path));
```

Output of `npx tsx search.ts`

```json
[
  {
    id: 'guides.auth.sessions',
    title: 'Sessions and tokens',
    path: '/docs/guides/auth/sessions',
    score: 4
  },
  {
    id: 'guides.auth.login',
    title: 'Logging in',
    path: '/docs/guides/auth/login',
    score: 1
  },
  {
    id: 'guides.auth.logout',
    title: 'Logging out',
    path: '/docs/guides/auth/logout',
    score: 1
  }
]
[ '/docs/reference/errors' ]
```

"session" is in the title of one page and in the text of two others, so the title match wins. This tiny search is fine for a few hundred pages; for more, send the same entries to a search service. The runbook can never appear, because it was never written to `search.json`.

## Recap

- Treat docs as data: each page is a frozen document with a stable dot-separated id, typed metadata and markdown, html, mdx or structured content.
- `parseFrontmatter` reads a safe subset of YAML (tags always a list, lossless numbers, no prototype keys); `serializeFrontmatter` quotes whatever could be misread.
- A `DocumentRegistry` refuses duplicate ids and filters by tag, category and visibility. The visibility filter fails closed.
- `validateDocument`, `validateLinks`, `validateNavigation` and `validateAll` report errors and warnings. Broken links are warnings, so decide your own policy and make CI fail on it.
- One navigation tree gives breadcrumbs, reading order and neighbours. Generate reference pages from code, publish only public pages, and test the pipeline like any other code.

Next, you separate deploying from releasing with [feature flags](https://zudojs.oyinlola.site/learn/zudo-feature-flags).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
