/**
 * Regression tests for the round 6 audit findings (DOCS-01..25).
 * Each block names the finding it guards.
 */
import { describe, it, expect } from "vitest";
import {
  createDocument,
  createMarkdownDocument,
  createStructuredDocument,
  createDocumentRegistry,
  parseFrontmatter,
  serializeFrontmatter,
  generateMarkdown,
  generateJSON,
  generateIndex,
  nodesToMarkdown,
  renderExampleMarkdown,
  validateExample,
  validateDocument,
  validateLinks,
  validateNavigation,
  validateAll,
  getBreadcrumbs,
  getSiblings,
  getAdjacent,
  flattenNavigation,
  findNavigationItem,
  normalizeDocumentId,
  documentIdFromPath,
  resolveDocumentLink,
  extractTitleFromMarkdown,
  extractHeadings,
  stripMarkdown,
  isValidDocumentId,
  DocumentValidationError,
  DuplicateDocumentError,
  isDocumentationError,
  type DocumentationNavigationItem,
  type DocumentationNode,
  type APIExample,
} from "../src/index.js";

describe("DOCS-01 createStructuredDocument", () => {
  it("produces a structured content object with nodes", () => {
    const nodes: DocumentationNode[] = [
      { type: "heading", level: 1, value: "Hi" },
      { type: "paragraph", value: "Body" },
    ];
    const doc = createStructuredDocument("s", "S", nodes);

    expect(doc.content).toEqual({ type: "structured", nodes });
    expect(generateMarkdown(doc, { includeFrontmatter: false })).toContain(
      "# Hi",
    );
    expect(validateDocument(doc).valid).toBe(true);
  });
});

describe("DOCS-02 frontmatter delimiters", () => {
  it("does not treat --- inside a value as a delimiter", () => {
    const result = parseFrontmatter("---\ntitle: a---b\nx: 1\n---\nBody");
    expect(result.metadata).toEqual({ title: "a---b", x: 1 });
    expect(result.content).toBe("Body");
  });

  it("keeps body text containing ---", () => {
    const result = parseFrontmatter("---\n---\nBody with --- inside and more");
    expect(result.content).toBe("Body with --- inside and more");
  });

  it("does not treat a horizontal rule as a frontmatter block", () => {
    const input = "----\nBody\n---\nMore";
    expect(parseFrontmatter(input)).toEqual({ metadata: {}, content: input });
  });

  it("requires the opening delimiter on its own line", () => {
    const input = "---title: a\n---\nBody";
    expect(parseFrontmatter(input).metadata).toEqual({});
  });
});

describe("DOCS-03 frontmatter quoting", () => {
  it("round-trips values with newlines, colons and hashes", () => {
    const metadata = {
      title: "Hi\n---\n<script>x</script>",
      description: "a: b # c",
      tags: ["a\nvisibility: SERVER", "-dash", "true"],
      version: "1.0",
      priority: 5,
      draft: false,
    };
    const parsed = parseFrontmatter(serializeFrontmatter(metadata, "Body"));

    expect(parsed.metadata).toEqual(metadata);
    expect(parsed.content).toBe("Body");
  });

  it("generateMarkdown cannot be used to inject metadata keys", () => {
    const doc = createMarkdownDocument(
      "x",
      "T\ndescription: injected\n---\n# pwned",
      "content",
      { tags: ["t\nstatus: internal"], deprecated: true, deprecatedMessage: "line1\nline2" },
    );
    const md = generateMarkdown(doc);
    const parsed = parseFrontmatter(md);

    expect(parsed.metadata.title).toBe("T\ndescription: injected\n---\n# pwned");
    expect(parsed.metadata.description).toBeUndefined();
    expect(parsed.metadata.status).toBeUndefined();
    expect(parsed.metadata.tags).toEqual(["t\nstatus: internal"]);
    expect(md).toContain("> line1\n> line2");
  });

  it("serializes objects and dates as quoted strings", () => {
    const out = serializeFrontmatter(
      { when: new Date("2026-01-01T00:00:00.000Z"), nested: { a: 1, b: "x" } },
      "",
    );
    expect(out).toContain('when: "2026-01-01T00:00:00.000Z"');
    expect(out).toContain("nested:\n  a: 1\n  b: x");
  });
});

