/**
 * @zudojs/docs — Audit round 10 regression tests (frontmatter, generation, visibility).
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source.
 */

import { describe, it, expect } from "vitest";

import {
  createDocument,
  createDocumentRegistry,
  createMarkdownDocument,
  createStructuredDocument,
  generateIndex,
  nodesToMarkdown,
  parseFrontmatter,
  serializeFrontmatter,
  validateAll,
} from "../src/index.js";

describe("tooling/DOCS-03", () => {
  it("always parses tags to a string array", () => {
    expect(parseFrontmatter("---\ntags: http\n---\nx").metadata.tags).toEqual([
      "http",
    ]);
    expect(parseFrontmatter("---\ntags:\n---\nx").metadata.tags).toEqual([]);
    expect(
      parseFrontmatter("---\ntags: [a, 'b, c']\n---\nx").metadata.tags,
    ).toEqual(["a", "b, c"]);
  });

  it("does not split a string tag into characters", () => {
    const { metadata, content } = parseFrontmatter(
      "---\ntitle: T\ntags: http\n---\nx",
    );
    const doc = createDocument({
      id: "a",
      title: "T",
      content: { type: "markdown", value: content },
      tags: metadata.tags,
    });
    expect(doc.tags).toEqual(["http"]);
    const fromString = createDocument({
      id: "a",
      title: "T",
      content: { type: "markdown", value: "" },
      tags: "http" as never,
    });
    expect(fromString.tags).toEqual(["http"]);
  });

  it("round-trips empty arrays and objects", () => {
    const text = serializeFrontmatter({ title: "T", tags: [], extra: {} }, "x");
    const { metadata } = parseFrontmatter(text);
    expect(metadata.tags).toEqual([]);
    expect({ ...(metadata.extra as object) }).toEqual({});
  });
});

describe("tooling/DOCS-04", () => {
  it("does not emit a javascript: link or raw HTML from structured nodes", () => {
    const md = nodesToMarkdown([
      {
        type: "link",
        value: "click me",
        href: "javascript:alert(document.cookie)",
      },
      { type: "link", value: "x", href: " JavaScript:alert(1)" },
      { type: "paragraph", value: "<img src=x onerror=alert(1)>" },
      { type: "table", headers: ["h"], rows: [["<script>alert(2)</script>"]] },
      { type: "link", value: "ok", href: "https://example.com/?a=1&b=2" },
    ]);
    expect(md.toLowerCase()).not.toContain("javascript:");
    expect(md).not.toMatch(/<img|<script/);
    expect(md).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(md).toContain("[ok](https://example.com/?a=1&amp;b=2)");
  });

  it("reports unsafe link schemes from validateAll", () => {
    const doc = createStructuredDocument("a", "A", [
      { type: "link", value: "x", href: "javascript:alert(1)" },
    ]);
    const result = validateAll([doc]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "UNSAFE_LINK")).toBe(true);
  });
});

describe("tooling/DOCS-05", () => {
  it("keeps a lowercase or mistyped server visibility out of the client index", () => {
    const registry = createDocumentRegistry();
    const parsed = parseFrontmatter("---\nvisibility: server\n---\nsecret");
    registry.register(
      createMarkdownDocument("ops.runbook", "Runbook", parsed.content, {
        visibility: parsed.metadata.visibility as "SERVER",
      }),
    );
    registry.register(createMarkdownDocument("pub", "Pub", "x"));
    expect(generateIndex(registry.getAll()).map((d) => d.id)).toEqual(["pub"]);
    expect(registry.getAll({ visibility: "SERVER" }).map((d) => d.id)).toEqual([
      "ops.runbook",
    ]);
  });
});

describe("tooling/DOCS-06", () => {
  it("keeps body indentation, leading blank lines and lossless numbers", () => {
    for (const body of ["    const x = 1;\nmore", "\n\n# H"]) {
      expect(
        parseFrontmatter(serializeFrontmatter({ title: "T" }, body)).content,
      ).toBe(body);
    }
    const meta = { big: 1e21, small: 1.5e-7, text: "1e+21" };
    expect(parseFrontmatter(serializeFrontmatter(meta, "")).metadata).toEqual(
      meta,
    );
  });
});
