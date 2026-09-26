/**
 * createHttpTestClient against a real @zudojs/http application.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  HttpMiddlewarePipeline,
  NodeHttpAdapter,
  createHttpServer,
  createResponseContext,
} from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";

import { createCleanupManager } from "../../src/cleanupManager/index.js";
import { createHttpTestClient } from "../../src/httpTestClient/index.js";
import type { HttpTestClient } from "../../src/httpTestClient/index.js";
import { SECRET, createZudoApp } from "./zudoApp.fixture.js";

const clients: HttpTestClient[] = [];

function client(
  ...args: Parameters<typeof createHttpTestClient>
): HttpTestClient {
  const created = createHttpTestClient(...args);
  clients.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

describe("createHttpTestClient — @zudojs/http router", () => {
  it("routes params and query and returns parsed JSON", async () => {
    const response = await client(createZudoApp())
      .get("/users/7")
      .query({ page: 2, tags: ["a", "b"], skip: undefined })
      .expect(200)
      .expect("content-type", /application\/json/)
      .expectJson({ id: "7", query: { page: "2", tags: ["a", "b"] } });

    expect(response.body).toEqual({
      id: "7",
      query: { page: "2", tags: ["a", "b"] },
    });
    expect(response.json<{ readonly id: string }>().id).toBe("7");
    expect(response.ok).toBe(true);
  });

  it("sends a JSON body with a JSON content type", async () => {
    const response = await client(createZudoApp())
      .post("/users")
      .send({ name: "Ada" })
      .expect(201)
      .expect("location", "/users/42");

    expect(response.body).toEqual({
      id: "42",
      name: "Ada",
      type: "application/json",
    });
  });

  it("sends default, explicit and auth headers", async () => {
    const api = client(createZudoApp(), { headers: { "x-default": "yes" } });

    await api
      .get("/headers")
      .set("x-custom", "1")
      .auth("token-123")
      .expectJson({
        authorization: "Bearer token-123",
        custom: "1",
        defaulted: "yes",
      });

    const basic = await api.get("/headers").auth("ada", "pw");
    expect(basic.json<{ readonly authorization: string }>().authorization).toBe(
      `Basic ${Buffer.from("ada:pw").toString("base64")}`,
    );
  });

  it("keeps cookies across requests and drops them on Max-Age=0", async () => {
    const api = client(createZudoApp());

    await api.get("/me").expectJson({ cookie: null });
    const login = await api.post("/login").expect(200);
    expect(login.cookies).toEqual({ session: "s3cr3t" });
    expect(api.cookies.get("session")).toBe("s3cr3t");

    await api.get("/me").expectJson({ cookie: "session=s3cr3t" });
    await api.post("/logout").expect(200);
    expect(api.cookies.get("session")).toBeUndefined();
    await api.get("/me").expectJson({ cookie: null });
  });

  it("answers 404 for unknown routes and thrown notFound()", async () => {
    const api = client(createZudoApp());
    await api.get("/nope").expect(404);
    await api
      .get("/missing")
      .expect(404)
      .expectJson({ error: "No such thing" });
  });

  it("maps a thrown error to 500 without leaking the message or stack", async () => {
    const response = await client(createZudoApp()).get("/boom").expect(500);
    expect(response.body).toEqual({
      error: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(response.text).not.toContain(SECRET);
    expect(response.text).not.toMatch(/at .*\.ts:\d+/);
  });

  it("times out a slow route with a TimeoutError", async () => {
    await expect(
      client(createZudoApp()).get("/slow").timeout(50),
    ).rejects.toMatchObject({ name: "TimeoutError", timeoutMs: 50 });
  });
});

describe("createHttpTestClient — other @zudojs/http targets", () => {
  it("serves an HttpServer that is not running without starting it", async () => {
    const app = createZudoApp();
    const server = createHttpServer({
      adapter: new NodeHttpAdapter({ port: 3999 }),
      handler: async (request: HttpRequestContext) =>
        (await app.dispatch(request)).response,
    });
    const api = client(server);

    await api.get("/users/1").expect(200);
    expect(server.state).toBe("created");
    expect(server.requests).toBe(1);
    await api.close();
    expect(server.state).toBe("created");
  });

  it("uses a running HttpServer where it listens and leaves it running", async () => {
    const server = createHttpServer({
      adapter: new NodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
      handler: () => createResponseContext().text("running"),
    });
    await server.start();
    try {
      const api = client(server);
      expect(await api.start()).toBe(
        `http://127.0.0.1:${server.address?.port}`,
      );
      await api.get("/").expect(200).expectText("running");
      await api.close();
      expect(server.isRunning).toBe(true);
    } finally {
      await server.stop();
    }
  });

  it("serves a NodeHttpAdapter, a pipeline and a handler with kind: zudo", async () => {
    const adapter = new NodeHttpAdapter({
      handler: () => createResponseContext().text("adapter"),
    });
    await client(adapter).get("/").expectText("adapter");

    const pipeline = new HttpMiddlewarePipeline();
    pipeline.use(async () =>
      createResponseContext().setStatus(202).text("pipeline"),
    );
    await client(pipeline).get("/").expect(202).expectText("pipeline");

    await client(() => ({ handled: true }), { kind: "zudo" })
      .get("/")
      .expectJson({ handled: true });
  });

  it("registers close() with a cleanup manager", async () => {
    const cleanup = createCleanupManager();
    const api = createHttpTestClient(createZudoApp(), { cleanup });
    await api.get("/users/1").expect(200);

    expect(cleanup.count).toBe(1);
    await cleanup.dispose();
    expect(api.closed).toBe(true);
    await expect(api.get("/users/1")).rejects.toThrow(/closed/);
  });
});
