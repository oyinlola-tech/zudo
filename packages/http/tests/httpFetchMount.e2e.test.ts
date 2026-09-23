/**
 * `mountFetchHandler` against a real listening Node server: the web-standard
 * handler must see the request the client sent and the client must get the
 * response the handler built.
 */

import { describe, it, expect, afterEach } from "vitest";
import { request as httpRequest } from "node:http";

import {
  createNodeHttpAdapter,
  createRequestContext,
  createRouter,
  mountFetchHandler,
  toWebRequest,
  type HttpFetchHandler,
  type NodeHttpAdapter,
} from "../src/index.js";

const started: NodeHttpAdapter[] = [];

afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});

async function serve(
  configure: (router: ReturnType<typeof createRouter>) => void,
): Promise<string> {
  const router = createRouter();
  configure(router);
  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await adapter.start();
  started.push(adapter);
  return `http://127.0.0.1:${adapter.address!.port}`;
}

describe("mountFetchHandler", () => {
  it("round-trips method, URL, headers, body, status and every Set-Cookie", async () => {
    let seen: Request | undefined;
    let seenBody = "";
    const handler: HttpFetchHandler = async (request) => {
      seen = request;
      seenBody = await request.text();
      const headers = new Headers({ "content-type": "application/json", "x-reply": "yes" });
      headers.append("set-cookie", "a=1; Path=/");
      headers.append("set-cookie", "b=2; Path=/; HttpOnly");
      return new Response(JSON.stringify({ echoed: seenBody }), {
        status: 201,
        statusText: "Made It",
        headers,
      });
    };
    const origin = await serve((router) => mountFetchHandler(router, "/rpc", handler));

    const response = await fetch(`${origin}/rpc/users.create?x=1&x=2`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-custom": "abc" },
      body: JSON.stringify({ name: "Ada" }),
    });

    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Made It");
    expect(response.headers.get("x-reply")).toBe("yes");
    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/; HttpOnly"]);
    await expect(response.json()).resolves.toEqual({ echoed: '{"name":"Ada"}' });

    expect(seen?.method).toBe("POST");
    const url = new URL(seen!.url);
    expect(url.pathname).toBe("/users.create");
    expect(url.search).toBe("?x=1&x=2");
    expect(seen?.headers.get("x-custom")).toBe("abc");
    expect(seen?.headers.get("x-forwarded-prefix")).toBe("/rpc");
    expect(seen?.headers.get("connection")).toBeNull();
    expect(seenBody).toBe('{"name":"Ada"}');
  });

  it("keeps the full path with stripPrefix: false and serves the mount root", async () => {
    const paths: string[] = [];
    const origin = await serve((router) =>
      mountFetchHandler(
        router,
        "/api",
        (request) => {
          paths.push(new URL(request.url).pathname);
          return new Response(null, { status: 204 });
        },
        { stripPrefix: false },
      ),
    );
    expect((await fetch(`${origin}/api`)).status).toBe(204);
    expect((await fetch(`${origin}/api/a/b/`)).status).toBe(204);
    expect(paths).toEqual(["/api", "/api/a/b/"]);
  });

  it("streams the response body", async () => {
    const encoder = new TextEncoder();
    const origin = await serve((router) =>
      mountFetchHandler(router, "/stream", () => {
        let count = 0;
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            count += 1;
            if (count > 3) controller.close();
            else controller.enqueue(encoder.encode(`chunk${count};`));
          },
        });
        return new Response(body, { headers: { "content-type": "text/plain" } });
      }),
    );
    const response = await fetch(`${origin}/stream/`);
    expect(await response.text()).toBe("chunk1;chunk2;chunk3;");
  });

  it("answers 500 when the handler throws or returns a non-Response", async () => {
    const origin = await serve((router) => {
      mountFetchHandler(router, "/boom", () => {
        throw new Error("secret detail");
      });
      mountFetchHandler(router, "/bad", (() => "nope") as unknown as HttpFetchHandler);
    });
    const boom = await fetch(`${origin}/boom/x`);
    expect(boom.status).toBe(500);
    expect(await boom.text()).not.toContain("secret detail");
    expect((await fetch(`${origin}/bad`)).status).toBe(500);
  });

  it("restricts methods and removes the mount", async () => {
    let unmount: () => void = () => undefined;
    const origin = await serve((router) => {
      unmount = mountFetchHandler(router, "/only-get", () => new Response("ok"), {
        methods: ["GET"],
      });
    });
    expect((await fetch(`${origin}/only-get/x`)).status).toBe(200);
    expect((await fetch(`${origin}/only-get/x`, { method: "DELETE" })).status).toBe(405);
    unmount();
    expect((await fetch(`${origin}/only-get/x`)).status).toBe(404);
  });

  it("aborts the handler's signal when the client disconnects", async () => {
    let resolveAborted: (value: boolean) => void = () => undefined;
    const aborted = new Promise<boolean>((resolve) => {
      resolveAborted = resolve;
    });
    let entered: () => void = () => undefined;
    const handlerEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const origin = await serve((router) =>
      mountFetchHandler(router, "/slow", (request) => {
        entered();
        return new Promise<Response>((resolve) => {
          request.signal.addEventListener("abort", () => {
            resolveAborted(true);
            resolve(new Response("late"));
          });
        });
      }),
    );

    const client = httpRequest(`${origin}/slow/wait`);
    client.on("error", () => undefined);
    client.end();
    await handlerEntered;
    client.destroy();
    await expect(aborted).resolves.toBe(true);
  });
});

describe("toWebRequest", () => {
  it("re-encodes a parsed body as JSON and never attaches a body to GET", async () => {
    const post = toWebRequest(
      createRequestContext({ method: "POST", url: "/x", body: { a: 1 } }),
      { origin: "https://api.example.com" },
    );
    expect(post.url).toBe("https://api.example.com/x");
    expect(post.headers.get("content-type")).toBe("application/json");
    await expect(post.json()).resolves.toEqual({ a: 1 });

    const get = toWebRequest(createRequestContext({ method: "GET", url: "/y", body: "ignored" }));
    expect(get.body).toBeNull();
  });

  it("never reads an origin-form target as an authority", () => {
    const request = toWebRequest(createRequestContext({ method: "GET", url: "//evil.example/admin" }));
    expect(new URL(request.url).host).toBe("localhost");
    expect(new URL(request.url).pathname).toBe("/evil.example/admin");
  });
});
