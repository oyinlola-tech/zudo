---
title: "@zudojs/docs — Documentation Infrastructure"
description: "Complete documentation for @zudojs/docs — structured document model, registry, validation, navigation, frontmatter parsing, and output generation."
source: https://zudojs.oyinlola.site/docs/packages-docs
---

v1.0.2

# @zudojs/docs

A small toolkit for describing documentation pages in code, checking them for mistakes, and turning them into Markdown or JSON.

DOCUMENT MODEL REGISTRY VALIDATION NAVIGATION GENERATORS

## OVERVIEW

Documentation usually lives in loose Markdown files. Nothing checks that two pages do not share a name, that every link points somewhere real, or that the sidebar only lists pages that exist. Problems show up when a reader clicks a dead link.

`@zudojs/docs` gives each page a stable ID and a plain object shape. You put those objects in a *registry* (a lookup table keyed by ID), run the validators over them, and then generate Markdown or a JSON index for whatever site tool you use.

The package has no opinion about how you render pages. It does not include a web server, a Markdown-to-HTML converter, or a search engine. It only models, checks, and exports.

WHEN YOU NEED IT

- You generate docs from code and want them checked before publishing.
- You have many pages that link to each other by ID.
- You need a sidebar tree with breadcrumbs and previous/next links.
- You want to keep some pages server-only and out of a public index.

WHEN YOU DON'T

- You have a handful of Markdown files and a static site generator already checks links.
- You need Markdown rendered to HTML. Use a Markdown library for that.
- You need full-text search. This package only defines the `SearchDocument` type; it ships no search.

## INSTALLATION

Install the package. It pulls in `@zudojs/errors` on its own; nothing else is required.

```bash
$ npm install @zudojs/docs
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

This example creates two pages, stores them in a registry, checks them, and prints a JSON index.

```ts
import {
  createDocumentRegistry,
  createMarkdownDocument,
  validateAll,
  generateIndex,
} from "@zudojs/docs";

const registry = createDocumentRegistry();

registry.register(
  createMarkdownDocument(
    "intro",
    "Introduction",
    "# Introduction\n\nWelcome. Next: [Setup](setup)",
    { category: "introduction", tags: ["start"] },
  ),
);

registry.register(
  createMarkdownDocument(
    "setup",
    "Setup",
    "# Setup\n\nRun npm install.",
    { category: "guide", tags: ["start"] },
  ),
);

const result = validateAll(registry.getAll());
console.log(result.valid);   // true
console.log(result.issues);  // []

const index = generateIndex(registry.getAll());
console.log(index[0]);
// { id: "intro", title: "Introduction", category: "introduction", tags: ["start"] }
```

Nothing is written to disk. `generateIndex` returns plain objects; you decide where they go (a file, an HTTP response, a search tool).

## DOCUMENTS

A *document* is one page of documentation described as a plain object. Every document has three required fields: an `id`, a `title`, and `content`. Everything else is optional.

IDs are dot-separated, like `guides.http.routing`. Each segment may contain letters, digits, `_` and `-`. Titles can change later; IDs should not, because links and navigation point at them.

### Three ways to build one

`createDocument` takes the full options object. The other two are shortcuts for the most common content types.

```ts
import {
  createDocument,
  createMarkdownDocument,
  createStructuredDocument,
} from "@zudojs/docs";

// 1. Full form: you choose the content type yourself
const routing = createDocument({
  id: "guides.http.routing",
  title: "HTTP Routing",
  description: "How to define routes",
  content: { type: "markdown", value: "# Routing\n\nDefine routes here." },
  category: "guide",
  tags: ["http"],
  status: "stable",
});

// 2. Markdown shortcut: (id, title, markdown, extras?)
const config = createMarkdownDocument(
  "guides.config",
  "Configuration",
  "# Configuration\n\nUse layered sources.",
  { category: "guide" },
);

// 3. Structured shortcut: content is a list of typed nodes
const container = createStructuredDocument(
  "api.container",
  "Container API",
  [
    { type: "heading", level: 1, value: "Container" },
    { type: "paragraph", value: "The container manages dependencies." },
    { type: "code", language: "typescript", value: "const c = createContainer();" },
    { type: "callout", kind: "tip", value: "Register once, resolve anywhere." },
  ],
);

