/**
 * Security review regressions: the origin a mounted fetch handler sees,
 * the body it receives, and routes hidden from the OpenAPI document inside
 * a documented group.
 */

import { describe, it, expect, afterEach } from "vitest";
import { request as httpRequest } from "node:http";

import {
  collectOpenAPIRoutes,
  createNodeHttpAdapter,
  createRequestContext,
  createResponseContext,
  createRouter,
  mountFetchHandler,
  toWebRequest,
  type NodeHttpAdapter,
} from "../src/index.js";

const started: NodeHttpAdapter[] = [];

afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});

async function serve(configure: (router: ReturnType<typeof createRouter>) => void): Promise<number> {
  const router = createRouter();
  configure(router);
  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await adapter.start();
  started.push(adapter);
  return adapter.address!.port;
}

function get(port: number, path: string, host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path, method: "GET", headers: { host }, agent: false },
      (response) => {
        let body = "";
        response.on("data", (chunk: Buffer) => (body += chunk.toString()));
        response.on("end", () => resolve(body));
      },
    );
    request.on("error", reject);
    request.end();
  });
}

describe("mountFetchHandler origin", () => {
  it("pins the handler's origin to options.origin whatever the Host header says", async () => {
    const port = await serve((router) =>
      mountFetchHandler(router, "/app", (request) => new Response(request.url), {
        origin: "https://api.example.com",
      }),
    );

    await expect(get(port, "/app/reset?x=1", "evil.example:81")).resolves.toBe(
      "https://api.example.com/reset?x=1",
    );
  });

  it("pins the origin in toWebRequest too", () => {
    const context = createRequestContext({
      method: "GET",
      url: "/a",
      protocol: "http",
      hostname: "evil.example",
    });
    expect(new URL(toWebRequest(context, { origin: "https://api.example.com" }).url).origin).toBe(
      "https://api.example.com",
    );
    expect(new URL(toWebRequest(context).url).origin).toBe("http://evil.example");
  });
});

describe("toWebRequest body re-encoding", () => {
  it("labels a parsed body it re-encodes as JSON with a JSON content type", async () => {
    const context = createRequestContext({
      method: "POST",
      url: "/form",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: { name: "Ada" },
    });
    const request = toWebRequest(context);
    expect(request.headers.get("content-type")).toBe("application/json");
    await expect(request.json()).resolves.toEqual({ name: "Ada" });
  });

  it("keeps a JSON-family content type it already had", () => {
    const context = createRequestContext({
      method: "PATCH",
      url: "/doc",
      headers: { "content-type": "application/merge-patch+json" },
      body: { name: "Ada" },
    });
    expect(toWebRequest(context).headers.get("content-type")).toBe("application/merge-patch+json");
  });
});

describe("OpenAPI visibility inside a documented group", () => {
  const ok = () => createResponseContext().json({ ok: true });

  it("keeps a route hidden through metadata.openapi when the group documents its routes", () => {
    const router = createRouter();
    router.group(
      "/admin",
      (group) => {
        group.get("/secret", ok, { metadata: { openapi: false } });
        group.get("/hidden", ok, { metadata: { openapi: { hidden: true } } });
        group.get("/public", ok, { metadata: { openapi: { summary: "Public" } } });
      },
      { openapi: { tags: ["admin"] } },
    );

    const documented = collectOpenAPIRoutes(router);
    expect(documented.map((route) => route.path)).toEqual(["/admin/public"]);
    expect(documented[0]).toMatchObject({ summary: "Public", tags: ["admin"] });
  });

  it("hides every undocumented route of a group whose metadata.openapi is false", () => {
    const router = createRouter();
    router.group(
      "/internal",
      (group) => {
        group.get("/stats", ok);
        group.get("/documented", ok, { openapi: { summary: "Shown" } });
      },
      { metadata: { openapi: false } },
    );

    expect(collectOpenAPIRoutes(router).map((route) => route.path)).toEqual(["/internal/documented"]);
  });
});
