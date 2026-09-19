/**
 * @zudojs/docs — Audit round 10 regression tests.
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
  stripMarkdown,
  validateAll,
  validateLinks,
} from "../src/index.js";

function elapsed(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("tooling/DOCS-01", () => {
  it("strips 10k newlines and 50k spaces in linear time", () => {
    // Previously 2,000 newlines took ~6 s and 10,000 did not finish.
    expect(elapsed(() => stripMarkdown("\n".repeat(10_000)))).toBeLessThan(1_000);
    expect(elapsed(() => stripMarkdown(" ".repeat(50_000)))).toBeLessThan(1_000);
    expect(elapsed(() => stripMarkdown("\n ".repeat(20_000)))).toBeLessThan(1_000);
    expect(elapsed(() => stripMarkdown("`".repeat(50_000)))).toBeLessThan(1_000);
    expect(elapsed(() => stripMarkdown("[a".repeat(25_000)))).toBeLessThan(1_000);
  });

  it("still strips tables, headings and emphasis", () => {
    const md = "# Title ##\n\n| a | b |\n| --- | :---: |\n| **x** | _y_ |";
    expect(stripMarkdown(md)).toBe("Title\n\na b\n\nx y");
  });
});

describe("tooling/DOCS-02", () => {
  it("scans a 99 KB run of `[` or `[](` quickly", () => {
    const ids = new Set<string>();
    for (const unit of ["[", "[](", "[a]( ", "`"]) {
      const doc = createMarkdownDocument("a.b", "T", unit.repeat(Math.floor(99_000 / unit.length)));
      // Previously ~30 s for 99,000 `[`.
      expect(elapsed(() => validateLinks(doc, ids))).toBeLessThan(1_000);
    }
  });

  it("still finds links with titles and angle targets", () => {
    const doc = createMarkdownDocument("a.b", "T", '[x](missing "t") [y](<gone>)');
    expect(validateLinks(doc, new Set()).issues.map((i) => i.code)).toEqual([
      "BROKEN_LINK",
      "BROKEN_LINK",
    ]);
  });
});

describe("tooling/DOCS-03", () => {
  it("always parses tags to a string array", () => {
    expect(parseFrontmatter("---\ntags: http\n---\nx").metadata.tags).toEqual(["http"]);
    expect(parseFrontmatter("---\ntags:\n---\nx").metadata.tags).toEqual([]);
    expect(parseFrontmatter("---\ntags: [a, 'b, c']\n---\nx").metadata.tags).toEqual(["a", "b, c"]);
  });

  it("does not split a string tag into characters", () => {
    const { metadata, content } = parseFrontmatter("---\ntitle: T\ntags: http\n---\nx");
    const doc = createDocument({ id: "a", title: "T", content: { type: "markdown", value: content }, tags: metadata.tags });
    expect(doc.tags).toEqual(["http"]);
    const fromString = createDocument({ id: "a", title: "T", content: { type: "markdown", value: "" }, tags: "http" as never });
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
      { type: "link", value: "click me", href: "javascript:alert(document.cookie)" },
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
    expect(registry.getAll({ visibility: "SERVER" }).map((d) => d.id)).toEqual(["ops.runbook"]);
  });
});

describe("tooling/DOCS-06", () => {
  it("keeps body indentation, leading blank lines and lossless numbers", () => {
    for (const body of ["    const x = 1;\nmore", "\n\n# H"]) {
      expect(parseFrontmatter(serializeFrontmatter({ title: "T" }, body)).content).toBe(body);
    }
    const meta = { big: 1e21, small: 1.5e-7, text: "1e+21" };
    expect(parseFrontmatter(serializeFrontmatter(meta, "")).metadata).toEqual(meta);
  });
});
