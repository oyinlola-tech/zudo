/**
 * createApiFetchHandler: routing, input extraction, response shape and
 * error hygiene.
 */
import { describe, expect, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  APIAuthenticationError,
  createApiFetchHandler,
  defineOperation,
  TransportContextKey,
  UserIdContextKey,
} from "../src/index.js";

const getUser = defineOperation({
  name: "users.get",
  input: schema.object({ id: schema.string(), expand: schema.coerce.boolean().optional() }),
  metadata: { http: { method: "GET", path: "/users/:id" } },
  handler: async (input: { id: string; expand?: boolean }) => input,
});

const me = defineOperation({
  name: "users.me",
  metadata: { http: { method: "GET", path: "/users/me" } },
  handler: async (_input: unknown, context) => ({
    me: true,
    transport: context.get(TransportContextKey),
    state: context.state,
  }),
});

const rename = defineOperation({
  name: "users.rename",
  metadata: { http: { method: "PATCH", path: "/users/:id" } },
  handler: async (input: unknown) => input,
});

const crash = defineOperation({
  name: "ops.crash",
  handler: async () => {
    throw new Error("postgres://admin:hunter2@db");
  },
});

const bigint = defineOperation({ name: "ops.bigint", handler: async () => 1n });

const handler = createApiFetchHandler([getUser, me, rename, crash, bigint], {
  basePath: "/api",
  maxBodyBytes: 256,
});

const call = (path: string, init?: RequestInit) => handler(new Request(`http://t${path}`, init));

const json = (method: string, body: string, type = "application/json"): RequestInit => ({
  method,
  headers: { "content-type": type },
  body,
});

describe("createApiFetchHandler routing and input", () => {
  it("merges path parameters over query input", async () => {
    const response = await call("/api/users/u%201?expand=true&id=spoof");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { id: "u 1", expand: true } });
  });

  it("prefers a literal segment over a parameter", async () => {
    const body = (await (await call("/api/users/me")).json()) as { data: { me: boolean; transport: string } };
    expect(body.data).toMatchObject({ me: true, transport: "http" });
  });

  it("merges path parameters over a JSON body", async () => {
    const response = await call("/api/users/u1", json("PATCH", '{"id":"x","name":"Ann"}'));
    expect(await response.json()).toEqual({ ok: true, data: { id: "u1", name: "Ann" } });
  });

  it("answers 404, 405 and 400 for routing failures", async () => {
    expect((await call("/api/nothing")).status).toBe(404);
    const wrong = await call("/api/users/u1", { method: "DELETE" });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET, PATCH");
    expect((await call("/api/users/%E0%A4%A")).status).toBe(400);
  });

  it("refuses bad bodies with 415, 413 and 400", async () => {
    expect((await call("/api/users/u1", json("PATCH", "{}", "text/plain"))).status).toBe(415);
    expect((await call("/api/users/u1", json("PATCH", `{"p":"${"x".repeat(400)}"}`))).status).toBe(413);
    expect((await call("/api/users/u1", json("PATCH", "{oops"))).status).toBe(400);
    expect((await call("/api/users/u1", json("PATCH", "[1,2]"))).status).toBe(400);
    expect((await call("/api/users/u1?__proto__=1", { method: "GET" })).status).toBe(400);
  });
});

describe("createApiFetchHandler responses", () => {
  it("never leaks internal messages, and reports them to onInternalError", async () => {
    const seen: string[] = [];
    const guarded = createApiFetchHandler([crash, bigint], {
      onInternalError: (error, requestId) => seen.push(`${requestId}:${String((error.cause as Error)?.message)}`),
    });
    const response = await guarded(
      new Request("http://t/ops.crash", { method: "POST", headers: { "x-request-id": "req-7" } }),
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe("req-7");
    expect(text).not.toContain("hunter2");
    expect(JSON.parse(text)).toEqual({
      ok: false,
      error: { code: "ERR_API_INTERNAL", message: "An internal error occurred.", statusCode: 500, requestId: "req-7" },
    });
    expect(seen).toEqual(["req-7:postgres://admin:hunter2@db"]);

    const unserializable = await guarded(new Request("http://t/ops.bigint", { method: "POST" }));
    expect(unserializable.status).toBe(500);
  });

  it("replaces an unsafe request id and sets security headers", async () => {
    const response = await call("/api/users/me", { headers: { "x-request-id": "bad id<script>" } });
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("builds state from the request and refuses through an APIError", async () => {
    const authed = createApiFetchHandler([me], {
      state: (request) => {
        const user = request.headers.get("x-user");
        if (user === null) throw new APIAuthenticationError("Sign in.");
        return { user };
      },
    });
    const denied = await authed(new Request("http://t/users/me"));
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({ error: { message: "Sign in." } });

    const ok = await authed(new Request("http://t/users/me", { headers: { "x-user": "ann" } }));
    expect(await ok.json()).toMatchObject({ data: { state: { user: "ann" } } });
  });

  it("does not trust a context key the client could set", async () => {
    const op = defineOperation({
      name: "who.ami",
      handler: async (_i: unknown, context) => context.get(UserIdContextKey) ?? null,
    });
    const response = await createApiFetchHandler([op])(
      new Request("http://t/who.ami", { method: "POST", headers: { "x-user-id": "admin" } }),
    );
    expect(await response.json()).toEqual({ ok: true, data: null });
  });
});
