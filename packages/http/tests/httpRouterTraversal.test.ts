/**
 * Adversarial tests for router and static-file path handling.
 *
 * Covers HTTPB-32 (parameters decoded after matching), HTTPB-33 (wildcard
 * capture) and HTTPB-20 (static-file root containment).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpRouter } from "../src/httpRouter/core/register/httpRouter.register.js";
import { createRouteMatcher } from "../src/httpRouter/matching/httpRoute.matcher.js";
import {
  compileRoutePattern,
  matchRoutePattern,
} from "../src/httpRouter/pattern/core/index.js";
import { createStaticMiddleware } from "../src/httpMiddleware/builtin/static/httpMiddleware.static.js";
import type {
  HttpMiddlewareContext,
  HttpMiddlewareResult,
} from "../src/httpMiddleware/httpMiddleware.type.js";
import type { HttpResponseContext } from "../src/httpResponse/httpResponse.context.js";

describe("router path traversal", () => {
  function matcherFor(path: string) {
    const router = new HttpRouter();

    router.on("GET", path, () => undefined);

    return createRouteMatcher(router);
  }

  it("does not hand a handler '../' decoded out of a route parameter", () => {
    const matcher = matcherFor("/files/:name");

    const result = matcher.match({
      method: "GET",
      path: "/files/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    });

    expect(result).toBeUndefined();
  });

  it.each([
    "/files/%2e%2e",
    "/files/..",
    "/files/%2e%2e%2fsecret",
    "/files/a%2fb",
    "/files/a%5cb",
    "/files/%00",
  ])("refuses to match the traversal payload %s", (path) => {
    const matcher = matcherFor("/files/:name");

    expect(matcher.match({ method: "GET", path })).toBeUndefined();
  });

  it("still matches an ordinary encoded parameter", () => {
    const matcher = matcherFor("/files/:name");

    const result = matcher.match({
      method: "GET",
      path: "/files/hello%20world.txt",
    });

    expect(result?.params.name).toBe("hello world.txt");
  });

  it("fails the match on malformed percent-encoding instead of throwing", () => {
    const matcher = matcherFor("/files/:name");

    expect(() =>
      matcher.match({ method: "GET", path: "/files/%zz" }),
    ).not.toThrow();

    expect(
      matcher.match({ method: "GET", path: "/files/%zz" }),
    ).toBeUndefined();
  });

  it("rejects an encoded separator smuggled through a wildcard tail", () => {
    const matcher = matcherFor("/assets/*rest");

    expect(
      matcher.match({ method: "GET", path: "/assets/a/%2e%2e/b" }),
    ).toBeUndefined();
  });

  it("captures a plain wildcard tail", () => {
    const matcher = matcherFor("/assets/*rest");

    const result = matcher.match({
      method: "GET",
      path: "/assets/css/app.css",
    });

    expect(result?.params.rest).toBe("css/app.css");
  });
});

describe("compiled route patterns", () => {
  it("captures a wildcard segment (HTTPB-33)", () => {
    const pattern = compileRoutePattern("/files/*");

    const match = matchRoutePattern(pattern, "/files/a/b.txt");

    expect(match?.params.wildcard0).toBe("a/b.txt");
  });

  it("rejects a traversal payload in a parameter (HTTPB-32)", () => {
    const pattern = compileRoutePattern("/files/:name");

    expect(
      matchRoutePattern(pattern, "/files/%2e%2e%2f%2e%2e%2fetc"),
    ).toBeUndefined();
  });

  it("does not throw on malformed percent-encoding", () => {
    const pattern = compileRoutePattern("/files/:name");

    expect(() => matchRoutePattern(pattern, "/files/%zz")).not.toThrow();
  });

  it("honours strict trailing-slash handling", () => {
    const lenient = compileRoutePattern("/users");
    const strict = compileRoutePattern("/users", { strict: true });

    expect(lenient.regex.test("/users/")).toBe(true);
    expect(strict.regex.test("/users/")).toBe(false);
    expect(strict.regex.test("/users")).toBe(true);
  });
});

describe("static file middleware containment", () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    outside = await mkdtemp(join(tmpdir(), "zudo-static-"));
    root = join(outside, "public");

    await mkdir(root, { recursive: true });
    await writeFile(join(root, "index.html"), "<h1>ok</h1>");
    await writeFile(join(outside, "secret.txt"), "TOP SECRET");
  });

  afterAll(async () => {
    await rm(outside, { recursive: true, force: true });
  });

  function contextFor(url: string): HttpMiddlewareContext {
    return {
      request: { url, method: "GET", headers: {} },
      response: { headers: {} },
      state: new Map(),
      signal: new AbortController().signal,
      metadata: {},
    } as unknown as HttpMiddlewareContext;
  }

  const NEXT = Symbol("next");

  async function run(
    url: string,
    options: Parameters<typeof createStaticMiddleware>[0],
  ): Promise<HttpMiddlewareResult | typeof NEXT> {
    const middleware = createStaticMiddleware(options);

    return middleware(contextFor(url), async () => {
      return NEXT as unknown as HttpResponseContext;
    });
  }

  it("serves a file inside the root", async () => {
    const result = await run("http://localhost/index.html", { root });

    expect(result).not.toBe(NEXT);
  });

  it.each([true, false])(
    "refuses %s-hidden traversal out of the root (HTTPB-20)",
    async (hidden) => {
      const result = await run("http://localhost/%2e%2e/secret.txt", {
        root,
        hidden,
      });

      expect(result).toBe(NEXT);
    },
  );

  it("refuses a decoded ../ traversal even with hidden: true", async () => {
    const result = await run("http://localhost/../secret.txt", {
      root,
      hidden: true,
    });

    expect(result).toBe(NEXT);
  });

  it("refuses a deep encoded traversal to an absolute path", async () => {
    const result = await run(
      "http://localhost/%2e%2e/%2e%2e/%2e%2e/etc/passwd",
      { root, hidden: true },
    );

    expect(result).toBe(NEXT);
  });

  it("does not serve a non-GET method", async () => {
    const middleware = createStaticMiddleware({ root });

    const context = contextFor("http://localhost/index.html");

    (context.request as unknown as { method: string }).method = "DELETE";

    const result = await middleware(context, async () => {
      return NEXT as unknown as HttpResponseContext;
    });

    expect(result).toBe(NEXT);
  });
});
