/**
 * Security review regressions for the bindings: non-exposed messages over
 * RPC, prototype-polluting input keys on every transport, and cross-site
 * form posts to body routes.
 */
import { describe, expect, it } from "vitest";

import { createJobId, createJobName, type Job, type JobContext } from "@zudojs/queue";

import { RPCServer } from "@zudojs/rpc";

import {
  API_INTERNAL_ERROR_MESSAGE,
  createApiFetchHandler,
  createApiQueueProcessor,
  createAPIError,
  defineOperation,
  ErrorCode,
  registerApiRpcProcedures,
  runApiCli,
} from "../src/index.js";

const SECRET = "db 10.0.0.5:5432 refused login for admin/hunter2";

describe("RPC binding keeps non-exposed messages server-side", () => {
  it.each([
    [ErrorCode.API_UNAVAILABLE, 503, "RPC_UNAVAILABLE"],
    [ErrorCode.API_AUTHENTICATION, 401, "RPC_UNAUTHENTICATED"],
    [ErrorCode.API_AUTHORIZATION, 403, "RPC_FORBIDDEN"],
    [ErrorCode.API_RATE_LIMIT, 429, "RPC_RATE_LIMITED"],
    [ErrorCode.API_VALIDATION, 422, "RPC_VALIDATION_ERROR"],
  ])("withholds the message of an expose:false %s error", async (code, statusCode, wire) => {
    const internal: unknown[] = [];
    const op = defineOperation({
      name: "db.ping",
      handler: async () => {
        throw createAPIError(SECRET, { code, statusCode });
      },
    });
    const server = new RPCServer();
    registerApiRpcProcedures(server, [op], { onInternalError: (error) => internal.push(error) });

    const response = await server.handle({ id: "r1", procedure: "db.ping", payload: {}, metadata: {} } as never);

    expect(response.error?.code).toBe(wire);
    expect(response.error?.message).toBe(API_INTERNAL_ERROR_MESSAGE);
    expect(JSON.stringify(response)).not.toContain("hunter2");
    expect(internal).toHaveLength(1);
  });

  it("still sends the message of an exposed error", async () => {
    const op = defineOperation({
      name: "db.ping",
      handler: async () => {
        throw createAPIError("Try again shortly.", { code: ErrorCode.API_UNAVAILABLE, statusCode: 503, expose: true });
      },
    });
    const server = new RPCServer();
    registerApiRpcProcedures(server, [op]);
    const response = await server.handle({ id: "r1", procedure: "db.ping", payload: {}, metadata: {} } as never);
    expect(response.error).toMatchObject({ code: "RPC_UNAVAILABLE", message: "Try again shortly." });
  });
});

describe("prototype-polluting input keys", () => {
  const calls: unknown[] = [];
  const save = defineOperation({
    name: "users.save",
    metadata: { http: { method: "PATCH", path: "/users/:id" } },
    handler: async (input: unknown) => {
      calls.push(input);
      const user: Record<string, unknown> = {};
      Object.assign(user, input);
      return { admin: user["admin"] ?? null };
    },
  });
  const create = defineOperation({ name: "users.create", handler: async (input: unknown) => (calls.push(input), input) });
  const fetchHandler = createApiFetchHandler([save, create]);

  const send = (path: string, method: string, body: string) =>
    fetchHandler(new Request(`http://api.test${path}`, { method, headers: { "content-type": "application/json" }, body }));

  it.each([
    ["/users/1", "PATCH", '{"__proto__":{"admin":true}}'],
    ["/users.create", "POST", '{"profile":{"constructor":{"prototype":{"admin":true}}}}'],
    ["/users.create", "POST", '[{"ok":1},{"__proto__":{}}]'],
  ])("refuses %s %s with body %s before the handler runs", async (path, method, body) => {
    calls.length = 0;
    const response = await send(path, method, body);
    const wire = (await response.json()) as { ok: boolean; error: { statusCode: number } };

    expect(response.status).toBe(400);
    expect(wire.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses the same input from a queue job and the CLI --json base", async () => {
    calls.length = 0;
    const processor = createApiQueueProcessor(create);
    const job = {
      id: createJobId("job-1"),
      name: createJobName("users.create"),
      data: JSON.parse('{"__proto__":{"admin":true}}') as unknown,
    } as unknown as Job<unknown>;
    await expect(processor(job, { signal: new AbortController().signal } as JobContext)).rejects.toMatchObject({
      statusCode: 422,
    });

    const stderr: string[] = [];
    const code = await runApiCli([create], ["users.create", "--json", '{"__proto__":{"admin":true}}'], {
      io: { stdout: () => undefined, stderr: (text) => stderr.push(text) },
    });
    expect(code).not.toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("body routes refuse cross-site form content types", () => {
  const calls: string[] = [];
  const remove = defineOperation({ name: "account.delete", handler: async () => (calls.push("deleted"), { deleted: true }) });
  const handler = createApiFetchHandler([remove]);

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"])(
    "answers 415 for an empty %s body",
    async (contentType) => {
      calls.length = 0;
      const response = await handler(
        new Request("http://api.test/account.delete", { method: "POST", headers: { "content-type": contentType }, body: "" }),
      );
      expect(response.status).toBe(415);
      expect(calls).toEqual([]);
    },
  );

  it("still accepts an empty body without a content type, or with JSON", async () => {
    const bare = await handler(new Request("http://api.test/account.delete", { method: "POST" }));
    const json = await handler(
      new Request("http://api.test/account.delete", { method: "POST", headers: { "content-type": "application/json" } }),
    );
    expect([bare.status, json.status]).toEqual([200, 200]);
  });
});