console.log(routing.id);              // "guides.http.routing"
console.log(Object.isFrozen(routing)); // true
```

The returned object is a deep-frozen copy. Changing your original options afterwards does not change the document, and trying to assign to the document throws in strict mode.

### Content types

The `content` field is an object with a `type`. Four types are accepted.

| type | Shape | Notes |
| --- | --- | --- |
| `"markdown"` | `{ type, value: string }` | Links are validated; the title can be extracted from the first `# heading`. |
| `"structured"` | `{ type, nodes: DocumentationNode[] }` | Node types: heading, paragraph, code, list, link, table, quote, callout. Rendered to Markdown by the generator. |
| `"html"` | `{ type, value: string }` | Passed through unchanged. Links are not validated. |
| `"mdx"` | `{ type, value: string }` | Same as html: stored and emitted as-is. |

### Optional fields

| Field | Allowed values | Notes |
| --- | --- | --- |
| `category` | introduction, guide, tutorial, reference, api, architecture, configuration, deployment, security, migration, examples | Anything else is an `INVALID_CATEGORY` error in validation. |
| `status` | stable, experimental, beta, deprecated, internal | Free to leave out. |
| `tags` | string[] | Used by `registry.byTag`. |
| `visibility` | `"SERVER"` or `"CLIENT"` | Only an unset or exactly `"CLIENT"` visibility is client-visible; any other value (including `"server"`) is treated as server-only and left out of `generateIndex` by default. |
| `deprecated`, `deprecatedMessage` | boolean, string | Set both together. The generator prints a DEPRECATED banner. |
| `description`, `version`, `metadata` | string, string, object | Carried through to the generators. |

> **Watch out:** the builders throw `DocumentValidationError` right away if `id`, `title` or `content` is missing or the ID has a bad shape (spaces, slashes, empty segments). They do not check `category` or `status`; that is the validator's job.

## REGISTRY

A *registry* is a lookup table that holds documents by ID. It refuses duplicates, so two pages can never claim the same ID. It also stores a frozen copy of each document, so editing your original object later has no effect on what is stored.

This example registers two pages, tries a duplicate, and then queries the registry.

```ts
import {
  createDocumentRegistry,
  createMarkdownDocument,
  DuplicateDocumentError,
} from "@zudojs/docs";

const registry = createDocumentRegistry();

registry.registerAll([
  createMarkdownDocument("intro", "Introduction", "# Intro", { category: "introduction", tags: ["start"] }),
  createMarkdownDocument("setup", "Setup", "# Setup", { category: "guide", tags: ["start"] }),
]);

try {
  registry.register(createMarkdownDocument("intro", "Again", "# Again"));
} catch (error) {
  if (error instanceof DuplicateDocumentError) {
    console.log(error.message); // Document "intro" is already registered.
  }
}

console.log(registry.get("intro")?.title);          // "Introduction"
console.log(registry.has("nope"));                   // false
console.log(registry.size);                          // 2
console.log(registry.ids());                         // ["intro", "setup"]
console.log(registry.byCategory("guide").map((d) => d.id)); // ["setup"]
console.log(registry.byTag("start").length);          // 2
```

### Methods

| Method | What it does | Notes |
| --- | --- | --- |
| `register(doc)` | Stores one document. | Throws `DuplicateDocumentError` if the ID exists. |
| `registerAll(docs)` | Stores several documents in order. | Stops at the first duplicate; earlier ones stay registered. |
| `get(id)` | Returns the document or `undefined`. | Never throws. |
| `getAll(options?)` | Returns every document. | `{ visibility: "CLIENT" \| "SERVER" \| "ALL" }`, default `"ALL"`. |
| `has(id)`, `delete(id)`, `clear()` | Check, remove one, remove all. | `delete` returns `true` if something was removed. |
| `ids()`, `idSet()` | All IDs as an array or a `Set`. | `idSet()` is what `validateLinks` and `validateNavigation` expect. |
| `byCategory(c)`, `byTag(t)` | Filter documents. | Return frozen arrays. |
| `size` | Number of documents. | A property, not a method. |

> **Tip:** `DocumentRegistry` implements the `DocumentationProvider` interface (`get` and `getAll`). If you load documents from somewhere else, implement that same interface and the rest of your code does not need to change.

## FRONTMATTER

*Frontmatter* is a block of `key: value` lines at the top of a Markdown file, fenced by `---` on its own line above and below. It is how Markdown files usually carry a title, tags and similar metadata.

