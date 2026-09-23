import { afterEach, describe, expect, it } from "vitest";
// The real @zudojs/http, through its built dist. permissions may not depend
// on it (http is a higher tier), so the test reaches it by path, as the
// round-10 http test does.
import {
  HttpRouter,
  createNodeHttpAdapter,
  createResponseContext,
  type HttpMiddleware as RealHttpMiddleware,
  type NodeHttpAdapter,
} from "../../http/dist/index.js";
import {
  authorize,
  createActorMiddleware,
  createPermissionActor,
  createPermissionEngine,
  createRequirePermissionsMiddleware,
  type HttpMiddleware,
  type HttpMiddlewareContext,
} from "../src/index.js";

// Compile-time: every exported guard is an http `HttpMiddleware` as it is,
// with no `as never` / `as unknown as` cast.
const engine = createPermissionEngine({
  roles: [{ name: "editor", permissions: ["post:update"] }],
});
const actorFromHeader = (context: HttpMiddlewareContext) => {
  const id = context.request.getHeader?.("x-user");
  if (!id) return undefined;
  return createPermissionActor(id, {
    roles: id === "editor" ? ["editor"] : [],
  });
};
const guard: RealHttpMiddleware = authorize(engine, "post:update", {
  extractActor: actorFromHeader,
});
const typedGuards: readonly RealHttpMiddleware[] = [
  guard,
  createActorMiddleware({ extractActor: actorFromHeader }),
  createRequirePermissionsMiddleware(engine, ["post:update"]),
];
// A hand-written middleware typed with the local mirror is assignable too.
const passthrough: HttpMiddleware = async (_context, next) => next();
const assigned: RealHttpMiddleware = passthrough;

const started: NodeHttpAdapter[] = [];
afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});

async function serve(): Promise<{ origin: string; effects: string[] }> {
  const effects: string[] = [];
  const router = new HttpRouter();
  router.put(
    "/posts/:id",
    () => {
      effects.push("handler");
      return createResponseContext().json({ updated: true });
    },
    { middleware: [assigned, guard] },
  );
  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await adapter.start();
  started.push(adapter);
  const port = adapter.address?.port;
  if (port === undefined) throw new Error("no address");
  return { origin: `http://127.0.0.1:${port}`, effects };
}

describe("authorize() over a real @zudojs/http server", () => {
  it("types every guard as an http middleware without a cast", () => {
    expect(typedGuards).toHaveLength(3);
  });

  it("answers an unauthenticated request with 401 and WWW-Authenticate", async () => {
    const { origin, effects } = await serve();

    const response = await fetch(`${origin}/posts/1`, { method: "PUT" });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Authentication required",
    });
    expect(effects).toEqual([]);
  });

  it("answers a denied request with 403, not 200", async () => {
    const { origin, effects } = await serve();

    const response = await fetch(`${origin}/posts/1`, {
      method: "PUT",
      headers: { "x-user": "reader" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Access denied",
    });
    expect(effects).toEqual([]);
  });

  it("lets a permitted request through to the handler", async () => {
    const { origin, effects } = await serve();

    const response = await fetch(`${origin}/posts/1`, {
      method: "PUT",
      headers: { "x-user": "editor" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: true });
    expect(effects).toEqual(["handler"]);
  });
});
