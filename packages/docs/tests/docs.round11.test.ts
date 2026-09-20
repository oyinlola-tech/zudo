/**
 * Round 11 regression tests for @zudojs/docs.
 */

import { describe, it, expect } from "vitest";

import {
  createMarkdownDocument,
  generateMarkdown,
  type DocumentationDocument,
} from "../src/index.js";

const PAYLOAD = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

describe("TOOL-01 — generateMarkdown escapes every text position it writes", () => {
  it("escapes the deprecation blockquote", () => {
    const base = createMarkdownDocument("d", "D", "Body");
    const doc: DocumentationDocument = {
      ...base,
      deprecated: true,
      deprecatedMessage: PAYLOAD,
    };

    const body = generateMarkdown(doc, { includeFrontmatter: false });

    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<img");
    expect(body).toContain("&lt;script&gt;");
    expect(body).toContain("> &lt;img src=x");
  });

  it("escapes a multi-line deprecation message line by line", () => {
    const base = createMarkdownDocument("d", "D", "Body");
    const doc: DocumentationDocument = {
      ...base,
      deprecated: true,
      deprecatedMessage: "first <b>\nsecond <i>",
    };

    const body = generateMarkdown(doc, { includeFrontmatter: false });

    expect(body).toContain("> first &lt;b&gt;");
    expect(body).toContain("> second &lt;i&gt;");
    expect(body).not.toContain("<b>");
  });

  it("escapes the metadata owner line", () => {
    const base = createMarkdownDocument("d", "D", "Body");
    const doc: DocumentationDocument = {
      ...base,
      metadata: { owner: PAYLOAD },
    };

    const body = generateMarkdown(doc, {
      includeFrontmatter: false,
      includeMeta: true,
    });

    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<img");
    expect(body).toContain("**Owner:** &lt;img src=x");
  });

  it("still collapses newlines in the owner line", () => {
    const base = createMarkdownDocument("d", "D", "Body");
    const doc: DocumentationDocument = {
      ...base,
      metadata: { owner: "platform\nteam" },
    };

    const body = generateMarkdown(doc, {
      includeFrontmatter: false,
      includeMeta: true,
    });

    expect(body).toContain("**Owner:** platform team");
  });

  it("writes no other unescaped angle bracket for a fully hostile document", () => {
    const base = createMarkdownDocument("d", "D", "clean body");
    const doc: DocumentationDocument = {
      ...base,
      title: PAYLOAD,
      description: PAYLOAD,
      deprecated: true,
      deprecatedMessage: PAYLOAD,
      metadata: { owner: PAYLOAD, updatedAt: new Date(0) },
    };

    const rendered = generateMarkdown(doc, {
      includeFrontmatter: false,
      includeMeta: true,
    });

    expect(rendered).not.toMatch(/<(script|img|iframe|svg)/i);
    expect(rendered).toContain("**Updated:** 1970-01-01T00:00:00.000Z");
  });
});
