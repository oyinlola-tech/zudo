/**
 * Guard responses from `@zudojs/middleware` reach the client with their own
 * status.
 *
 * A route middleware that refused a request by returning a plain
 * `{ status: 403, body, headers }` object had it ignored: the handler did not
 * run, but the ambient `200` went out. The branded `createGuardResponse`
 * object is now honoured by the router, the pipeline and the dispatcher,
 * while an unbranded object keeps its old meaning.
 */

import { afterEach, describe, expect, it } from "vitest";

import { createGuardResponse } from "@zudojs/middleware";

import * as http from "../src/index.js";
import { createNodeHttpAdapter } from "../src/httpAdapter/node/httpNode.adapter.js";
import type { NodeHttpAdapter } from "../src/httpAdapter/node/httpNode.adapter.js";
import { createRouteMatcher } from "../src/httpRouter/matching/httpRoute.matcher.js";
import { RouteDispatcher } from "../src/httpRouter/dispatch/httpRoute.dispatcher.js";

const started: NodeHttpAdapter[] = [];

afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});

async function serve(router: http.HttpRouter): Promise<string> {
  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await adapter.start();
  started.push(adapter);
  const address = adapter.address;
  if (!address) throw new Error("adapter did not report an address");
  return `http://127.0.0.1:${address.port}`;
}

function guardedRouter(
  guard: http.HttpMiddleware,
  effects: string[],
): http.HttpRouter {
  const router = new http.HttpRouter();
  router.get(
    "/secret",
    () => {
      effects.push("handler");
      return http.createResponseContext().json({ secret: true });
    },
    { middleware: [guard] },
  );
  return router;
}

describe("guard responses over a real server", () => {
  it("sends a route middleware's 403 with its body and headers", async () => {
    const effects: string[] = [];
    const origin = await serve(
      guardedRouter(
        async () =>
          createGuardResponse({
            status: 403,
            body: { error: "Forbidden" },
            headers: { "x-guard": "permissions" },
          }),
        effects,
      ),
    );

    const response = await fetch(`${origin}/secret`);

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-guard")).toBe("permissions");
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(effects).toEqual([]);
  });

  it("keeps headers an outer middleware set before the guard refused", async () => {
    const origin = await serve(
      (() => {
        const router = new http.HttpRouter();
        router.get("/x", () => http.createResponseContext().text("ok"), {
          middleware: [
            async (context, next) => {
              context.response.header("x-outer", "1");
              return next();
            },
            async () =>
              createGuardResponse({
                status: 401,
                body: { error: "Unauthorized" },
                headers: { "www-authenticate": "Bearer" },
              }),
          ],
        });
        return router;
      })(),
    );

    const response = await fetch(`${origin}/x`);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("x-outer")).toBe("1");
  });
});

describe("unbranded objects keep their meaning", () => {
  it("does not read a plain { status } object as a response", async () => {
    const effects: string[] = [];
    const router = guardedRouter(
      (async () => ({
        status: 403,
        body: { error: "data" },
        headers: {},
      })) as unknown as http.HttpMiddleware,
      effects,
    );

    const { response } = await router.dispatch(
      http.createRequestContext({ method: "GET", url: "/secret" }),
    );

    expect(response.status).not.toBe(403);
  });
});

describe("the other middleware entry points", () => {
  it("HttpMiddlewarePipeline converts a guard response to a real context", async () => {
    const pipeline = new http.HttpMiddlewarePipeline();
    pipeline.use(async () =>
      createGuardResponse({ status: 400, body: { error: "Bad" } }),
    );

    const response = await pipeline.execute(
      http.createRequestContext({ method: "GET", url: "/" }),
      http.createResponseContext(),
    );

    expect(response).toBeInstanceOf(http.HttpResponseContext);
    expect(response.status).toBe(400);
    expect(JSON.parse(String(response.body))).toEqual({ error: "Bad" });
  });

  it("RouteDispatcher writes a guard response onto the dispatch response", async () => {
    const effects: string[] = [];
    const router = guardedRouter(
      async () => createGuardResponse({ status: 404, body: { error: "Gone" } }),
      effects,
    );
    const response = http.createResponseContext();

    await new RouteDispatcher(createRouteMatcher(router)).dispatch(
      http.createRequestContext({ method: "GET", url: "/secret" }),
      response,
    );

    expect(response.status).toBe(404);
    expect(effects).toEqual([]);
  });

  it("refuses a header value carrying a control character", () => {
    expect(() =>
      http.guardResponseToContext(
        createGuardResponse({ status: 403, headers: { "x-a": "a\r\nb: c" } }),
      ),
    ).toThrow(TypeError);
  });
});
