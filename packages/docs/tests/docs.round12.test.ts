import { describe, it, expect } from "vitest";

import {
  createDocument,
  createMarkdownDocument,
  createStructuredDocument,
} from "../src/document/index.js";
import { getAdjacent } from "../src/navigation/index.js";
import { validateAll, validateLinks } from "../src/validator/index.js";
import type { DocumentationNavigationItem } from "../src/docsTypes/index.js";

function codes(md: string, ids: Iterable<string> = []): string[] {
  const doc = createMarkdownDocument("a.b", "T", md);
  return validateLinks(doc, new Set(ids)).issues.map((i) => i.code);
}

function elapsed(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe("#94 validateLinks scans every link form", () => {
  it("catches javascript: targets that contain parentheses", () => {
    const doc = createMarkdownDocument("a.b", "T", "[x](javascript:alert(1))");
    const result = validateLinks(doc, new Set());
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(["UNSAFE_LINK"]);
  });

  it("catches unsafe targets with a title and with angle brackets", () => {
    expect(codes('[x](javascript:alert(1) "t")')).toEqual(["UNSAFE_LINK"]);
    expect(codes("[x](<javascript:alert(1)>)")).toEqual(["UNSAFE_LINK"]);
    expect(codes("[x](JAVASCRIPT:alert(1))")).toEqual(["UNSAFE_LINK"]);
    expect(codes('<a href="java\tscript:alert(1)">x</a>')).toEqual(["UNSAFE_LINK"]);
  });

  it("catches reference-style link definitions", () => {
    expect(codes("[x][ref]\n\n[ref]: javascript:alert(1)")).toEqual([
      "UNSAFE_LINK",
    ]);
    expect(codes('[ref]: <data:text/html,x> "title"')).toEqual(["UNSAFE_LINK"]);
    expect(codes("[ref]: ./missing")).toEqual(["BROKEN_LINK"]);
    expect(codes("[ref]: ./x", ["a.x"])).toEqual([]);
  });

  it("catches raw HTML href attributes and autolinks", () => {
    expect(codes('<a href="javascript:alert(1)">x</a>')).toEqual(["UNSAFE_LINK"]);
    expect(codes("<a href='vbscript:x'>x</a>")).toEqual(["UNSAFE_LINK"]);
    expect(codes("<a class=y href=javascript:alert(1)>x</a>")).toEqual([
      "UNSAFE_LINK",
    ]);
    expect(codes("<A HREF=\"data:text/html,x\">x</A>")).toEqual(["UNSAFE_LINK"]);
    expect(codes("<javascript:alert(1)>")).toEqual(["UNSAFE_LINK"]);
    expect(codes('<a href="https://ok">x</a> <https://ok> <a href="#top">t</a>')).toEqual(
      [],
    );
  });

  it("keeps balanced parentheses in safe targets", () => {
    expect(codes("[x](./a(1))", ["a.a(1)"])).toEqual([]);
    expect(codes("[x](https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual([]);
    expect(codes("[x](./nope(1))")).toEqual(["BROKEN_LINK"]);
  });

  it("still ignores links inside fenced and inline code", () => {
    expect(codes("`[x](javascript:alert(1))`")).toEqual([]);
    expect(codes("```\n[x](javascript:alert(1))\n<a href=javascript:x>\n```")).toEqual(
      [],
    );
    expect(codes("`[ref]: javascript:alert(1)`")).toEqual([]);
  });

  it("stays linear on hostile input", () => {
    for (const unit of ["[", "[](", "[a]( ", "`", "<", "<a href=", "[r]: ", "(", ")"]) {
      const doc = createMarkdownDocument(
        "a.b",
        "T",
        unit.repeat(Math.floor(99_000 / unit.length)),
      );
      expect(elapsed(() => validateLinks(doc, new Set()))).toBeLessThan(1_000);
    }
  });
});

describe("#95 broken links and orphans can be errors", () => {
  const docs = [
    createMarkdownDocument("a", "A", "[x](./nope)"),
    createMarkdownDocument("b", "B", "fine"),
  ];
  const nav: DocumentationNavigationItem[] = [{ title: "A", documentId: "a" }];

  it("defaults are unchanged: warnings, valid: true", () => {
    const result = validateAll(docs, nav);
    expect(result.valid).toBe(true);
    expect(result.issues.map((i) => [i.code, i.severity])).toEqual([
      ["BROKEN_LINK", "warning"],
      ["NAVIGATION_ORPHAN_DOCUMENT", "warning"],
    ]);
  });

  it("brokenLinkSeverity: 'error' makes validateAll and validateLinks fail", () => {
    const all = validateAll(docs, undefined, { brokenLinkSeverity: "error" });
    expect(all.valid).toBe(false);
    expect(all.issues[0]).toMatchObject({ code: "BROKEN_LINK", severity: "error" });

    const single = validateLinks(docs[0]!, new Set(), {
      brokenLinkSeverity: "error",
    });
    expect(single.valid).toBe(false);
  });

  it("orphanSeverity: 'error' makes an orphan document fail validation", () => {
    const result = validateAll(docs, nav, { orphanSeverity: "error" });
    expect(result.valid).toBe(false);
    expect(
      result.issues.find((i) => i.code === "NAVIGATION_ORPHAN_DOCUMENT")?.severity,
    ).toBe("error");
  });

  it("reportOrphans: false still suppresses orphans", () => {
    const result = validateAll(docs, nav, {
      reportOrphans: false,
      orphanSeverity: "error",
    });
    expect(result.issues.map((i) => i.code)).toEqual(["BROKEN_LINK"]);
  });
});

describe("#96 document builder and navigation ergonomics", () => {
  it("documents carry no explicit undefined keys", () => {
    const doc = createMarkdownDocument("a", "A", "x");
    expect(Object.keys(doc).sort()).toEqual(["content", "id", "title"]);
    expect("category" in doc).toBe(false);

    const structured = createStructuredDocument("s", "S", [], { tags: ["t"] });
    expect(Object.keys(structured).sort()).toEqual(["content", "id", "tags", "title"]);
  });

  it("strict: true rejects an unknown category or status at creation", () => {
    expect(() =>
      createDocument({
        id: "a",
        title: "A",
        content: { type: "markdown", value: "x" },
        category: "nope" as never,
        strict: true,
      }),
    ).toThrow(/category/i);

    expect(() =>
      createMarkdownDocument("a", "A", "x", { status: "wip" as never, strict: true }),
    ).toThrow(/status/i);

    const ok = createMarkdownDocument("a", "A", "x", {
      category: "guide",
      status: "stable",
      strict: true,
    });
    expect("strict" in ok).toBe(false);
    expect(ok.category).toBe("guide");
  });

  it("without strict, unknown enums are still accepted (unchanged)", () => {
    const doc = createMarkdownDocument("a", "A", "x", { category: "nope" as never });
    expect(doc.category).toBe("nope");
  });

  it("getAdjacent can walk the whole tree in reading order", () => {
    const nav: DocumentationNavigationItem[] = [
      { title: "Intro", documentId: "intro" },
      {
        title: "Guides",
        children: [
          { title: "One", documentId: "g.one" },
          { title: "Two", documentId: "g.two" },
        ],
      },
      { title: "Ref", documentId: "ref" },
    ];

    expect(getAdjacent("g.two", nav)).toEqual({ previous: "g.one" });
    expect(getAdjacent("g.two", nav, { scope: "tree" })).toEqual({
      previous: "g.one",
      next: "ref",
    });
    expect(getAdjacent("intro", nav, { scope: "tree" })).toEqual({ next: "g.one" });
    expect(getAdjacent("nope", nav, { scope: "tree" })).toEqual({});
  });
});