describe("DOCS-04 prototype pollution", () => {
  it("ignores __proto__, constructor and prototype keys", () => {
    const m = parseFrontmatter(
      "---\n__proto__:\n  - x\nconstructor: 5\nprototype: y\ntoString: z\nok: 1\n---\n",
    ).metadata;

    expect(Object.keys(m)).toEqual(["toString", "ok"]);
    expect(Object.getPrototypeOf(m)).toBe(Object.prototype);
    expect(Array.isArray(Object.getPrototypeOf(m))).toBe(false);
    expect((m as { constructor: unknown }).constructor).toBe(Object);
  });

  it("rejects keys with invalid syntax", () => {
    const m = parseFrontmatter("---\n# note: hi\nbad key: 1\ngood-key: 2\n---\n")
      .metadata;
    expect(m).toEqual({ "good-key": 2 });
  });
});

describe("DOCS-05 error classes", () => {
  it("throws DuplicateDocumentError from the registry", () => {
    const registry = createDocumentRegistry();
    registry.register(createMarkdownDocument("a", "A", ""));
    let caught: unknown;
    try {
      registry.register(createMarkdownDocument("a", "A", ""));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DuplicateDocumentError);
    expect(isDocumentationError(caught)).toBe(true);
  });

  it("throws DocumentValidationError from createDocument", () => {
    expect(() => createDocument({ id: "", title: "t", content: { type: "markdown", value: "" } })).toThrow(
      DocumentValidationError,
    );
    expect(() => createMarkdownDocument("x", "", "")).toThrow(DocumentValidationError);
  });
});

