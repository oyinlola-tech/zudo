/**
 * @zudojs/testing — expectations run against a test client response.
 *
 * Failures are `AssertionError`s (from `node:assert`) carrying `actual` and
 * `expected`, so test runners show a diff, and their message always names
 * the request and previews the response body.
 */

import { AssertionError } from "node:assert";

import { previewBody } from "./httpTestResponse.core.js";
import { findPartialDifference } from "./httpTestResponse.match.js";
import type { HttpTestResponse } from "./httpTestResponse.type.js";

/** A check run once the response arrives. Throw to fail. */
export type HttpTestExpectation = (
  response: HttpTestResponse,
) => void | Promise<void>;

function fail(
  response: HttpTestResponse,
  message: string,
  actual: unknown,
  expected: unknown,
): never {
  const { method, path } = response.request;
  throw new AssertionError({
    message: `${message}\n  request:  ${method} ${path}\n  response: ${response.status} ${response.statusText}\n  body:     ${previewBody(response.text)}`,
    actual,
    expected,
    operator: "strictEqual",
  });
}

/** Expects an exact status code. */
export function expectStatus(expected: number): HttpTestExpectation {
  return (response) => {
    if (response.status !== expected) {
      fail(
        response,
        `Expected status ${expected}, got ${response.status}.`,
        response.status,
        expected,
      );
    }
  };
}

function matches(actual: string, expected: string | RegExp): boolean {
  if (typeof expected === "string") return actual === expected;
  return new RegExp(expected.source, expected.flags.replace(/[gy]/g, "")).test(
    actual,
  );
}

function describeExpected(expected: string | RegExp, verb: string): string {
  return typeof expected === "string"
    ? `${verb} ${JSON.stringify(expected)}`
    : `match ${String(expected)}`;
}

/** Expects a header to equal a string or match a pattern. */
export function expectHeader(
  name: string,
  expected: string | RegExp,
): HttpTestExpectation {
  return (response) => {
    const actual = response.header(name);
    if (actual === undefined || !matches(actual, expected)) {
      const shown =
        actual === undefined
          ? "it was absent"
          : `got ${JSON.stringify(actual)}`;
      fail(
        response,
        `Expected header "${name}" to ${describeExpected(expected, "be")}, ${shown}.`,
        actual,
        expected,
      );
    }
  };
}

/** Expects a JSON body containing `expected` (extra object keys are allowed). */
export function expectJson(expected: unknown): HttpTestExpectation {
  return (response) => {
    let body: unknown;
    try {
      body = response.json();
    } catch {
      fail(
        response,
        `Expected a JSON body (content-type: ${response.type ?? "none"}).`,
        response.text,
        expected,
      );
    }
    const difference = findPartialDifference(body, expected);
    if (difference) {
      fail(
        response,
        `JSON body mismatch at ${difference.path}: ${difference.reason}.`,
        body,
        expected,
      );
    }
  };
}

/** Expects the text body to equal a string or match a pattern. */
export function expectText(expected: string | RegExp): HttpTestExpectation {
  return (response) => {
    if (!matches(response.text, expected)) {
      fail(
        response,
        `Expected body text to ${describeExpected(expected, "equal")}.`,
        response.text,
        expected,
      );
    }
  };
}