`parseFrontmatter` splits a raw file into the metadata and the rest of the text. `serializeFrontmatter` does the reverse.

```ts
import { parseFrontmatter, serializeFrontmatter } from "@zudojs/docs";

const raw = `---
title: HTTP Routing
category: guide
tags:
  - http
  - routing
version: 1.0
---
# Routing

Define routes here.`;

const { metadata, content } = parseFrontmatter(raw);

console.log(metadata.title);    // "HTTP Routing"
console.log(metadata.tags);     // ["http", "routing"]
console.log(metadata.version);  // "1.0"  (a string, not the number 1)
console.log(content);           // "# Routing\n\nDefine routes here."

const text = serializeFrontmatter({ title: "Notes: draft", tags: ["a"] }, "# Body");
console.log(text);
// ---
// title: "Notes: draft"
// tags:
//   - a
// ---
//
// # Body
```

The serializer added quotes around `Notes: draft` because a bare colon would confuse the parser. Anything you serialize parses back to the same values.

### What the parser understands

- `key: value` where the value is a string, a number (`10`, `-1`, `1.5`), `true`/`false`, or `null`.
- Quoted strings, in double or single quotes. A quoted value is never turned into a number or a boolean.
- A list: `tags:` followed by indented `- item` lines.
- One level of nesting: `author:` followed by indented `name: value` lines.
- `# comments` outside quotes are dropped.

The named keys `title`, `description`, `category`, `version`, `status`, `deprecatedMessage` and `visibility` always come back as strings, and `tags` is always an array of strings (`tags: http` → `["http"]`, `tags:` → `[]`). Unknown keys get the parser's best guess.

> **Watch out:** if the closing `---` is missing, `parseFrontmatter` does not throw. It returns `{ metadata: {}, content: raw }` with the whole input untouched. Check `metadata.title` if you need to know parsing worked.

## VALIDATION

Validators look at documents and report problems without throwing. Each one returns a `ValidationResult`: `{ valid, issues }`. Every issue has a `severity` of `"error"` or `"warning"`, a short `code`, a `message`, and usually a `documentId`.

`valid` is `false` only when at least one issue is an error. Warnings never make a result invalid, so read `issues` if you want to see them.

`validateAll` runs every check in one call. Pass a navigation tree as the second argument to have it checked too.

```ts
import {
  createDocumentRegistry,
  createMarkdownDocument,
  validateAll,
} from "@zudojs/docs";
import type { DocumentationNavigationItem } from "@zudojs/docs";

const registry = createDocumentRegistry();
registry.registerAll([
  createMarkdownDocument("intro", "Introduction", "See [Setup](setup)."),
  createMarkdownDocument("setup", "Setup", "See [Deploy](deploy)."),
]);

const navigation: DocumentationNavigationItem[] = [
  {
    title: "Start",
    children: [
      { title: "Introduction", documentId: "intro" },
      { title: "Setup", documentId: "setup" },
      { title: "Missing", documentId: "missing" },
    ],
  },
];

const result = validateAll(registry.getAll(), navigation);

console.log(result.valid); // false
for (const issue of result.issues) {
  console.log(issue.severity, issue.code, issue.message);
}
// warning BROKEN_LINK Document "setup" links to "deploy" which is not registered.
// error NAVIGATION_UNKNOWN_DOCUMENT Navigation item "Missing" references unknown document "missing".
```

The broken link is only a warning, so on its own it would not have made `valid` false. The navigation entry pointing at a page that does not exist is an error.

### The individual validators

| Function | What it checks | Issue codes |
| --- | --- | --- |
| `validateDocument(doc)` | ID shape, required fields, content shape, allowed `category`/`status`/`visibility` values, structured node types. | MISSING_ID, INVALID_ID, MISSING_TITLE, MISSING_CONTENT, INVALID_CONTENT_TYPE, INVALID_CATEGORY, INVALID_STATUS, INVALID_VISIBILITY, INVALID_TAGS, INVALID_NODE (errors); DEPRECATED_WITHOUT_MESSAGE, DEPRECATION_MISMATCH (warnings) |
| `validateNoDuplicateIds(docs)` | Two documents in the array with the same ID. | DUPLICATE_ID (error) |
| `validateLinks(doc, ids, options?)` | Markdown `[text](target)` links and structured `link` nodes point at a registered ID. Links whose scheme is not http, https, mailto, tel, ftp or ftps are `UNSAFE_LINK` errors; other external URLs, `#anchors`, images and links inside code are skipped. | UNSAFE_LINK (error); BROKEN_LINK, LINK_VALIDATION_SKIPPED (warnings) |
| `validateNavigation(items, ids)` | Every `documentId` in the tree is registered; no cycles; no empty items. | NAVIGATION_UNKNOWN_DOCUMENT, NAVIGATION_CYCLE (errors); NAVIGATION_DUPLICATE_DOCUMENT, NAVIGATION_EMPTY_ITEM (warnings) |
| `validateAll(docs, navigation?, options?)` | All of the above, plus pages that are registered but not in the navigation. | NAVIGATION_ORPHAN_DOCUMENT (warning; turn off with `{ reportOrphans: false }`) |

