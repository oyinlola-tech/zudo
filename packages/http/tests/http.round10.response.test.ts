/**
 * Audit round 10 regression tests: error mapping, handler results, the
 * request guard and cookie defaults (HTTP-02, HTTP-03, HTTP-05, HTTP-10).
 */

import { describe, it, expect } from "vitest";

import * as http from "../src/index.js";

import { sendRaw, withAdapter, jsonBody } from "./round10.harness.js";

describe("HTTP-02", () => {
  it("answers with the outermost status error, not a wrapped cause", async () => {
    const inner = http.unauthorized("billing rejected token sk_live_abc", {
      headers: { "www-authenticate": 'Bearer realm="internal"' },
    });

    await withAdapter(
      {
        handler: async () => {
          throw new http.HttpError(502, "Bad Gateway", { cause: inner });
        },
      },
      async (port) => {
        const response = await sendRaw(port, "/");

        expect(response.status).toBe(502);
        expect(response.head).not.toMatch(/www-authenticate/i);
        expect(response.body).not.toContain("sk_live_abc");
      },
    );
  });

  it("still looks through the pipeline's own wrappers", async () => {
    const pipeline = new http.HttpMiddlewarePipeline();

    pipeline.use(async () => {
      throw http.notFound("nope");
    });

    await withAdapter(
      { handler: (request) => pipeline.execute(request, http.createResponseContext()) },
      async (port) => {
        expect((await sendRaw(port, "/")).status).toBe(404);
      },
    );
  });

  it("does not unwrap a status-less application error", async () => {
    await withAdapter(
      {
        handler: async () => {
          throw new Error("db failed", { cause: http.unauthorized("x") });
        },
      },
      async (port) => {
        expect((await sendRaw(port, "/")).status).toBe(500);
      },
    );
  });
});

describe("HTTP-03", () => {
  it("sends plain objects as JSON whatever their keys", async () => {
    const bodies: Record<string, unknown> = {
      "/health": { status: "ok" },
      "/user": { name: "ada", metadata: { a: 1 } },
      "/post": { title: "x", body: "hello world" },
      "/hdr": { headers: ["a", "b"], rows: [] },
      "/num": { status: 404, body: "row" },
    };

    await withAdapter({ handler: (request) => bodies[request.path] }, async (port) => {
      for (const [path, body] of Object.entries(bodies)) {
        const response = await sendRaw(port, path);

        expect(response.status, path).toBe(200);
        expect(response.head).toMatch(/content-type: application\/json/i);
        expect(jsonBody(response), path).toEqual(body);
      }
    });
  });
});

describe("HTTP-05", () => {
  const hostile = { host: "x", "x-request-id": "<script>alert(1)</script>" };

  it("runs the request guard by default", async () => {
    let reached = false;

    await withAdapter({ handler: () => { reached = true; } }, async (port) => {
      expect((await sendRaw(port, "/", hostile)).status).toBe(400);
      expect((await sendRaw(port, "/", { host: "x", "x-request-id": "ok-1" })).status).toBe(200);
    });

    expect(reached).toBe(true);
  });

  it("can be tuned or disabled", async () => {
    await withAdapter(
      { handler: () => "ok", security: { allowedHosts: ["good.example"] } },
      async (port) => {
        expect((await sendRaw(port, "/", { host: "evil.example" })).status).toBe(400);
        expect((await sendRaw(port, "/", { host: "good.example" })).status).toBe(200);
      },
    );

    await withAdapter({ handler: () => "ok", security: false }, async (port) => {
      expect((await sendRaw(port, "/", hostile)).status).toBe(200);
    });
  });

  it("accepts HTTP/1.0 without Host and keeps 413 for large bodies", async () => {
    await withAdapter({ handler: () => "ok", maxBodySize: 4 }, async (port) => {
      expect((await sendRaw(port, "/", {}, "GET", "1.0")).status).toBe(200);

      const big = await sendRaw(port, "/", { host: "x", "content-length": "10" }, "POST");

      expect(big.status).toBe(413);
    });
  });
});

describe("HTTP-10", () => {
  const secure = "Path=/; HttpOnly; Secure; SameSite=Lax";

  it("serializes cookies with secure defaults", () => {
    expect(http.serializeCookie("session", "abc")).toBe(`session=abc; ${secure}`);
    expect(
      http.serializeCookie("pref", "1", { httpOnly: false, secure: false, sameSite: "strict" }),
    ).toBe("pref=1; Path=/; SameSite=Strict");
  });

  it("puts the defaults on the wire for response.cookie()", async () => {
    await withAdapter(
      { handler: () => http.createResponseContext().cookie("session", "abc123").text("ok") },
      async (port) => {
        const response = await sendRaw(port, "/");

        expect(response.head).toContain(`set-cookie: session=abc123; ${secure}`);
      },
    );
  });
});
