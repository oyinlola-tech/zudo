import { afterEach, describe, expect, it } from "vitest";
// The real @zudojs/http, through its built dist. permissions may not depend
// on it (http is a higher tier), so the test reaches it by path, as the
// guards e2e test does.
import {
  HttpRouter,
  createNodeHttpAdapter,
  createResponseContext,
  type HttpMiddleware as RealHttpMiddleware,
  type NodeHttpAdapter,
} from "../../http/dist/index.js";
import {
  DECISION_STATE_KEY,
  RESOURCE_NOT_FOUND_DECISION,
  authorize,
  createNotFoundResponse,
  createPermissionActor,
  createPermissionEngine,
  createRequirePermissionsMiddleware,
  resourceEquals,
  type HttpMiddlewareContext,
  type PermissionDecision,
  type RequirePermissionMiddlewareOptions,
} from "../src/index.js";

interface Post {
  readonly id: string;
  readonly ownerId: string;
  readonly locked: boolean;
}

const posts = new Map<string, Post>([
  ["p1", { id: "p1", ownerId: "alice", locked: false }],
  ["p2", { id: "p2", ownerId: "bob", locked: true }],
]);

// Editors may update any unlocked post: role grant plus a deny rule on the
// resource, so a resource-less check is *allowed* by the role alone.
const engine = createPermissionEngine({
  roles: [{ name: "editor", permissions: ["post:update"] }],
  rules: [
    {
      name: "locked",
      effect: "deny",
      resource: "post",
      action: "update",
      condition: resourceEquals("locked", true),
    },
  ],
});

const actorFromHeader = (context: HttpMiddlewareContext) => {
  const id = context.request.getHeader?.("x-user");
  if (!id) return undefined;
  return createPermissionActor(id, {
    roles: id === "editor" ? ["editor"] : [],
  });
};

const loadPost = async (context: HttpMiddlewareContext) => {
  const id = context.request.getParam?.("id");
  return id === undefined ? undefined : (posts.get(id) ?? null);
};

const started: NodeHttpAdapter[] = [];
afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});

async function serve(
  guard: RealHttpMiddleware,
): Promise<{ origin: string; effects: string[]; decisions: unknown[] }> {
  const effects: string[] = [];
  const decisions: unknown[] = [];
  const record: RealHttpMiddleware = async (context, next) => {
    try {
      return await next();
    } finally {
      decisions.push(context.state.get(DECISION_STATE_KEY));
    }
  };
  const router = new HttpRouter();
  router.put(
    "/posts/:id",
    () => {
      effects.push("handler");
      return createResponseContext().json({ updated: true });
    },
    { middleware: [record, guard] },
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
  return { origin: `http://127.0.0.1:${port}`, effects, decisions };
}

function guardWith(
  options: Omit<RequirePermissionMiddlewareOptions, "permission">,
): RealHttpMiddleware {
  return authorize(engine, "post:update", {
    extractActor: actorFromHeader,
    extractResource: loadPost,
    ...options,
  });
}

const put = (origin: string, id: string, user?: string) =>
  fetch(`${origin}/posts/${id}`, {
    method: "PUT",
    headers: user ? { "x-user": user } : {},
  });

describe('authorize() with onMissingResource: "notFound"', () => {
  it("answers a missing resource with 404 and never runs the handler", async () => {
    const { origin, effects, decisions } = await serve(
      guardWith({ onMissingResource: "notFound" }),
    );

    const response = await put(origin, "nope", "editor");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      error: "Not Found",
      message: "Resource not found",
    });
    expect(effects).toEqual([]);
    expect(decisions).toEqual([RESOURCE_NOT_FOUND_DECISION]);
  });

  it("uses notFoundResponse for the 404 body", async () => {
    const { origin } = await serve(
      guardWith({
        onMissingResource: "notFound",
        notFoundResponse: () => ({ code: "POST_NOT_FOUND" }),
      }),
    );

    const response = await put(origin, "nope", "editor");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "POST_NOT_FOUND" });
  });

  it("still answers 401 before looking the resource up", async () => {
    const { origin, effects } = await serve(
      guardWith({ onMissingResource: "notFound" }),
    );

    const response = await put(origin, "nope");

    expect(response.status).toBe(401);
    expect(effects).toEqual([]);
  });

  it("checks an existing resource as before: 403 on a locked post, 200 otherwise", async () => {
    const { origin, effects } = await serve(
      guardWith({ onMissingResource: "notFound" }),
    );

    expect((await put(origin, "p2", "editor")).status).toBe(403);
    expect((await put(origin, "p1", "reader")).status).toBe(403);
    expect((await put(origin, "p1", "editor")).status).toBe(200);
    expect(effects).toEqual(["handler"]);
  });

  it('answers 403 without evaluating under "forbid"', async () => {
    const { origin, effects, decisions } = await serve(
      guardWith({ onMissingResource: "forbid" }),
    );

    const response = await put(origin, "nope", "editor");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Access denied",
    });
    expect(effects).toEqual([]);
    expect((decisions[0] as PermissionDecision).reason).toBe(
      "resource_not_found",
    );
  });

  it("keeps the default: a missing resource is checked as undefined", async () => {
    // The role grants post:update and nothing inspects a missing resource,
    // so the default lets the request reach the handler, exactly as before.
    const { origin, effects } = await serve(guardWith({}));

    expect((await put(origin, "nope", "editor")).status).toBe(200);
    expect((await put(origin, "nope", "reader")).status).toBe(403);
    expect(effects).toEqual(["handler"]);
  });

  it("does not treat a route with no extractResource as missing", async () => {
    const { origin, effects } = await serve(
      authorize(engine, "post:update", {
        extractActor: actorFromHeader,
        onMissingResource: "notFound",
      }),
    );

    expect((await put(origin, "nope", "editor")).status).toBe(200);
    expect(effects).toEqual(["handler"]);
  });

  it("applies to createRequirePermissionsMiddleware too", async () => {
    const { origin, effects } = await serve(
      createRequirePermissionsMiddleware(engine, ["post:update"], {
        extractActor: actorFromHeader,
        extractResource: loadPost,
        onMissingResource: "notFound",
      }),
    );

    expect((await put(origin, "nope", "editor")).status).toBe(404);
    expect((await put(origin, "p1", "editor")).status).toBe(200);
    expect(effects).toEqual(["handler"]);
  });
});

describe("createNotFoundResponse", () => {
  it("builds a 404 guard response with a JSON body", () => {
    const response = createNotFoundResponse();
    expect(response.status).toBe(404);
    expect(response.headers).toEqual({ "content-type": "application/json" });
    expect(response.body).toEqual({
      error: "Not Found",
      message: "Resource not found",
    });
  });
});
