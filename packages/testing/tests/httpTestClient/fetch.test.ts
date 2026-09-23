/**
 * createHttpTestClient with fetch handlers, expectations and integrations.
 */

import { AssertionError } from "node:assert";

import { describe, expect, it } from "vitest";

import {
  assertResponseBody,
  assertResponseHeader,
  assertOK,
} from "../../src/assertions/index.js";
import {
  createHttpTestClient,
  createHttpTestCookieJar,
  findPartialDifference,
} from "../../src/httpTestClient/index.js";
import { createTestHTTPRequest } from "../../src/httpTesting/index.js";

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/html") {
    return new Response("<p>hi</p>", {
      headers: { "content-type": "text/html" },
    });
  }
  if (url.pathname === "/empty") return new Response(null, { status: 204 });
  if (url.pathname === "/wait") {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return Response.json(
    {
      method: request.method,
      path: url.pathname,
      search: url.search,
      header: request.headers.get("x-test"),
      body: request.body ? await request.text() : null,
      nested: { a: 1, b: [1, 2], c: "extra" },
    },
    { headers: { "set-cookie": "sid=abc; Path=/" } },
  );
}

describe("createHttpTestClient — fetch handler (in-process)", () => {
  it("dispatches without a port and parses the response", async () => {
    const api = createHttpTestClient(handler);
    expect(await api.start()).toBe("http://localhost");

    const response = await api
      .post("/items")
      .set({ "x-test": "yes" })
      .send(new URLSearchParams({ q: "1" }))
      .expect(200)
      .expectJson({
        method: "POST",
        path: "/items",
        header: "yes",
        body: "q=1",
      });

    expect(response.type).toBe("application/json");
    expect(api.cookies.get("sid")).toBe("abc");
    await api.close();
  });

  it("supports objects with a fetch method, text and empty bodies", async () => {
    const api = createHttpTestClient({ fetch: handler });
    const html = await api.get("/html").expectText(/<p>hi<\/p>/);
    expect(html.body).toBe("<p>hi</p>");

    const empty = await api.head("/empty").expect(204);
    expect(empty.body).toBeUndefined();
    expect(empty.text).toBe("");
  });

  it("times out and aborts the handler's signal", async () => {
    await expect(
      createHttpTestClient(handler).get("/wait").timeout(20),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("reports a handler that throws or returns a non-Response", async () => {
    const throwing = createHttpTestClient(() => {
      throw new Error("kaput");
    });
    await expect(throwing.get("/")).rejects.toMatchObject({
      name: "NetworkError",
    });

    const wrong = createHttpTestClient(
      (() => "nope") as unknown as () => Response,
    );
    await expect(wrong.get("/")).rejects.toThrow(/not a Response/);
  });
});

describe("expectations", () => {
  it("fails with a readable AssertionError pointing at the expect call", async () => {
    const error = await createHttpTestClient(handler)
      .get("/x")
      .expect(201)
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(AssertionError);
    const failure = error as AssertionError;
    expect(failure.message).toContain("Expected status 201, got 200.");
    expect(failure.message).toContain("request:  GET /x");
    expect(failure.message).toContain('"method":"GET"');
    expect(failure.actual).toBe(200);
    expect(failure.expected).toBe(201);
    expect(failure.stack).toContain("fetch.test.ts");
  });

  it("reports header, JSON and text mismatches", async () => {
    const api = createHttpTestClient(handler);
    await expect(api.get("/").expect("x-missing", "1")).rejects.toThrow(
      'Expected header "x-missing" to be "1", it was absent.',
    );
    await expect(
      api.get("/").expectJson({ nested: { b: [1, 3] } }),
    ).rejects.toThrow("JSON body mismatch at body.nested.b[1]");
    await expect(api.get("/html").expectJson({})).rejects.toThrow(
      "Expected a JSON body (content-type: text/html)",
    );
    await expect(api.get("/html").expectText("other")).rejects.toThrow(
      'Expected body text to equal "other"',
    );
    await expect(api.get("/html").then((r) => r.json())).rejects.toThrow(
      /GET \/html answered 200 with a body that is not JSON/,
    );
  });

  it("runs custom checks and sends each request once", async () => {
    let calls = 0;
    const api = createHttpTestClient((request: Request) => {
      calls += 1;
      return handler(request);
    });
    const pending = api.get("/").expect((response) => {
      if (response.status !== 200) throw new Error("bad");
    });
    await pending;
    await pending;
    expect(calls).toBe(1);
    expect(() => pending.set("x", "y")).toThrow(/already been sent/);
  });

  it("refuses bodies on GET and absolute paths", async () => {
    const api = createHttpTestClient(handler);
    await expect(api.get("/").send({ a: 1 })).rejects.toThrow(
      /cannot carry a body/,
    );
    expect(() => api.get("http://evil.test/")).toThrow(/origin-relative/);
    expect(() => api.get("/").expect("x-only-name" as never)).toThrow(
      /needs the header value/,
    );
  });
});

describe("integration with builders and assertions", () => {
  it("sends a request built with createTestHTTPRequest, params substituted", async () => {
    const built = createTestHTTPRequest()
      .PUT("/users/:id/roles/:role")
      .withParam("id", "7")
      .withParam("role", "a b")
      .withQuery({ dry: "1" })
      .withHeader("x-test", "built")
      .withBody({ enabled: true })
      .build();

    const response = await createHttpTestClient(handler).request(built);
    assertOK(response);
    assertResponseHeader(response, "content-type", "application/json");
    expect(response.json()).toMatchObject({
      method: "PUT",
      path: "/users/7/roles/a%20b",
      search: "?dry=1",
      header: "built",
      body: '{"enabled":true}',
    });
    expect(() => assertResponseBody(response, { wrong: true })).toThrow(
      /mismatch/,
    );
  });

  it("exposes the cookie jar and partial matcher", () => {
    const jar = createHttpTestCookieJar();
    jar.store(["a=1; Path=/app", "b=2; Max-Age=-1", "c=3"], "/app/page");
    expect(jar.headerFor("/app/x")).toBe("a=1; c=3");
    expect(jar.headerFor("/application")).toBeUndefined();
    expect(jar.size).toBe(2);
    jar.set("d", "4");
    expect(jar.delete("a")).toBe(true);
    expect(jar.toJSON()).toEqual({ d: "4", c: "3" });

    expect(findPartialDifference({ a: 1, b: 2 }, { a: 1 })).toBeUndefined();
    expect(findPartialDifference({ a: 1 }, { a: 2 })?.path).toBe("body.a");
  });
});
