---
"@zudojs/docs": patch
---

Round 10 audit fixes.

- `stripMarkdown` runs in linear time; 2 KB of newlines used to block for ~6 s (tooling/DOCS-01).
- `validateLinks` scans in linear time; a 99 KB document used to take ~30 s under the 100 KB scan cap (tooling/DOCS-02).
- Frontmatter `tags` always parses to a string array (`tags: http` → `["http"]`, `tags:` → `[]`, `tags: [a, b]` → `["a", "b"]`); `createDocument` no longer spreads a string tag into characters. Empty arrays/objects serialize as `[]`/`{}` and round-trip (tooling/DOCS-03).
- Structured-node markdown generation HTML-escapes text (`&`, `<`, `>`) outside code blocks and writes links whose scheme is not http, https, mailto, tel, ftp or ftps as plain text; `validateLinks`/`validateAll` report such links as `UNSAFE_LINK` errors (tooling/DOCS-04).
- Visibility filtering fails closed: only an unset or exactly `"CLIENT"` visibility reaches the `"CLIENT"` filter and `generateIndex`; every other value (e.g. `"server"`) is treated as server-only (tooling/DOCS-05).
- `parseFrontmatter` removes only the single blank separator line after the block, keeping body indentation and further blank lines; numeric literals become numbers only when the conversion is lossless (`1e+21` and `1.5e-7` round-trip, `007` stays a string) (tooling/DOCS-06).

Behaviour changes: structured paragraphs/tables/quotes/lists/headings are HTML-escaped; `javascript:`/`data:` links become plain text and fail validation; `getAll({ visibility: "SERVER" })` also returns documents with unrecognised visibility; frontmatter bodies are no longer left-trimmed.
