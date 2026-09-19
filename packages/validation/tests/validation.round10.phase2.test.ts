/**
 * Round 10 phase 2 regressions for @zudojs/validation (cross-package handoffs).
 */

import { describe, expect, it } from "vitest";
import {
  BaseError,
  TraversalLimitError as SharedTraversalLimitError,
} from "@zudojs/errors";

// Test-only sibling imports: validation has no runtime dependency on
// @zudojs/constants or @zudojs/types, but the three email checks must agree.
import { ValidationPattern } from "../../constants/src/index.js";
import { isEmail } from "../../types/src/index.js";

import { assertDepthWithinLimit, email } from "../src/index.js";
import {
  TraversalLimitError,
  traverse,
} from "../src/validationConstraints/structure/validationConstraints.traverse.js";

const CORPUS: readonly string[] = [
  "user@example.com",
  "o'brien@example.com",
  "first.last+tag@sub.example.co.uk",
  "user@host.123",
  "a@b.c",
  "UPPER@EXAMPLE.COM",
  "user@xn--bcher-kva.example",
  `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
  `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`,
  `${"a".repeat(300)}@example.com`,
  `user@${"a".repeat(5000)}!`,
  "user..dots@example.com",
  "user@example..com",
  "user@example",
  "user@-example.com",
  "user@example-.com",
  "user name@example.com",
  "user@exa mple.com",
  "user@@example.com",
  "@example.com",
  "user@",
  "<user>@example.com",
  'us"er@example.com',
  "user,x@example.com",
  "user@[127.0.0.1]",
  "",
];

describe("LEAF-04/CONV-02 (email agreement)", () => {
  it("the constraint, ValidationPattern.EMAIL and isEmail agree on the corpus", () => {
    const disagreements = CORPUS.filter((address) => {
      const byConstraint = email.validate(address);
      const byPattern = ValidationPattern.EMAIL.test(address);
      const byGuard = isEmail(address);
      return byConstraint !== byPattern || byConstraint !== byGuard;
    });
    expect(disagreements).toEqual([]);
  });

  it("enforces the 254-character bound", () => {
    const at254 = CORPUS[7] ?? "";
    const at255 = CORPUS[8] ?? "";
    expect(at254).toHaveLength(254);
    expect(email.validate(at254)).toBe(true);
    expect(email.validate(at255)).toBe(false);
  });
});

describe("VAL-05/CV-02 (TraversalLimitError from @zudojs/errors)", () => {
  it("is the shared BaseError class, with halt/path/observed", () => {
    expect(TraversalLimitError).toBe(SharedTraversalLimitError);
    let caught: unknown;
    try {
      traverse({ a: { b: { c: 1 } } }, { maxDepth: 1 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BaseError);
    expect(caught).toMatchObject({ halt: "depth", name: "TraversalLimitError" });
  });

  it("the public guards still translate the halt", () => {
    expect(() => assertDepthWithinLimit({ a: { b: { c: 1 } } }, 1)).toThrow();
  });
});