> **In plain words:** the `ids` argument is a `Set` of every document ID you know about. `registry.idSet()` builds it for you. A link counts as valid when its target, resolved relative to the current document, is in that set.

## NAVIGATION

A *navigation tree* is an array of `{ title, documentId?, children? }` items, nested as deep as you like. It is kept separate from the documents, so you can reorder a sidebar without touching any page.

The helpers answer common questions about the tree: where am I, what is next, what else is at this level.

```ts
import {
  getBreadcrumbs,
  getAdjacent,
  getSiblings,
  flattenNavigation,
  findNavigationItem,
} from "@zudojs/docs";
import type { DocumentationNavigationItem } from "@zudojs/docs";

const navigation: DocumentationNavigationItem[] = [
  {
    title: "Start",
    children: [
      { title: "Introduction", documentId: "intro" },
      { title: "Setup", documentId: "setup" },
      { title: "First app", documentId: "first-app" },
    ],
  },
  { title: "Reference", documentId: "reference" },
];

console.log(getBreadcrumbs("setup", navigation));
// [{ title: "Start" }, { title: "Setup", documentId: "setup" }]

console.log(getAdjacent("setup", navigation));
// { previous: "intro", next: "first-app" }

console.log(getSiblings("setup", navigation));
// ["intro", "first-app"]

console.log(flattenNavigation(navigation));
// ["intro", "setup", "first-app", "reference"]

console.log(findNavigationItem("setup", navigation));
// { title: "Setup", documentId: "setup" }
```

`getAdjacent` only looks at the same level. For `"reference"`, which is alone at the top level, it returns `{}`. A document ID that is not in the tree gives an empty breadcrumb list, an empty sibling list, and `undefined` from `findNavigationItem`.

> **Tip:** a section item with no `documentId` (like `"Start"` above) is a heading in the sidebar. It appears in breadcrumbs by title only. Give it a `documentId` if the section has its own landing page.

## GENERATORS

Generators turn documents into output you can hand to another tool. There are three: `generateMarkdown` for one page, `generateJSON` for one page as a plain object, and `generateIndex` for a list of page summaries without content.

This example generates Markdown with frontmatter, then builds an index that hides a server-only page.

```ts
import {
  createMarkdownDocument,
  generateMarkdown,
  generateIndex,
} from "@zudojs/docs";

const setup = createMarkdownDocument(
  "setup",
  "Setup",
  "# Setup\n\nRun npm install.",
  { category: "guide", tags: ["start"], version: "1.0" },
);

console.log(generateMarkdown(setup));
// ---
// title: Setup
// category: guide
// tags:
//   - start
// version: "1.0"
// ---
//
// # Setup
//
// Run npm install.

const docs = [
  setup,
  createMarkdownDocument("ops.secrets", "Secrets", "# Secrets", { visibility: "SERVER" }),
];

console.log(generateIndex(docs).map((d) => d.id));
// ["setup"]            (SERVER pages are left out by default)

console.log(generateIndex(docs, { visibility: "ALL" }).map((d) => d.id));
// ["setup", "ops.secrets"]
```

### Options

| Function | Option | Effect |
| --- | --- | --- |
| `generateMarkdown(doc, options?)` | `includeFrontmatter` | Default `true`. Set `false` to get only the body. |
|  | `includeMeta` | Default `false`. Appends `**Owner:**` and `**Updated:**` lines from `metadata`. |
|  | `sanitizer` | An object with a `sanitize(string)` method. Applied to `html` and `mdx` content only. |
| `generateIndex(docs, options?)` | `visibility` | `"CLIENT"` (default), `"SERVER"` or `"ALL"`. |
| `generateJSON(doc)` | none | Returns all document fields including `content` as a plain object. |