describe("DOCS-07 / DOCS-19 link validation", () => {
  const ids = new Set(["x", "y", "t", "guides.http.routing", "guides.db"]);

  it("ignores anchors, images, schemes, code and titles", () => {
    const md = [
      "[a](#anchor)",
      "![img](pic.png)",
      '[b](./x.md "title")',
      "[c](mailto:a@b.c)",
      "[d](//cdn.x/y)",
      "[e](ftp://x)",
      "`[f](nope)`",
      "```\n[g](nope)\n```",
      "[h](<x>)",
      "[i](x#frag)",
    ].join("\n");
    const doc = createMarkdownDocument("t", "T", md);
    const result = validateLinks(doc, ids);

    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("resolves relative links against the document id", () => {
    const doc = createMarkdownDocument(
      "guides.http.middleware",
      "T",
      "[r](./routing.md#setup) [db](../db) [bad](../nope)",
    );
    const result = validateLinks(doc, ids);

    expect(result.issues.map((i) => i.code)).toEqual(["BROKEN_LINK"]);
    expect(result.issues[0]?.message).toContain("../nope");
  });

  it("validates structured link nodes", () => {
    const doc = createStructuredDocument("s", "S", [
      { type: "link", href: "missing", value: "m" },
      { type: "link", href: "x", value: "ok" },
    ]);
    const result = validateLinks(doc, ids);
    expect(result.issues).toHaveLength(1);
  });

  it("resolveDocumentLink strips fragments, extensions and backslashes", () => {
    expect(resolveDocumentLink("guides.http", "./routing.md")).toBe("guides.routing");
    expect(resolveDocumentLink("guides.http", "#section")).toBe("guides");
    expect(resolveDocumentLink("guides.http", "..\\db")).toBe("db");
  });
});

describe("DOCS-08 valid semantics and size cap", () => {
  it("warnings never make a link result invalid", () => {
    const doc = createMarkdownDocument("t", "T", "[a](nope)");
    const result = validateLinks(doc, new Set());
    expect(result.issues[0]?.severity).toBe("warning");
    expect(result.valid).toBe(true);
  });

  it("reports LINK_VALIDATION_SKIPPED instead of silently passing", () => {
    const doc = createMarkdownDocument("t", "T", "[a](nope)" + "x".repeat(100));
    const result = validateLinks(doc, new Set(), { maxContentLength: 50 });
    expect(result.issues.map((i) => i.code)).toEqual(["LINK_VALIDATION_SKIPPED"]);
  });
});

describe("DOCS-09 / DOCS-10 ids", () => {
  it("documentIdFromPath only strips the final extension", () => {
    expect(documentIdFromPath("guides/v1.2/routing")).toBe("guides.v1.2.routing");
    expect(documentIdFromPath("a/b.test.md")).toBe("a.b.test");
    expect(documentIdFromPath(".gitignore")).toBe("");
    expect(documentIdFromPath("./guides/x.md")).toBe("guides.x");
  });

  it("normalizeDocumentId trims before stripping dots", () => {
    expect(normalizeDocumentId(" .a. ")).toBe("a");
  });

  it("rejects ids with whitespace or invalid characters", () => {
    expect(isValidDocumentId(" a b ")).toBe(false);
    expect(isValidDocumentId("a..b")).toBe(false);
    expect(isValidDocumentId("guides.http-v2_x")).toBe(true);
    expect(() => createMarkdownDocument(" a b ", "T", "")).toThrow(DocumentValidationError);
    expect(
      validateDocument({ id: " a b ", title: "T", content: { type: "markdown", value: "" } })
        .issues.map((i) => i.code),
    ).toEqual(["INVALID_ID"]);
  });
});

describe("DOCS-11 scalar parsing", () => {
  it("unquotes strings, coerces only canonical numbers, handles null and comments", () => {
    const m = parseFrontmatter(
      [
        "---",
        'version: "0.0.1"',
        "id: 007",
        "big: 99999999999999999999",
        "neg: -1",
        "flt: 1.5",
        "nul: null",
        "tilde: ~",
        "quoted: 'it''s'",
        'esc: "a\\nb"',
        "title: X # trailing",
        "empty:",
        "next: 1",
        "meta:",
        "  owner: bob",
        "  n: 2",
        "---",
        "",
      ].join("\n"),
    ).metadata;

    expect(m.version).toBe("0.0.1");
    expect(m.id).toBe("007");
    expect(m.big).toBe("99999999999999999999");
    expect(m.neg).toBe(-1);
    expect(m.flt).toBe(1.5);
    expect(m.nul).toBeNull();
    expect(m.tilde).toBeNull();
    expect(m.quoted).toBe("it's");
    expect(m.esc).toBe("a\nb");
    expect(m.title).toBe("X");
    expect(m.empty).toBe("");
    expect(m.next).toBe(1);
    expect(m.meta).toEqual({ owner: "bob", n: 2 });
  });
});

describe("DOCS-12 node rendering", () => {
  it("escapes table cells", () => {
    const md = nodesToMarkdown([
      { type: "table", headers: ["a|b", "c"], rows: [["1\n2", "3"]] },
    ]);
    expect(md).toContain("| a\\|b | c |");
    expect(md).toContain("| 1<br>2 | 3 |");
  });

  it("chooses a fence longer than the content and sanitizes the language", () => {
    const md = nodesToMarkdown([
      { type: "code", language: "js\n# heading", value: "```\nx" },
    ]);
    expect(md.startsWith("````js\n")).toBe(true);
    expect(md).toContain("```\nx\n````");
    expect(md).not.toContain("# heading");
  });

  it("clamps heading levels and rejects unknown node types", () => {
    expect(nodesToMarkdown([{ type: "heading", level: -1 as 1, value: "x" }])).toContain("# x");
    expect(nodesToMarkdown([{ type: "heading", level: 9 as 1, value: "x" }])).toContain("###### x");
    expect(() => nodesToMarkdown([{ type: "bogus" } as unknown as DocumentationNode])).toThrow(TypeError);
  });

  it("escapes link text and hrefs", () => {
    const md = nodesToMarkdown([{ type: "link", href: "a b)", value: "x]y" }]);
    expect(md).toContain("[x\\]y](<a b)>)");
  });

  it("renders examples with a safe fence", () => {
    const md = renderExampleMarkdown({ id: "e", language: "js\n# heading", code: "```\nx" });
    expect(md).toBe("````js\n```\nx\n````");
  });
});

describe("DOCS-13 visibility", () => {
  it("emits visibility and deprecation fields in JSON and frontmatter", () => {
    const doc = createMarkdownDocument("x", "T", "b", {
      visibility: "SERVER",
      deprecated: true,
      deprecatedMessage: "gone",
    });
    expect(generateJSON(doc).visibility).toBe("SERVER");
    const meta = parseFrontmatter(generateMarkdown(doc)).metadata;
    expect(meta).toMatchObject({ visibility: "SERVER", deprecated: true, deprecatedMessage: "gone" });
  });

  it("excludes SERVER documents from the index by default", () => {
    const docs = [
      createMarkdownDocument("s", "S", "", { visibility: "SERVER" }),
      createMarkdownDocument("c", "C", "", { visibility: "CLIENT" }),
      createMarkdownDocument("u", "U", ""),
    ];
    expect(generateIndex(docs).map((d) => d.id)).toEqual(["c", "u"]);
    expect(generateIndex(docs, { visibility: "ALL" })).toHaveLength(3);
    expect(generateIndex(docs, { visibility: "SERVER" }).map((d) => d.id)).toEqual(["s"]);

    const registry = createDocumentRegistry();
    registry.registerAll(docs);
    expect(registry.getAll({ visibility: "CLIENT" }).map((d) => d.id)).toEqual(["c", "u"]);
    expect(registry.getAll()).toHaveLength(3);
  });

  it("applies a sanitizer to html and mdx content", () => {
    const doc = createDocument({ id: "h", title: "H", content: { type: "html", value: "<b>x</b>" } });
    const md = generateMarkdown(doc, {
      includeFrontmatter: false,
      sanitizer: { sanitize: (c) => c.replace(/<[^>]+>/g, "") },
    });
    expect(md).toBe("x");
  });
});

describe("DOCS-14 / DOCS-15 / DOCS-21 navigation", () => {
  const nav: DocumentationNavigationItem[] = [
    {
      title: "Guides",
      documentId: "guides",
      children: [
        { title: "R", documentId: "r" },
        { title: "S", documentId: "s" },
      ],
    },
  ];

  it("keeps the documentId of intermediate breadcrumb nodes", () => {
    expect(getBreadcrumbs("r", nav)).toEqual([
      { title: "Guides", documentId: "guides" },
      { title: "R", documentId: "r" },
    ]);
  });

  it("does not overflow on cyclic navigation", () => {
    const cyc: { title: string; children: DocumentationNavigationItem[] } = { title: "c", children: [] };
    cyc.children.push(cyc as DocumentationNavigationItem);
    expect(flattenNavigation([cyc])).toEqual([]);
    expect(getBreadcrumbs("x", [cyc])).toEqual([]);
    expect(findNavigationItem("x", [cyc])).toBeUndefined();
    expect(getSiblings("x", [cyc])).toEqual([]);

    const result = validateNavigation([cyc], new Set());
    expect(result.issues.some((i) => i.code === "NAVIGATION_CYCLE")).toBe(true);
  });

  it("reports duplicates, empty items and orphans", () => {
    const result = validateAll(
      [createMarkdownDocument("a", "A", ""), createMarkdownDocument("b", "B", "")],
      [{ title: "A", documentId: "a" }, { title: "A again", documentId: "a" }, { title: "Empty" }],
    );
    const codes = result.issues.map((i) => i.code).sort();
    expect(codes).toEqual([
      "NAVIGATION_DUPLICATE_DOCUMENT",
      "NAVIGATION_EMPTY_ITEM",
      "NAVIGATION_ORPHAN_DOCUMENT",
    ]);
    expect(result.valid).toBe(true);
    expect(flattenNavigation([{ documentId: "a", title: "1" }, { documentId: "a", title: "2" }])).toEqual(["a"]);
  });

  it("getAdjacent returns previous and next", () => {
    expect(getAdjacent("r", nav)).toEqual({ next: "s" });
    expect(getAdjacent("s", nav)).toEqual({ previous: "r" });
    expect(getAdjacent("nope", nav)).toEqual({});
  });
});

describe("DOCS-16 validateDocument structure", () => {
  it("rejects bad content types, statuses, categories, visibility and tags", () => {
    const result = validateDocument({
      id: "a",
      title: "T",
      content: { type: "bogus" } as never,
      status: "wat" as never,
      visibility: "PUBLIC" as never,
      category: "nope" as never,
      tags: ["", 1 as never],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code).sort()).toEqual([
      "INVALID_CATEGORY",
      "INVALID_CONTENT_TYPE",
      "INVALID_STATUS",
      "INVALID_TAGS",
      "INVALID_VISIBILITY",
    ]);
  });

  it("validates structured node shapes", () => {
    const result = validateDocument({
      id: "a",
      title: "T",
      content: { type: "structured", nodes: [{ type: "heading", level: 9, value: "x" }, { type: "nope" }] as never },
    });
    expect(result.issues.filter((i) => i.code === "INVALID_NODE")).toHaveLength(2);
  });

  it("warns when status and deprecated disagree", () => {
    const result = validateDocument(
      createMarkdownDocument("a", "T", "", { status: "deprecated" }),
    );
    expect(result.issues.map((i) => i.code)).toEqual(["DEPRECATION_MISMATCH"]);
  });
});

describe("DOCS-17 immutability", () => {
  it("does not freeze the caller's object and stores a deep-frozen copy", () => {
    const raw = { id: "z", title: "Z", content: { type: "markdown" as const, value: "v" }, tags: ["a"] };
    const registry = createDocumentRegistry();
    registry.register(raw);

    expect(Object.isFrozen(raw)).toBe(false);
    raw.tags.push("b");
    (raw.content as { value: string }).value = "hacked";

    const stored = registry.get("z")!;
    expect(stored.tags).toEqual(["a"]);
    expect(stored.content).toEqual({ type: "markdown", value: "v" });
    expect(Object.isFrozen(stored.content)).toBe(true);
    expect(Object.isFrozen(stored.tags)).toBe(true);
  });

  it("createDocument deep-freezes content, metadata and tags", () => {
    const doc = createMarkdownDocument("a", "A", "x", { metadata: { owner: "o" }, tags: ["t"] });
    expect(Object.isFrozen(doc.content)).toBe(true);
    expect(Object.isFrozen(doc.metadata)).toBe(true);
    expect(Object.isFrozen(doc.tags)).toBe(true);
  });
});

describe("DOCS-18 option precedence", () => {
  it("positional arguments win over options", () => {
    const doc = createMarkdownDocument("id", "T", "md", { description: "d" } as never);
    expect(doc.id).toBe("id");
    const overridden = createMarkdownDocument("id", "T", "md", { id: "other", content: undefined } as never);
    expect(overridden.id).toBe("id");
    expect(overridden.content).toEqual({ type: "markdown", value: "md" });
  });
});

describe("DOCS-20 markdown helpers", () => {
  it("ignores headings inside fences and strips closing hashes", () => {
    expect(extractTitleFromMarkdown("```\n# not a title\n```\n# Real #")).toBe("Real");
    expect(extractHeadings("```\n# no\n```\n## Yes ##")).toEqual([{ level: 2, text: "Yes" }]);
  });

  it("strips images, underscores, quotes, tables, strikethrough, html and fences", () => {
    const out = stripMarkdown(
      "![alt](img.png) _it_ __b__\n> q\n| a | b |\n| --- | --- |\n~~s~~ <b>x</b>\n```js\ncode\n```",
    );
    expect(out).toContain("alt it b\nq");
    expect(out).toContain("a b");
    expect(out).toContain("s x");
    expect(out).toContain("code");
    expect(out).not.toMatch(/[`|~<>_!]/);
    expect(stripMarkdown("**a*b**")).toBe("a*b");
  });
});

describe("DOCS-22 exported types", () => {
  it("APIExample is importable", () => {
    const example: APIExample = { id: "e", language: "ts", code: "x" };
    expect(example.id).toBe("e");
  });
});

describe("DOCS-25 validateExample messages", () => {
  it("does not interpolate an undefined id", () => {
    const result = validateExample({ language: "", code: "" } as never);
    expect(result.errors).toEqual([
      "Example ID is required.",
      "Example requires a language.",
      "Example requires code content.",
    ]);
  });
});
