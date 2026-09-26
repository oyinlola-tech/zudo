/**
 * zudojs-cli — Generated `src/utils/http.ts`.
 *
 * The small helpers every generated controller and the server use: JSON
 * responses, schema-issue responses, JSON body reading, mapping exposed
 * errors to responses, describing unexpected ones for the log, and the
 * @zudojs/security default headers.
 */

/** Renders `src/utils/http.ts`. */
export function renderHttpUtils(): string {
  return `import {
  badRequest,
  createResponseContext,
  type HttpMiddleware,
  type HttpResponseContext,
  type HttpRouterContext,
} from "@zudojs/http";
import type { SchemaIssue } from "@zudojs/schema";
import { generateSecurityHeaders } from "@zudojs/security";

/** A JSON response with \`status\`. */
export function json(status: number, data: unknown): HttpResponseContext {
  return createResponseContext({ status }).json(data);
}

/** A response with no body (for example 204). */
export function empty(status: number): HttpResponseContext {
  return createResponseContext({ status });
}

/** 400 listing where the input failed validation, without echoing it back. */
export function validationFailed(issues: readonly SchemaIssue[]): HttpResponseContext {
  return json(400, {
    error: "Validation failed",
    issues: issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}

/**
 * The request body parsed as JSON; \`undefined\` when there is none.
 * Malformed JSON is answered with 400.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
}

/**
 * The response for an error that carries an exposed HTTP status
 * (NotFoundError, badRequest(), an exposed 503, ...): its status, message
 * and code. \`undefined\` for anything else; server.ts then logs the error
 * and answers a generic 500 that never leaks the message.
 */
export function errorResponse(error: unknown): HttpResponseContext | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    readonly statusCode?: unknown;
    readonly expose?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
  };
  const status = candidate.statusCode;
  if (typeof status !== "number" || status < 400 || status > 599) return undefined;
  if (candidate.expose !== true || typeof candidate.message !== "string") return undefined;
  return json(status, {
    error: candidate.message,
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
  });
}

/** What the log records about an unexpected error: name, message, code, stack. */
export function errorDetails(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { error: String(error) };
  const { code } = error as { readonly code?: unknown };
  return {
    error: error.message,
    name: error.name,
    ...(typeof code === "string" ? { code } : {}),
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(error.cause === undefined ? {} : { cause: error.cause instanceof Error ? error.cause.message : String(error.cause) }),
  };
}

/**
 * Adds the @zudojs/security default headers (CSP, HSTS, nosniff,
 * X-Frame-Options DENY, ...) to every response that does not set its own:
 * the /docs page, for instance, sends a CSP that allows its assets.
 */
export function securityHeaders(): HttpMiddleware {
  const defaults = Object.entries(generateSecurityHeaders());
  return async (_context, next) => {
    const response = (await next()).clone();
    const present = new Set(Object.keys(response.headers).map((name) => name.toLowerCase()));
    for (const [name, value] of defaults) {
      if (!present.has(name.toLowerCase())) response.setHeader(name, value);
    }
    return response;
  };
}
`;
}
