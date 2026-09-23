import { readBoundedBody } from "@zudojs/rpc";
import { findUnsafeKey } from "@zudojs/security";

import type { Serializer } from "@zudojs/serialization";

import { isPlainObject } from "@zudojs/types";

import type { APIOperationRoute } from "../route/apiRoute.type.js";

import type { APIError } from "../../errors/index.js";

import { createAPIError, ErrorCode } from "../../errors/index.js";

const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i;

const UNSAFE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Operation input read from a request, or the client error explaining why
 * it could not be read.
 */
export type APIFetchInput =
  | { readonly ok: true; readonly input: unknown }
  | { readonly ok: false; readonly error: APIError };

/**
 * Reads operation input from a Fetch API request.
 *
 * `GET` / `DELETE` routes read the query string: each key becomes a
 * string, a repeated key an array of strings (schemas coerce as needed).
 * Body routes read a JSON body, bounded by `maxBodyBytes`; an empty body
 * is `undefined`, and any declared content type other than JSON is
 * refused (415) even when the body is empty. Path parameters are merged
 * over the result and win, so the URL — not the body — names the
 * resource. Keys that could pollute a prototype (`__proto__`,
 * `constructor`, `prototype`) are refused at any depth, in the query and
 * the body alike.
 */
export async function readFetchInput(
  request: Request,
  url: URL,
  route: APIOperationRoute,
  params: Readonly<Record<string, string>>,
  serializer: Serializer<unknown, string>,
  maxBodyBytes: number,
): Promise<APIFetchInput> {
  const hasParams = route.pathParams.length > 0;

  if (route.inputSource === "query") {
    const query: Record<string, unknown> = {};
    for (const key of new Set(url.searchParams.keys())) {
      if (UNSAFE_KEYS.has(key)) {
        return fail(400, ErrorCode.API_VALIDATION, `Query parameter "${key}" is not allowed.`);
      }
      const values = url.searchParams.getAll(key);
      query[key] = values.length === 1 ? values[0] : values;
    }
    return { ok: true, input: { ...query, ...params } };
  }

  const body = await readBoundedBody(request, maxBodyBytes);
  if (!body.ok) {
    return body.reason === "too-large"
      ? fail(413, ErrorCode.PAYLOAD_TOO_LARGE, `Request body exceeds ${maxBodyBytes} bytes.`)
      : fail(400, ErrorCode.HTTP_BODY, "Request body could not be read.");
  }

  // A declared non-JSON type is refused even with an empty body: an HTML
  // form can post `text/plain`, `multipart/form-data` or urlencoded bodies
  // cross-site without a CORS preflight, which would otherwise run an
  // input-less operation on the victim's cookies.
  const contentType = request.headers.get("content-type");
  if (contentType !== null && !JSON_TYPE.test(contentType)) {
    return fail(415, ErrorCode.HTTP_UNSUPPORTED_BODY_TYPE, "Request body must be application/json.");
  }

  let value: unknown;
  if (body.text.trim().length > 0) {
    if (contentType === null) {
      return fail(415, ErrorCode.HTTP_UNSUPPORTED_BODY_TYPE, "Request body must be application/json.");
    }
    try {
      value = serializer.deserialize(body.text);
    } catch {
      return fail(400, ErrorCode.HTTP_BODY_PARSE, "Request body is not valid JSON.");
    }
    const unsafe = findUnsafeKey(value);
    if (unsafe !== undefined) {
      return fail(400, ErrorCode.API_VALIDATION, `Request body key "${unsafe}" is not allowed.`);
    }
  }

  if (!hasParams) {
    return { ok: true, input: value };
  }
  if (value !== undefined && !isPlainObject(value)) {
    return fail(400, ErrorCode.API_VALIDATION, "Request body must be a JSON object.");
  }
  return { ok: true, input: { ...(value ?? {}), ...params } };
}

function fail(statusCode: number, code: ErrorCode, message: string): APIFetchInput {
  return { ok: false, error: createAPIError(message, { statusCode, code, expose: true }) };
}
