/**
 * @zudojs/docs — Round 9 regression tests.
 */

import { describe, it, expect } from "vitest";

import {
  createDocument,
  createDocumentRegistry,
  createMarkdownDocument,
  deepFreezeClone,
  generateIndex,
  nodesToMarkdown,
  validateAll,
  validateNavigation,
} from "../src/index.js";
import type { DocumentationNavigationItem } from "../src/index.js";

/* ─── DOCS-R9-01: callout label resolved through Object.prototype ───────── */

describe("DOCS-R9-01", () => {
  it("does not print a prototype member as the callout label", () => {
    for (const kind of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const md = nodesToMarkdown([
        { type: "callout", kind: kind as never, value: "body" },
      ]);

      // Previously: "> **function Object() { [native code] }:** body".
      expect(md).toContain(`> **${kind.toUpperCase()}:** body`);
      expect(md).not.toContain("native code");
    }
  });

  it("still labels the known kinds", () => {
    expect(
      nodesToMarkdown([{ type: "callout", kind: "warning", value: "w" }]),
    ).toContain("> **WARNING:** w");
  });
});

/* ─── DOCS-R9-02: deepFreezeClone fallback froze the caller's objects ───── */

describe("DOCS-R9-02", () => {
  it("leaves the caller's nested objects unfrozen when structuredClone fails", () => {
    const nested = { a: 1, list: [{ b: 2 }] };
    const when = new Date(0);
    const source = { nested, when, fn: () => 1 };

    const copy = deepFreezeClone(source);

    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(copy.nested)).toBe(true);
    expect(Object.isFrozen(copy.nested.list[0])).toBe(true);
    expect(copy.nested).not.toBe(nested);
    expect(copy.when).not.toBe(when);
    expect(copy.when.getTime()).toBe(0);
    expect(copy.fn).toBe(source.fn);

    // The caller can still mutate its own objects.
    expect(Object.isFrozen(nested)).toBe(false);
    expect(Object.isFrozen(nested.list[0])).toBe(false);
    expect(Object.isFrozen(when)).toBe(false);
    nested.a = 2;
    expect(copy.nested.a).toBe(1);
  });

  it("tolerates cycles in the fallback path", () => {
    const source: Record<string, unknown> = { fn: () => 1 };
    source["self"] = source;

    const copy = deepFreezeClone(source);

    expect(copy["self"]).toBe(copy);
    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
  });

  it("createDocument does not freeze caller metadata that cannot be structured-cloned", () => {
    const metadata = { owner: "docs", extra: { fn: () => 1, inner: { x: 1 } } };
    createDocument({
      id: "a",
      title: "A",
      content: { type: "markdown", value: "x" },
      metadata: metadata as never,
    });

    expect(Object.isFrozen(metadata.extra.inner)).toBe(false);
  });
});

/* ─── DOCS-R9-03: a shared navigation node hid a duplicate reference ────── */

describe("DOCS-R9-03", () => {
  it("reports a document mounted twice through the same node object", () => {
    const shared: DocumentationNavigationItem = { title: "A", documentId: "a" };
    const items = [shared, { title: "Section", children: [shared] }];

    const result = validateNavigation(items, new Set(["a"]));

    expect(result.issues.map((i) => i.code)).toEqual([
      "NAVIGATION_DUPLICATE_DOCUMENT",
    ]);
    expect(result.valid).toBe(true);
  });

  it("reports an unknown document once even when its node is shared", () => {
    const shared: DocumentationNavigationItem = { title: "G", documentId: "ghost" };
    const result = validateNavigation([shared, shared], new Set());

    expect(
      result.issues.filter((i) => i.code === "NAVIGATION_UNKNOWN_DOCUMENT"),
    ).toHaveLength(1);
    expect(
      result.issues.filter((i) => i.code === "NAVIGATION_DUPLICATE_DOCUMENT"),
    ).toHaveLength(1);
  });

  it("still tolerates a cyclic tree", () => {
    const node: { title: string; children: DocumentationNavigationItem[] } = {
      title: "Loop",
      children: [],
    };
    node.children.push(node);

    const result = validateNavigation([node], new Set());
    expect(result.issues.map((i) => i.code)).toContain("NAVIGATION_CYCLE");
  });
});

/* ─── README example ────────────────────────────────────────────────────── */

describe("README quick start", () => {
  it("runs as documented", () => {
    const registry = createDocumentRegistry();

    registry.register(
      createMarkdownDocument(
        "getting-started",
        "Getting Started",
        "# Getting Started\n\nWelcome to Zudojs...",
        { category: "introduction", tags: ["intro"] },
      ),
    );

    registry.register({
      id: "guides.http.routing",
      title: "HTTP Routing",
      content: { type: "markdown", value: "# Routing\n\n..." },
    });

    const result = validateAll(registry.getAll());
    expect(result.valid).toBe(true);

    const index = generateIndex(registry.getAll());
    expect(index.map((entry) => entry["id"])).toEqual([
      "getting-started",
      "guides.http.routing",
    ]);
  });
});
