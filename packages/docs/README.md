# @zudojs/docs

Documentation infrastructure with structured document model, registry, validation, navigation, frontmatter parsing, and markdown/JSON generation.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-docs](https://zudojs.oyinlola.site/docs/packages-docs) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-docs.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/docs
```

## Quick Start

```typescript
import {
  createDocumentRegistry,
  createMarkdownDocument,
  validateAll,
  generateIndex,
} from "@zudojs/docs";

const registry = createDocumentRegistry();

registry.register(
  createMarkdownDocument(
    "getting-started",
    "Getting Started",
    "# Getting Started\n\nWelcome to Zudojs...",
    { category: "introduction", tags: ["intro"] },
  ),
);

// Or build the document object yourself
registry.register({
  id: "guides.http.routing",
  title: "HTTP Routing",
  content: { type: "markdown", value: "# Routing\n\n..." },
});

const result = validateAll(registry.getAll());
if (!result.valid) {
  console.error(result.issues);
}

const index = generateIndex(registry.getAll()); // SERVER-only docs excluded
```

## Features

- Document model with frontmatter (`parseFrontmatter` / `serializeFrontmatter` round-trip safely; `tags` always parses to a string array, and the body keeps its indentation)
- Document registry and discovery (`DuplicateDocumentError` on duplicate IDs, deep-frozen copies)
- Navigation tree helpers (breadcrumbs, siblings, previous/next, cycle-safe walkers)
- Markdown and JSON generation with escaping for untrusted content: structured text is HTML-escaped and links are limited to http, https, mailto, tel, ftp and ftps (others are written as plain text)
- Fail-closed `visibility` filtering: only an unset or exactly `"CLIENT"` visibility reaches a client index
- `stripMarkdown` and link validation run in linear time on untrusted input
- Document, link and navigation validation with a single `valid` rule (errors only); `javascript:` and other non-allow-listed link schemes are `UNSAFE_LINK` errors
- Documentation error classes re-exported from `@zudojs/errors`

## Use Cases

- API documentation
- User guides
- Knowledge bases
- Documentation sites
