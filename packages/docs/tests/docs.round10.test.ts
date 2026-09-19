/**
 * @zudojs/docs — Audit round 10 regression tests.
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source.
 */

import { describe, it, expect } from "vitest";

import {
  createMarkdownDocument,
  stripMarkdown,
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
    expect(elapsed(() => stripMarkdown("\n".repeat(10_000)))).toBeLessThan(
      1_000,
    );
    expect(elapsed(() => stripMarkdown(" ".repeat(50_000)))).toBeLessThan(
      1_000,
    );
    expect(elapsed(() => stripMarkdown("\n ".repeat(20_000)))).toBeLessThan(
      1_000,
    );
    expect(elapsed(() => stripMarkdown("`".repeat(50_000)))).toBeLessThan(
      1_000,
    );
    expect(elapsed(() => stripMarkdown("[a".repeat(25_000)))).toBeLessThan(
      1_000,
    );
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
      const doc = createMarkdownDocument(
        "a.b",
        "T",
        unit.repeat(Math.floor(99_000 / unit.length)),
      );
      // Previously ~30 s for 99,000 `[`.
      expect(elapsed(() => validateLinks(doc, ids))).toBeLessThan(1_000);
    }
  });

  it("still finds links with titles and angle targets", () => {
    const doc = createMarkdownDocument(
      "a.b",
      "T",
      '[x](missing "t") [y](<gone>)',
    );
    expect(validateLinks(doc, new Set()).issues.map((i) => i.code)).toEqual([
      "BROKEN_LINK",
      "BROKEN_LINK",
    ]);
  });
});
