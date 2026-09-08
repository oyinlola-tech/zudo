import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
} from "../src/frontmatter/index.js";

describe("parseFrontmatter", () => {
  it("parses valid frontmatter", () => {
    const input = `---
title: HTTP Routing
category: guide
tags:
  - http
  - routing
version: 1.0
---
# Content starts here`;

    const result = parseFrontmatter(input);

    expect(result.metadata.title).toBe("HTTP Routing");
    expect(result.metadata.category).toBe("guide");
    expect(result.metadata.tags).toEqual(["http", "routing"]);
    expect(result.metadata.version).toBe("1.0");
    expect(result.content).toBe("# Content starts here");
  });

  it("returns empty metadata when no frontmatter", () => {
    const input = "# Just a heading\n\nSome content.";
    const result = parseFrontmatter(input);

    expect(result.metadata).toEqual({});
    expect(result.content).toBe(input);
  });

  it("returns empty metadata when delimiter is not closed", () => {
    const input = "---\ntitle: Bad\n# Content";
    const result = parseFrontmatter(input);

    expect(result.metadata).toEqual({});
    expect(result.content).toBe(input);
  });

  it("parses boolean values", () => {
    const input = `---\ndeprecated: true\nvisible: false\n---\nContent`;

    const result = parseFrontmatter(input);

    expect(result.metadata.deprecated).toBe(true);
    expect(result.metadata.visible).toBe(false);
  });

  it("parses numeric values but keeps version as a string", () => {
    const input = `---\nversion: 2\npriority: 10\n---\nContent`;

    const result = parseFrontmatter(input);

    expect(result.metadata.version).toBe("2");
    expect(result.metadata.priority).toBe(10);
  });

  it("handles empty frontmatter block", () => {
    const input = `---\n---\nContent`;
    const result = parseFrontmatter(input);

    expect(result.metadata).toEqual({});
    expect(result.content).toBe("Content");
  });
});

describe("serializeFrontmatter", () => {
  it("serializes metadata to frontmatter", () => {
    const metadata = {
      title: "Test",
      category: "guide",
      tags: ["http"],
    };
    const content = "# Hello";

    const result = serializeFrontmatter(metadata, content);

    expect(result).toContain("---");
    expect(result).toContain("title: Test");
    expect(result).toContain("category: guide");
    expect(result).toContain("- http");
    expect(result).toContain("# Hello");
  });

  it("skips undefined and null values", () => {
    const metadata = {
      title: "Test",
      description: undefined,
      version: null as unknown as string,
    };

    const result = serializeFrontmatter(metadata, "content");

    expect(result).toContain("title: Test");
    expect(result).not.toContain("description:");
    expect(result).not.toContain("version:");
  });

  it("serializes boolean values", () => {
    const metadata = { deprecated: true, visible: false };
    const result = serializeFrontmatter(metadata, "content");

    expect(result).toContain("deprecated: true");
    expect(result).toContain("visible: false");
  });
});
