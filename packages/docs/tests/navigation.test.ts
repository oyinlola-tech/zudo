import { describe, it, expect } from "vitest";
import {
  getBreadcrumbs,
  flattenNavigation,
  findNavigationItem,
  getSiblings,
} from "../src/navigation/index.js";
import type { DocumentationNavigationItem } from "../src/docsTypes/index.js";

const sampleNav: DocumentationNavigationItem[] = [
  {
    title: "Getting Started",
    children: [
      { title: "Installation", documentId: "install" },
      { title: "Quick Start", documentId: "quickstart" },
    ],
  },
  {
    title: "Guides",
    children: [
      {
        title: "HTTP",
        children: [
          { title: "Routing", documentId: "routing" },
          { title: "Middleware", documentId: "middleware" },
        ],
      },
    ],
  },
  { title: "API Reference", documentId: "api" },
];

describe("getBreadcrumbs", () => {
  it("generates breadcrumbs for a nested document", () => {
    const crumbs = getBreadcrumbs("routing", sampleNav);

    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]?.title).toBe("Guides");
    expect(crumbs[1]?.title).toBe("HTTP");
    expect(crumbs[2]?.title).toBe("Routing");
    expect(crumbs[2]?.documentId).toBe("routing");
  });

  it("generates breadcrumbs for a top-level document", () => {
    const crumbs = getBreadcrumbs("api", sampleNav);

    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]?.title).toBe("API Reference");
  });

  it("returns empty for unknown document", () => {
    const crumbs = getBreadcrumbs("nonexistent", sampleNav);
    expect(crumbs).toHaveLength(0);
  });
});

describe("flattenNavigation", () => {
  it("flattens all document IDs in order", () => {
    const ids = flattenNavigation(sampleNav);

    expect(ids).toEqual([
      "install",
      "quickstart",
      "routing",
      "middleware",
      "api",
    ]);
  });

  it("returns frozen array", () => {
    const ids = flattenNavigation(sampleNav);
    expect(Object.isFrozen(ids)).toBe(true);
  });
});

describe("findNavigationItem", () => {
  it("finds a nested item", () => {
    const item = findNavigationItem("middleware", sampleNav);

    expect(item).toBeDefined();
    expect(item!.title).toBe("Middleware");
  });

  it("finds a top-level item", () => {
    const item = findNavigationItem("api", sampleNav);

    expect(item).toBeDefined();
    expect(item!.title).toBe("API Reference");
  });

  it("returns undefined for unknown ID", () => {
    expect(findNavigationItem("nope", sampleNav)).toBeUndefined();
  });
});

describe("getSiblings", () => {
  it("returns siblings for a nested document, excluding itself", () => {
    const siblings = getSiblings("routing", sampleNav);

    expect(siblings).not.toContain("routing");
    expect(siblings).toContain("middleware");
    expect(siblings).toHaveLength(1);
  });

  it("returns no siblings for a lone top-level document", () => {
    const siblings = getSiblings("api", sampleNav);

    expect(siblings).not.toContain("api");
    expect(siblings).toHaveLength(0);
  });

  it("returns empty for unknown document", () => {
    const siblings = getSiblings("nope", sampleNav);
    expect(siblings).toHaveLength(0);
  });
});
