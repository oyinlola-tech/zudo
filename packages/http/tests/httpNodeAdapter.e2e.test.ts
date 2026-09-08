/**
 * End-to-end tests for the Node HTTP adapter against a real listening server.
 *
 * These cover HTTPB-01 (writeNodeResponse recursing into itself) and HTTPB-02
 * (flushHeaders before writeHead), both of which break every request and are
 * invisible to a unit test of the writer in isolation.
 */

import { describe, it, expect, afterEach } from "vitest";

import { createNodeHttpAdapter } from "../src/httpAdapter/node/httpNode.adapter.js";
import type { NodeHttpAdapter } from "../src/httpAdapter/node/httpNode.adapter.js";
import type { NodeAdapterOptions } from "../src/httpAdapter/node/httpNode.type.js";
import { createResponseContext } from "../src/httpResponse/httpResponse.context.js";
import { HttpRequestContext } from "../src/httpRequest/httpRequest.context.js";

const started: NodeHttpAdapter[] = [];

async function startAdapter(
  options: NodeAdapterOptions,
): Promise<{ adapter: NodeHttpAdapter; origin: string }> {
  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    /* Port 0 asks the OS for an ephemeral port. */
    port: 0,
    ...options,
  });

  await adapter.start();

  started.push(adapter);

  const address = adapter.address;

  if (!address) {
    throw new Error("adapter did not report a listening address");
  }

  return { adapter, origin: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  while (started.length > 0) {
    const adapter = started.pop();

    if (adapter) {
      await adapter.stop();
    }
  }
});

describe("NodeHttpAdapter end-to-end", () => {
  it("delivers the handler's status code to the client (HTTPB-01, HTTPB-02)", async () => {
    const { origin } = await startAdapter({
      handler: () =>
        createResponseContext().setStatus(401).json({ error: "nope" }),
    });

    const response = await fetch(`${origin}/guarded`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "nope" });
  });

  it.each([200, 201, 204, 400, 403, 404, 418, 500])(
    "round-trips status %i",
    async (status) => {
      const { origin } = await startAdapter({
        handler: () => {
          const context = createResponseContext().setStatus(status);

          return status === 204 ? context : context.text("body");
        },
      });

      const response = await fetch(`${origin}/`);

      expect(response.status).toBe(status);
    },
  );

  it("survives many sequential requests without the process dying", async () => {
    const { origin } = await startAdapter({
      handler: () => createResponseContext().setStatus(202).text("ok"),
    });

    for (let index = 0; index < 25; index += 1) {
      const response = await fetch(`${origin}/${index}`);

      expect(response.status).toBe(202);
      expect(await response.text()).toBe("ok");
    }
  });

  it("emits the automatic Content-Type inferred after the header snapshot (HTTPB-19)", async () => {
    const { origin } = await startAdapter({
      handler: () => createResponseContext().setStatus(200).json({ a: 1 }),
    });

    const response = await fetch(`${origin}/`);

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-length")).toBe("7");
  });

  it("does not send Content-Length on a 204 (HTTPB-19)", async () => {
    const { origin } = await startAdapter({
      handler: () => createResponseContext().setStatus(204),
    });

    const response = await fetch(`${origin}/`);

    expect(response.status).toBe(204);
    expect(response.headers.get("content-length")).toBeNull();
  });

  it("answers a throwing handler with 500 rather than crashing", async () => {
    const { origin } = await startAdapter({
      handler: () => {
        throw new Error("boom");
      },
    });

    const response = await fetch(`${origin}/`);

    expect(response.status).toBe(500);

    const body = (await response.json()) as { error?: string };

    /* The client must not receive the handler's stack trace or message. */
    expect(body.error).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("boom");
  });

  it("reads a request body and enforces maxBodySize (HTTPB-26)", async () => {
    let seen: unknown;

    const { origin } = await startAdapter({
      maxBodySize: 32,
      handler: (request: HttpRequestContext) => {
        seen = request.body;

        return createResponseContext().setStatus(200).text("ok");
      },
    });

    const ok = await fetch(`${origin}/`, { method: "POST", body: "hello" });

    expect(ok.status).toBe(200);
    expect(new TextDecoder().decode(seen as Uint8Array)).toBe("hello");

    const tooBig = await fetch(`${origin}/`, {
      method: "POST",
      body: "x".repeat(500),
    });

    expect(tooBig.status).toBe(413);
  });

  it("applies a slowloris-resistant headers timeout by default", async () => {
    const { adapter } = await startAdapter({ handler: () => undefined });

    const server = adapter.httpServer;

    expect(server?.headersTimeout).toBe(10_000);
    expect(server?.requestTimeout).toBe(30_000);
    expect(server?.keepAliveTimeout).toBe(5_000);
  });

  it("closes a connection that dribbles a partial request (slowloris)", async () => {
    const { origin } = await startAdapter({
      headersTimeout: 250,
      requestTimeout: 500,
      handler: () => createResponseContext().setStatus(200).text("ok"),
    });

    const { connect } = await import("node:net");

    const url = new URL(origin);

    const closed = await new Promise<boolean>((resolve) => {
      const socket = connect(Number(url.port), url.hostname, () => {
        /* A request line and one header, then nothing. */
        socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n");
      });

      /* Consume the server's reply so the socket can reach "close". */
      socket.resume();

      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 3_000);

      socket.on("close", () => {
        clearTimeout(timer);
        resolve(true);
      });

      socket.on("error", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    expect(closed).toBe(true);
  });

  it("honours maxConnections", async () => {
    const { adapter } = await startAdapter({
      maxConnections: 4,
      handler: () => undefined,
    });

    expect(adapter.httpServer?.maxConnections).toBe(4);
  });

  it("stops cleanly even while an idle keep-alive socket is held open", async () => {
    const { adapter, origin } = await startAdapter({
      keepAliveTimeout: 60_000,
      handler: () => createResponseContext().setStatus(200).text("ok"),
    });

    const agentModule = await import("node:http");

    const agent = new agentModule.Agent({ keepAlive: true, maxSockets: 1 });

    await new Promise<void>((resolve, reject) => {
      const request = agentModule.request(
        `${origin}/`,
        { agent },
        (response) => {
          response.resume();
          response.on("end", () => resolve());
        },
      );

      request.on("error", reject);
      request.end();
    });

    /* The socket is now idle-but-open; close must not hang on it. */
    const start = Date.now();

    await adapter.stop();

    expect(Date.now() - start).toBeLessThan(3_000);

    agent.destroy();
  });

  it("rejects a response header carrying a CRLF injection payload", async () => {
    const { origin } = await startAdapter({
      handler: () => {
        const context = createResponseContext().setStatus(200);

        context.setHeader("x-injected", "ok\r\nx-evil: 1");

        return context.text("body");
      },
    });

    const response = await fetch(`${origin}/`);

    expect(response.status).toBe(500);
    expect(response.headers.get("x-evil")).toBeNull();
  });
});
