import { describe, it, expect } from "vitest";
import {
  validateDocument,
  validateNoDuplicateIds,
  validateLinks,
  validateNavigation,
  validateAll,
} from "../src/validator/index.js";
import { createMarkdownDocument } from "../src/document/index.js";
import type { DocumentationNavigationItem } from "../src/docsTypes/index.js";

describe("validateDocument", () => {
  it("returns no issues for valid document", () => {
    const doc = createMarkdownDocument("test", "Test", "content");
    const result = validateDocument(doc);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("detects missing title", () => {
    const doc = {
      id: "test",
      title: "",
      content: { type: "markdown" as const, value: "content" },
    };
    const result = validateDocument(doc);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "MISSING_TITLE")).toBe(true);
  });

  it("warns on deprecated without message", () => {
    const doc = createMarkdownDocument("test", "Test", "content", {
      deprecated: true,
    });
    const result = validateDocument(doc);

    expect(result.valid).toBe(true);
    expect(
      result.issues.some((i) => i.code === "DEPRECATED_WITHOUT_MESSAGE"),
    ).toBe(true);
  });
});

describe("validateNoDuplicateIds", () => {
  it("passes with unique IDs", () => {
    const docs = [
      createMarkdownDocument("a", "A", ""),
      createMarkdownDocument("b", "B", ""),
    ];

    expect(validateNoDuplicateIds(docs).valid).toBe(true);
  });

  it("detects duplicates", () => {
    const docs = [
      createMarkdownDocument("dup", "A", ""),
      createMarkdownDocument("dup", "B", ""),
    ];

    const result = validateNoDuplicateIds(docs);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("DUPLICATE_ID");
  });
});

describe("validateLinks", () => {
  it("passes for valid internal links", () => {
    const doc = createMarkdownDocument("test", "Test", "[Link](other.doc)");
    const ids = new Set(["other.doc"]);

    expect(validateLinks(doc, ids).valid).toBe(true);
  });

  it("warns for broken internal links", () => {
    const doc = createMarkdownDocument("test", "Test", "[Link](nonexistent)");
    const ids = new Set(["other.doc"]);

    const result = validateLinks(doc, ids);
    expect(result.issues.some((i) => i.code === "BROKEN_LINK")).toBe(true);
  });

  it("ignores external links", () => {
    const doc = createMarkdownDocument(
      "test",
      "Test",
      "[Link](https://example.com)",
    );

    expect(validateLinks(doc, new Set()).valid).toBe(true);
  });

  it("skips non-markdown content", () => {
    const doc = {
      id: "test",
      title: "Test",
      content: { type: "html" as const, value: "<a href='bad'>link</a>" },
    };

    expect(validateLinks(doc, new Set()).valid).toBe(true);
  });
});

describe("validateNavigation", () => {
  it("passes for valid navigation", () => {
    const items: DocumentationNavigationItem[] = [
      { title: "Home", documentId: "home" },
    ];
    const ids = new Set(["home"]);

    expect(validateNavigation(items, ids).valid).toBe(true);
  });

  it("detects unknown document references", () => {
    const items: DocumentationNavigationItem[] = [
      { title: "Missing", documentId: "nonexistent" },
    ];

    const result = validateNavigation(items, new Set());
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("NAVIGATION_UNKNOWN_DOCUMENT");
  });

  it("checks nested children", () => {
    const items: DocumentationNavigationItem[] = [
      {
        title: "Section",
        children: [{ title: "Bad", documentId: "missing" }],
      },
    ];

    const result = validateNavigation(items, new Set());
    expect(result.valid).toBe(false);
  });
});

describe("validateAll", () => {
  it("validates a complete documentation set", () => {
    const docs = [
      createMarkdownDocument("a", "A", "[Link to B](b)"),
      createMarkdownDocument("b", "B", "Content"),
    ];
    const nav: DocumentationNavigationItem[] = [
      { title: "A", documentId: "a" },
      { title: "B", documentId: "b" },
    ];

    const result = validateAll(docs, nav);
    expect(result.valid).toBe(true);
  });

  it("collects all issues", () => {
    const docs = [
      { id: "a", title: "", content: { type: "markdown" as const, value: "" } },
      createMarkdownDocument("a", "Dup", ""),
    ];

    const result = validateAll(docs);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
