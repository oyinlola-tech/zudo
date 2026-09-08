import { describe, it, expect } from "vitest";
import {
  generateMarkdown,
  generateJSON,
  generateIndex,
} from "../src/generator/index.js";
import { createMarkdownDocument } from "../src/document/index.js";

describe("generateMarkdown", () => {
  it("generates markdown with frontmatter", () => {
    const doc = createMarkdownDocument(
      "test",
      "Test Doc",
      "# Hello\n\nContent here.",
      { category: "guide", tags: ["test"] },
    );

    const md = generateMarkdown(doc);

    expect(md).toContain("---");
    expect(md).toContain("title: Test Doc");
    expect(md).toContain("category: guide");
    expect(md).toContain("- test");
    expect(md).toContain("# Hello");
  });

  it("generates markdown without frontmatter", () => {
    const doc = createMarkdownDocument("test", "Test", "# Content");

    const md = generateMarkdown(doc, { includeFrontmatter: false });
    expect(md).not.toContain("---");
    expect(md).toContain("# Content");
  });

  it("includes deprecation warning", () => {
    const doc = createMarkdownDocument("test", "Test", "content", {
      deprecated: true,
      deprecatedMessage: "Use new-doc.",
    });

    const md = generateMarkdown(doc);
    expect(md).toContain("DEPRECATED");
    expect(md).toContain("Use new-doc.");
  });

  it("includes metadata section", () => {
    const doc = createMarkdownDocument("test", "Test", "content", {
      metadata: {
        owner: "team-a",
        updatedAt: new Date("2026-01-01"),
      },
    });

    const md = generateMarkdown(doc, { includeMeta: true });
    expect(md).toContain("**Owner:** team-a");
    expect(md).toContain("**Updated:**");
  });
});

describe("generateJSON", () => {
  it("serializes document to JSON", () => {
    const doc = createMarkdownDocument("test", "Test", "content", {
      category: "guide",
    });

    const json = generateJSON(doc);

    expect(json.id).toBe("test");
    expect(json.title).toBe("Test");
    expect(json.category).toBe("guide");
  });
});

describe("generateIndex", () => {
  it("generates index for multiple documents", () => {
    const docs = [
      createMarkdownDocument("a", "A", ""),
      createMarkdownDocument("b", "B", ""),
    ];

    const index = generateIndex(docs);

    expect(index).toHaveLength(2);
    expect(index[0]?.id).toBe("a");
    expect(index[1]?.id).toBe("b");
  });
});
