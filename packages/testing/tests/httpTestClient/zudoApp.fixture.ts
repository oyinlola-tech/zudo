/**
 * A small real @zudojs/http application used by the test client tests.
 */

import { createResponseContext, createRouter, notFound } from "@zudojs/http";
import type { HttpRouter } from "@zudojs/http";

export const SECRET = "db-password-hunter2";

function readJson(body: unknown): unknown {
  if (!(body instanceof Uint8Array) || body.byteLength === 0) return undefined;
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

export function createZudoApp(): HttpRouter {
  const router = createRouter();

  router.get("/users/:id", (ctx) =>
    createResponseContext().json({ id: ctx.params.id, query: ctx.query }),
  );

  router.post("/users", (ctx) => {
    const input = readJson(ctx.request.body) as { readonly name?: string };
    return createResponseContext()
      .setStatus(201)
      .setHeader("location", "/users/42")
      .json({ id: "42", name: input.name, type: ctx.request.contentType });
  });

  router.get("/headers", (ctx) =>
    createResponseContext().json({
      authorization: ctx.request.getHeader("authorization") ?? null,
      custom: ctx.request.getHeader("x-custom") ?? null,
      defaulted: ctx.request.getHeader("x-default") ?? null,
    }),
  );

  router.post("/login", () =>
    createResponseContext()
      .cookie("session", "s3cr3t", { path: "/", httpOnly: true })
      .json({ ok: true }),
  );

  router.post("/logout", () =>
    createResponseContext()
      .cookie("session", "", { path: "/", maxAge: 0 })
      .json({ ok: true }),
  );

  router.get("/me", (ctx) =>
    createResponseContext().json({
      cookie: ctx.request.getHeader("cookie") ?? null,
    }),
  );

  router.get("/missing", () => {
    throw notFound("No such thing");
  });

  router.get("/boom", () => {
    throw new Error(`connection failed with ${SECRET}`);
  });

  router.get("/text", () => createResponseContext().text("hello world"));

  router.get("/slow", async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return createResponseContext().text("late");
  });

  return router;
}
