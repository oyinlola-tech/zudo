import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
// The real @zudojs/http, through its built dist. permissions declares no
// dependency on it (http is a higher tier); this test is what keeps the
// structural mirror in httpTypes.ts honest.
import {
  HttpMiddlewarePipeline,
  createRequestContext,
  createResponseContext,
} from "../../http/dist/index.js";
import {
  authorize,
  createPermissionActor,
  createPermissionEngine,
  createRequirePermissionsMiddleware,
  resourceEquals,
  type HttpMiddleware,
  type HttpMiddlewareContext,
} from "../src/index.js";

type RealMiddleware = Parameters<HttpMiddlewarePipeline["use"]>[0];
type RealContext = Parameters<RealMiddleware>[0];

// Compile-time: the real request context satisfies the local mirror. This
// is the direction that matters — the guard reads what http hands it. The
// return direction needs a cast: http's declared result type omits the plain
// `{ status, headers, body }` objects its pipeline accepts at runtime.
const mirrorAcceptsReal = (context: RealContext): HttpMiddlewareContext =>
  context;
const asReal = (middleware: HttpMiddleware): RealMiddleware =>
  middleware as unknown as RealMiddleware;

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
const editor = createPermissionActor("u1", { roles: ["editor"] });
const posts: Record<string, { id: string; locked: boolean }> = {
  p1: { id: "p1", locked: true },
  p2: { id: "p2", locked: false },
};

async function run(
  guard: HttpMiddleware,
  id: string,
): Promise<number> {
  const pipeline = new HttpMiddlewarePipeline();
  pipeline.use(asReal(guard));
  pipeline.use(async (_context, next) => next());
  const request = createRequestContext({
    method: "PUT",
    url: `http://x.test/posts/${id}`,
    params: { id },
  });
  const response = await pipeline.execute(request, createResponseContext());
  return response.status;
}

describe("authz/PERM-03", () => {
  it("mirrors the real http context structurally", () => {
    expect(typeof mirrorAcceptsReal).toBe("function");
  });

  it("awaits an async extractResource inside the real http pipeline", async () => {
    const guard = authorize(engine, "post:update", {
      extractActor: () => editor,
      extractResource: async (context: HttpMiddlewareContext) =>
        posts[context.request.getParam?.("id") ?? ""],
    });
    expect(await run(guard, "p1")).toBe(403);
    expect(await run(guard, "p2")).toBe(200);
  });

  it("denies, without an unhandled rejection, when the loader rejects", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const onError = vi.fn();
    const guard = authorize(engine, "post:update", {
      extractActor: () => editor,
      extractResource: async () => {
        throw new Error("post not found");
      },
      onError,
    });
    const next = vi.fn(async () => ({ status: 200, headers: {} }));
    const context = {
      request: { params: {}, headers: {}, query: {} },
      state: new Map<string, unknown>(),
      signal: new AbortController().signal,
      metadata: {},
    } as unknown as HttpMiddlewareContext;
    const result = await guard(context, next);
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off("unhandledRejection", unhandled);
    expect(result).toMatchObject({ status: 403 });
    expect(next).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "extractResource");
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("authz/PERM-08", () => {
  it("an empty permission list denies in 'all' mode", async () => {
    const guard = createRequirePermissionsMiddleware(engine, [], {
      extractActor: () => createPermissionActor("nobody"),
    });
    expect(await run(guard, "p2")).toBe(403);
  });
});

describe("cross/CV-01", () => {
  it("declares no dependency or peer on a higher-tier package", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    expect(Object.keys(pkg.peerDependencies ?? {})).not.toContain("@zudojs/http");
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("@zudojs/http");
  });
});
