import { describe, expect, it } from "vitest";

import type { HTTPRequest } from "../src/httpTypes/http.types.js";

import {
  buildQueryString,
  cloneQuery,
  getQuery,
  getQueryString,
  getQueryStrings,
  hasQuery,
  HTTPQueryLimitError,
  mergeQuery,
  parseQuery,
  parseQueryString,
  querySize,
  stringifyQuery,
} from "../src/httpQuery/index.js";

import { parseQueryString as parseRequestQueryString } from "../src/httpRequest/http.request.js";

import { parseQueryString as parseBarrelQueryString } from "../src/index.js";

const request = (url: string): HTTPRequest => ({ url }) as HTTPRequest;

const manyParams = (count: number): string =>
  Array.from({ length: count }, (_, index) => `k${index}=1`).join("&");

/* -------------------------------------------------------------------------- */
/* Q-01  request-side parser built into an object literal                      */
/* -------------------------------------------------------------------------- */

describe("Q-01 the request-side query parser is prototype-safe", () => {
  it("does not let ?__proto__ replace the result's prototype", () => {
    const query = parseRequestQueryString("/x?__proto__=a&__proto__=b");

    expect(Object.getPrototypeOf(query)).toBeNull();
    expect(Array.isArray(Object.getPrototypeOf(query))).toBe(false);
    expect((query as Record<string, unknown>)["length"]).toBeUndefined();
    expect((query as Record<string, unknown>)["map"]).toBeUndefined();
  });

  it("does not read an inherited member as an existing value", () => {
    const query = parseRequestQueryString("/x?constructor=pwned");

    expect(query["constructor"]).toBeUndefined();
  });

  it("keeps a parameter named toString as a plain own string", () => {
    expect(parseRequestQueryString("/x?toString=pwned")).toEqual({
      toString: "pwned",
    });
  });

  it("strips the fragment from a request-target", () => {
    expect(parseRequestQueryString("/x?a=1#b=2")).toEqual({ a: "1" });
  });
});

/* -------------------------------------------------------------------------- */
/* Q-02  limits on every entry point                                           */
/* -------------------------------------------------------------------------- */

describe("Q-02 every query entry point enforces the documented limits", () => {
  it("rejects too many parameters on the request-side parser", () => {
    expect(() => parseRequestQueryString(`/x?${manyParams(50_000)}`)).toThrow(
      HTTPQueryLimitError,
    );
  });

  it("rejects too many parameters through the package barrel", () => {
    expect(() => parseBarrelQueryString(`/x?${manyParams(50_000)}`)).toThrow(
      HTTPQueryLimitError,
    );
  });

  it("answers a limit breach with 414 rather than a 500-shaped fault", () => {
    try {
      parseRequestQueryString(`/x?${manyParams(50_000)}`);

      expect.unreachable("expected a limit error");
    } catch (error) {
      expect(error).toBeInstanceOf(HTTPQueryLimitError);
      expect((error as HTTPQueryLimitError).statusCode).toBe(414);
      expect((error as HTTPQueryLimitError).expose).toBe(true);
    }
  });

  it("counts comma-expanded values against maxKeys", () => {
    const commas = `a=${Array.from({ length: 500 }, (_, i) => i % 10).join(",")}`;

    expect(() =>
      parseQuery(commas, { commaSeparated: true, maxKeys: 2 }),
    ).toThrow(HTTPQueryLimitError);
  });

  it("enforces maxTotalLength for URLSearchParams input", () => {
    const params = new URLSearchParams(`a=${"x".repeat(5000)}`);

    expect(() => parseQuery(params, { maxTotalLength: 100 })).toThrow(
      HTTPQueryLimitError,
    );
  });

  it("applies commaSeparated to URLSearchParams input", () => {
    expect(
      parseQuery(new URLSearchParams("a=1,2,3"), { commaSeparated: true }),
    ).toEqual(parseQuery("a=1,2,3", { commaSeparated: true }));
  });
});

/* -------------------------------------------------------------------------- */
/* Q-03  accessors are total over every parseable shape                        */
/* -------------------------------------------------------------------------- */