> **In plain words:** structured content becomes Markdown too. Headings become `#` lines, code nodes become fenced blocks, callouts become `> **TIP:**` quotes. The generator escapes values so a stray backtick or pipe inside a node cannot break the output.

## CODE EXAMPLES

A `DocumentationExample` is a code snippet with an `id`, a `language` and the `code` itself, plus an optional `title` and `description`. You can check one is complete and render it as a Markdown code block.

```ts
import { validateExample, renderExampleMarkdown } from "@zudojs/docs";
import type { DocumentationExample } from "@zudojs/docs";

const example: DocumentationExample = {
  id: "hello",
  title: "Hello",
  language: "ts",
  code: 'console.log("hi");',
  description: "Prints hi.",
};

console.log(validateExample(example));
// { valid: true, errors: [] }

console.log(validateExample({ id: "", language: "", code: "" }).errors);
// ["Example ID is required.", "Example requires a language.", "Example requires code content."]

console.log(renderExampleMarkdown(example));
// ### Hello
//
// Prints hi.
//
// ```ts
// console.log("hi");
// ```
```

`validateExample` returns `{ valid, errors }` with plain strings, not `ValidationIssue` objects. `exampleToJSON(example)` gives you a plain object with the same five fields.

## UTILITIES

Small pure functions for IDs, links and Markdown text. They are the same helpers the validators use internally.

```ts
import {
  documentIdFromPath,
  resolveDocumentLink,
  isValidDocumentId,
  normalizeDocumentId,
  extractTitleFromMarkdown,
  extractHeadings,
  stripMarkdown,
} from "@zudojs/docs";

console.log(documentIdFromPath("guides/http/routing.md"));      // "guides.http.routing"
console.log(resolveDocumentLink("guides.http.routing", "../auth"));   // "guides.auth"
console.log(resolveDocumentLink("guides.http.routing", "./middleware")); // "guides.http.middleware"
console.log(isValidDocumentId("guides.http"));  // true
console.log(isValidDocumentId("guides/http"));  // false
console.log(normalizeDocumentId(" .a..b. "));    // "a.b"

const md = "# Setup\n\n## Install\n\n**bold** and [a link](x)";
console.log(extractTitleFromMarkdown(md)); // "Setup"
console.log(extractHeadings(md));          // [{ level: 1, text: "Setup" }, { level: 2, text: "Install" }]
console.log(stripMarkdown(md));            // "Setup\n\nInstall\n\nbold and a link"
```

Headings inside fenced code blocks are ignored by `extractTitleFromMarkdown` and `extractHeadings`, so a `# comment` in a shell example does not become a title.

## API REFERENCE

