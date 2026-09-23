import { describe, expect, it } from "vitest";

import { formatCount } from "../src/index.js";

describe("formatCount", () => {
  it("uses the singular for exactly one", () => {
    expect(formatCount(1, "character")).toBe("1 character");
    expect(formatCount(-1, "item")).toBe("-1 item");
  });

  it("uses the plural for zero, many and fractions", () => {
    expect(formatCount(0, "item")).toBe("0 items");
    expect(formatCount(3, "character")).toBe("3 characters");
    expect(formatCount(1.5, "item")).toBe("1.5 items");
  });

  it("accepts an irregular plural", () => {
    expect(formatCount(2, "entry", "entries")).toBe("2 entries");
    expect(formatCount(1, "entry", "entries")).toBe("1 entry");
  });
});
