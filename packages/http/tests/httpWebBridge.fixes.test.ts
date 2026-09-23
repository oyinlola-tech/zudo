import { describe, it, expect } from "vitest";

import {
  createRequestContext,
  createRouter,
  writeReadableStream,
  type HttpResponseWriter,
} from "../src/index.js";

describe("web bridge fixes", () => {
  it("keeps every Set-Cookie of a Response returned by a route handler", async () => {
    const router = createRouter();
    router.get("/login", () => {
      const headers = new Headers();
      headers.append("set-cookie", "a=1");
      headers.append("set-cookie", "b=2");
      return new Response("ok", { headers });
    });
    const { response } = await router.dispatch(
      createRequestContext({ method: "GET", url: "/login" }),
    );
    expect(response.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
  });

  it("hands the request context's signal to route handlers", async () => {
    const controller = new AbortController();
    const router = createRouter();
    let seen: AbortSignal | undefined;
    router.get("/x", (context) => {
      seen = context.signal;
    });
    const request = createRequestContext({ method: "GET", url: "/x", signal: controller.signal });
    expect(request.clone().signal).toBe(controller.signal);
    await router.dispatch(request);
    expect(seen).toBe(controller.signal);
  });

  it("stops pulling and cancels a stream once the sink is no longer writable", async () => {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array([pulls]));
      },
      cancel() {
        cancelled = true;
      },
    });
    let writable = true;
    const writer = {
      headersSent: true,
      writableEnded: false,
      get writable() {
        return writable;
      },
      writeHead: () => undefined,
      setHeader: () => undefined,
      appendHeader: () => undefined,
      removeHeader: () => undefined,
      write: () => {
        if (pulls >= 3) writable = false;
        return true;
      },
      end: () => undefined,
    } satisfies HttpResponseWriter;

    await writeReadableStream(stream, writer);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
  });
});