describe("Q-03 query accessors never throw on a parseable request", () => {
  it("does not throw when a name is both a scalar and a bracket path", () => {
    const req = request("/x?a[b]=1&a=2");

    expect(getQueryStrings(req, "a")).toEqual(["[object Object]", "2"]);
  });

  it("returns a string, not null, for a literal ?a=null", () => {
    const value = getQueryString(request("/x?a=null"), "a");

    expect(typeof value).toBe("string");
    expect(value).toBe("null");
  });

  it("returns undefined for a bracket-path value with no single string form", () => {
    expect(getQueryString(request("/x?a[b]=1"), "a")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Q-04  hasQuery / querySize agree with getQuery                              */
/* -------------------------------------------------------------------------- */

describe("Q-04 presence checks answer about the parsed query", () => {
  const req = request("/x?a[b]=1&__proto__=z&c=1&c=2");

  it("reports the parsed name, not the raw bracket path", () => {
    expect(hasQuery(req, "a")).toBe(true);
    expect(hasQuery(req, "a[b]")).toBe(false);
  });

  it("does not report a name the parser drops", () => {
    expect(hasQuery(req, "__proto__")).toBe(false);
  });

  it("counts the same names getQuery exposes", () => {
    expect(querySize(req)).toBe(Object.keys(getQuery(req)).length);
    expect(querySize(req)).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Q-05  clone and merge preserve the parser's guarantees                      */
/* -------------------------------------------------------------------------- */

describe("Q-05 cloneQuery and mergeQuery keep null prototypes", () => {
  it("clones without reintroducing Object.prototype at any level", () => {
    const clone = cloneQuery(parseQuery("a=1&b[c]=2"));

    expect(Object.getPrototypeOf(clone)).toBeNull();
    expect(Object.getPrototypeOf(clone["b"] as object)).toBeNull();
    expect((clone as Record<string, unknown>)["toString"]).toBeUndefined();
  });

  it("clones deeply rather than aliasing the source", () => {
    const source = parseQuery("a[b]=1");
    const clone = cloneQuery(source) as { a: { b: unknown } };

    clone.a.b = "MUTATED";

    expect(source).toEqual({ a: { b: 1 } });
  });

  it("does not alias a source's nested object into the merged result", () => {
    const source = parseQuery("a[b]=1");
    const merged = mergeQuery(parseQuery(""), source) as { a: { b: unknown } };

    merged.a.b = "MUTATED";

    expect(source).toEqual({ a: { b: 1 } });
  });

  it("merges left to right onto a null-prototype object", () => {
    const merged = mergeQuery(parseQuery("a=1&b=2"), parseQuery("b=3"));

    expect(Object.getPrototypeOf(merged)).toBeNull();
    expect(merged).toEqual({ a: 1, b: 3 });
  });
});

/* -------------------------------------------------------------------------- */
/* Q-06  the serializer is bounded like the parser                             */
/* -------------------------------------------------------------------------- */

describe("Q-06 stringifyQuery is bounded", () => {
  it("rejects a circular object with a typed error, not a RangeError", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic["self"] = cyclic;

    expect(() => stringifyQuery(cyclic)).toThrow(HTTPQueryLimitError);
  });

  it("rejects a self-referential array with a typed error", () => {
    const arr: unknown[] = [1];
    arr.push(arr);

    expect(() => stringifyQuery({ a: arr })).toThrow(HTTPQueryLimitError);
  });

  it("rejects nesting deeper than maxDepth instead of overflowing the stack", () => {
    let root: Record<string, unknown> = {};
    const deep = root;

    for (let index = 0; index < 50_000; index += 1) {
      const next: Record<string, unknown> = {};
      root["n"] = next;
      root = next;
    }

    expect(() => stringifyQuery(deep)).toThrow(HTTPQueryLimitError);
  });

  it("serializes a DAG that repeats a value on sibling paths", () => {
    const shared = { x: 1 };

    expect(stringifyQuery({ a: shared, b: shared })).toBe("a%5Bx%5D=1&b%5Bx%5D=1");
  });

  it("still round-trips an ordinary nested object", () => {
    const parsed = parseQuery(buildQueryString({ a: { b: 1 }, c: [1, 2] }));

    expect(parsed).toEqual({ a: { b: 1 }, c: [1, 2] });
  });
});

/* -------------------------------------------------------------------------- */
/* Q-07  the three parsers still agree                                         */
/* -------------------------------------------------------------------------- */

describe("Q-07 the request-side and httpQuery parsers agree", () => {
  it("produces the same record for the same target", () => {
    const target = "/q?role=user&role=admin&__proto__=x&constructor=y&n=1";

    expect(parseRequestQueryString(target)).toEqual(
      parseQueryString("role=user&role=admin&__proto__=x&constructor=y&n=1"),
    );
  });

  it("keeps repeated names as arrays on both", () => {
    expect(parseRequestQueryString("/q?role=user&role=admin")).toEqual({
      role: ["user", "admin"],
    });
  });
});