Everything below is exported from `@zudojs/docs`.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createDocument(options)` | Builds a frozen document from an options object. | Throws `DocumentValidationError` on missing id/title/content or a bad ID. |
| `createMarkdownDocument(id, title, markdown, extras?)` | Shortcut for markdown content. | `extras` takes every optional document field. |
| `createStructuredDocument(id, title, nodes, extras?)` | Shortcut for structured content. | Node types are checked by `validateDocument`, not here. |
| `createDocumentRegistry()` | Returns a new, empty `DocumentRegistry`. | Same as `new DocumentRegistry()`. |
| `matchesVisibility(doc, filter?)` | True when a document passes a `"CLIENT" \| "SERVER" \| "ALL"` filter. | Used by `getAll` and `generateIndex`. |
| `parseFrontmatter(raw)` | Splits a Markdown string into `{ metadata, content }`. | Never throws; returns empty metadata when there is no block. |
| `serializeFrontmatter(metadata, content)` | Writes a frontmatter block followed by the content. | Quotes values that could be misread. |
| `validateDocument`, `validateNoDuplicateIds`, `validateLinks`, `validateNavigation`, `validateAll` | Return a `ValidationResult`. | See [Validation](#validation). |
| `toValidationResult(issues)` | Builds `{ valid, issues }` from an issue list. | Handy when writing your own checks. |
| `getBreadcrumbs`, `flattenNavigation`, `findNavigationItem`, `getSiblings`, `getAdjacent` | Read a navigation tree. | All take `(documentId, items)` except `flattenNavigation(items)`. |
| `generateMarkdown(doc, options?)` | One document to a Markdown string. | Options: `includeFrontmatter`, `includeMeta`, `sanitizer`. |
| `generateJSON(doc)` | One document to a plain object. | Includes `content`. |
| `generateIndex(docs, options?)` | Array of summaries without content. | Default `visibility: "CLIENT"`. |
| `nodesToMarkdown(nodes)` | Structured nodes to Markdown. | Throws `TypeError` on an unknown node type. |
| `validateExample`, `renderExampleMarkdown`, `exampleToJSON` | Work with a `DocumentationExample`. | See [Code Examples](#code-examples). |
| `isValidDocumentId`, `normalizeDocumentId`, `documentIdFromPath`, `resolveDocumentLink`, `stripLinkDecorations` | ID and link helpers. | Pure functions on strings. |
| `extractTitleFromMarkdown`, `extractHeadings`, `stripMarkdown`, `stripFencedCodeBlocks` | Markdown text helpers. | Ignore fenced code where relevant. |
| `deepFreeze(value)`, `deepFreezeClone(value)` | Freeze an object tree, in place or as a copy. | The builders and registry use `deepFreezeClone`. |
| `createDocumentationError(message, options?)`, `isDocumentationError(value)` | Create or detect a `DocumentationError`. |  |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `DocumentRegistry` | Stores documents by ID. | See the [Registry](#registry) method table. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `DocumentationDocument` | The document shape. | See [Documents](#documents). |
| `DocumentationContent`, `DocumentationNode` | Content union and structured node union. | Node interfaces: `HeadingNode`, `ParagraphNode`, `CodeNode`, `ListNode`, `LinkNode`, `TableNode`, `QuoteNode`, `CalloutNode`. |
| `DocumentationCategory`, `DocumentationStatus` | String unions for `category` and `status`. |  |
| `DocumentBuilderOptions`, `DocumentBuilderExtras` | Arguments to `createDocument` and the shortcut builders. |  |
| `DocumentationNavigationItem`, `DocumentationBreadcrumb` | Navigation tree item and breadcrumb entry. |  |
| `ValidationResult`, `ValidationIssue`, `ValidateAllOptions`, `ValidateLinksOptions` | Validator output and options. | `maxContentLength`, `reportOrphans`. |
| `ParsedFrontmatter`, `FrontmatterMetadata`, `FrontmatterValue` | Frontmatter parser output. |  |
| `MarkdownGeneratorOptions`, `IndexGeneratorOptions`, `DocumentVisibilityFilter`, `GetAllOptions` | Generator and registry options. |  |
| `DocumentationExample`, `ExampleValidationResult` | Code example shape and its check result. |  |
| `DocumentationProvider`, `DocumentationSanitizer`, `DocumentationSourceLoader` | Interfaces you can implement. | The registry implements `DocumentationProvider`. The package ships no loader. |
| `APISymbol`, `APIExample`, `APIParameter`, `SearchDocument`, `SearchResult`, `DocumentationVersion` | Type contracts for tools built on top of this package. | Types only. There is no extractor, search index or version manager in this package. |

### Errors

All error classes are defined in `@zudojs/errors` and re-exported here so one import is enough.

| Name | What it does | Notes |
| --- | --- | --- |
| `DocumentationError` | Base class for every error below. | Use `isDocumentationError(err)` to test for it. |
| `DocumentValidationError` | Thrown by the three builders. | Missing id/title/content or an invalid ID. |
| `DuplicateDocumentError` | Thrown by `register` and `registerAll`. | Message: `Document "id" is already registered.` |
| `DocumentNotFoundError`, `BrokenDocumentationLinkError`, `InvalidFrontmatterError`, `InvalidNavigationError`, `ExampleValidationError`, `DocumentParseError`, `GenerationError`, `DocumentationVersionError` | Exported for your own code. | Nothing in this package throws them. Validators report issues instead of throwing. |

### Constants

| Name | What it does | Notes |
| --- | --- | --- |
| `DEFAULT_MAX_LINK_SCAN_LENGTH` | Longest Markdown (in characters) that `validateLinks` scans. | `100000`. Longer content gets a `LINK_VALIDATION_SKIPPED` warning. |

Navigation walkers stop at a depth of 64 and report deeper trees as `NAVIGATION_CYCLE`; that limit is internal and not exported.

## COMMON MISTAKES

- **Using a file path as an ID** → `createDocument({ id: "guides/http" })` throws `DocumentValidationError` because `/` is not allowed. → Convert it first: `documentIdFromPath("guides/http.md")` gives `"guides.http"`.
- **Treating `valid: true` as "no issues"** → Broken links and orphan pages are warnings, so the result stays valid and they go unnoticed. → Log or fail on `result.issues.length > 0` when you want a strict build.
- **Passing an array of documents to `validateLinks`** → It expects a `Set` of IDs as the second argument, so every link is reported as broken. → Use `registry.idSet()` or `new Set(docs.map((d) => d.id))`.
- **Expecting `generateIndex` to list every page** → Pages with `visibility: "SERVER"` are missing because the default filter is `"CLIENT"`. → Pass `{ visibility: "ALL" }` when you want all of them.
- **Editing a document after registering it** → The registry stores a frozen copy, so the edit is ignored or throws in strict mode. → Build a new document and call `delete(id)` then `register(doc)`.
- **Registering the same ID twice** → `DuplicateDocumentError` is thrown and `registerAll` stops part-way. → Check `registry.has(id)` first, or run `validateNoDuplicateIds` on the array before registering.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — defines every error class this package throws or re-exports. Reach for it when you build your own error types.
- [@zudojs/openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md) — describes HTTP APIs as OpenAPI documents. Pair it with this package when the API reference should sit next to hand-written guides.
- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — validates data shapes. Use it to check frontmatter metadata against a schema before turning it into documents.
- [zudojs-cli](https://zudojs.oyinlola.site/docs/packages-cli.md) — `zudojs add docs` installs this package into a project.

## COMPLETE EXPORT INDEX

Every name `@zudojs/docs` exports from its package root at v1.1.0 — **104** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 104 exports**

Classes (12)

`BrokenDocumentationLinkError` `DocumentationError` `DocumentationVersionError` `DocumentNotFoundError` `DocumentParseError` `DocumentRegistry` `DocumentValidationError` `DuplicateDocumentError` `ExampleValidationError` `GenerationError` `InvalidFrontmatterError` `InvalidNavigationError`

Functions (42)

`clampHeadingLevel` `createDocument` `createDocumentationError` `createDocumentRegistry` `createMarkdownDocument` `createStructuredDocument` `deepFreeze` `deepFreezeClone` `documentIdFromPath` `exampleToJSON` `extractHeadings` `extractTitleFromMarkdown` `fenceFor` `findNavigationItem` `flattenNavigation` `generateIndex` `generateJSON` `generateMarkdown` `getAdjacent` `getBreadcrumbs` `getSiblings` `isDocumentationError` `isValidDocumentId` `matchesVisibility` `nodesToMarkdown` `normalizeDocumentId` `parseFrontmatter` `renderExampleMarkdown` `resolveDocumentLink` `sanitizeLanguage` `serializeFrontmatter` `stripFencedCodeBlocks` `stripLinkDecorations` `stripMarkdown` `tableCell` `toValidationResult` `validateAll` `validateDocument` `validateExample` `validateLinks` `validateNavigation` `validateNoDuplicateIds`

Interfaces (40)

`APIExample` `APIParameter` `APISymbol` `CalloutNode` `CodeNode` `DocumentationBreadcrumb` `DocumentationDocument` `DocumentationErrorOptions` `DocumentationExample` `DocumentationMetadata` `DocumentationNavigationItem` `DocumentationProvider` `DocumentationSanitizer` `DocumentationSourceLoader` `DocumentationVersion` `DocumentBuilderOptions` `ExampleValidationResult` `FrontmatterMetadata` `GetAdjacentOptions` `GetAllOptions` `HeadingNode` `HTMLContent` `IndexGeneratorOptions` `LinkNode` `ListNode` `MarkdownContent` `MarkdownGeneratorOptions` `MDXContent` `ParagraphNode` `ParsedFrontmatter` `QuoteNode` `SearchDocument` `SearchResult` `SourceLocation` `StructuredContent` `TableNode` `ValidateAllOptions` `ValidateLinksOptions` `ValidationIssue` `ValidationResult`

Type aliases (9)

`APISymbolKind` `DocumentationCategory` `DocumentationContent` `DocumentationNode` `DocumentationStatus` `DocumentBuilderExtras` `DocumentVisibilityFilter` `FrontmatterScalar` `FrontmatterValue`

Constants (1)

`DEFAULT_MAX_LINK_SCAN_LENGTH`
