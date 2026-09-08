# @zudojs/docs

Documentation infrastructure with structured document model, registry, validation, navigation, frontmatter parsing, and markdown/JSON generation.

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

- Document model with frontmatter (`parseFrontmatter` / `serializeFrontmatter` round-trip safely)
- Document registry and discovery (`DuplicateDocumentError` on duplicate IDs, deep-frozen copies)
- Navigation tree helpers (breadcrumbs, siblings, previous/next, cycle-safe walkers)
- Markdown and JSON generation with escaping for untrusted content and `visibility` filtering
- Document, link and navigation validation with a single `valid` rule (errors only)
- Documentation error classes re-exported from `@zudojs/errors`

## Use Cases

- API documentation
- User guides
- Knowledge bases
- Documentation sites
