import { describe, it, expect } from "vitest";
import {
  createDocument,
  createMarkdownDocument,
} from "../src/document/index.js";

describe("createDocument", () => {
  it("creates a document with valid options", () => {
    const doc = createDocument({
      id: "test.doc",
      title: "Test Document",
      content: { type: "markdown", value: "# Hello" },
    });

    expect(doc.id).toBe("test.doc");
    expect(doc.title).toBe("Test Document");
    expect(doc.content.type).toBe("markdown");
  });

  it("freezes the document", () => {
    const doc = createDocument({
      id: "test.doc",
      title: "Test",
      content: { type: "markdown", value: "" },
    });

    expect(Object.isFrozen(doc)).toBe(true);
  });

  it("freezes tags array", () => {
    const doc = createDocument({
      id: "test.doc",
      title: "Test",
      content: { type: "markdown", value: "" },
      tags: ["http", "routing"],
    });

    expect(Object.isFrozen(doc.tags)).toBe(true);
  });

  it("throws on missing ID", () => {
    expect(() =>
      createDocument({
        id: "",
        title: "Test",
        content: { type: "markdown", value: "" },
      }),
    ).toThrow("Document ID is required.");
  });

  it("throws on missing title", () => {
    expect(() =>
      createDocument({
        id: "test",
        title: "",
        content: { type: "markdown", value: "" },
      }),
    ).toThrow("Document title is required.");
  });

  it("throws on missing content", () => {
    expect(() =>
      createDocument({
        id: "test",
        title: "Test",
        content: undefined as never,
      }),
    ).toThrow("Document content is required.");
  });

  it("includes optional fields when provided", () => {
    const doc = createDocument({
      id: "test",
      title: "Test",
      content: { type: "markdown", value: "" },
      category: "guide",
      version: "1.0",
      status: "stable",
      deprecated: true,
      deprecatedMessage: "Use new-doc instead.",
      visibility: "CLIENT",
    });

    expect(doc.category).toBe("guide");
    expect(doc.version).toBe("1.0");
    expect(doc.status).toBe("stable");
    expect(doc.deprecated).toBe(true);
    expect(doc.deprecatedMessage).toBe("Use new-doc instead.");
    expect(doc.visibility).toBe("CLIENT");
  });
});

describe("createMarkdownDocument", () => {
  it("creates a markdown document", () => {
    const doc = createMarkdownDocument(
      "guides.http.routing",
      "HTTP Routing",
      "# Routing\n\nLearn about routing.",
    );

    expect(doc.id).toBe("guides.http.routing");
    expect(doc.title).toBe("HTTP Routing");
    expect(doc.content.type).toBe("markdown");
    expect(doc.content).toMatchObject({ value: expect.stringContaining("# Routing") });
  });

  it("accepts optional overrides", () => {
    const doc = createMarkdownDocument("test", "Test", "content", {
      category: "tutorial",
      tags: ["test"],
    });

    expect(doc.category).toBe("tutorial");
    expect(doc.tags).toEqual(["test"]);
  });
});
