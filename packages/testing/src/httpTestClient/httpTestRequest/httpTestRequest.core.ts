/**
 * @zudojs/testing — fluent HTTP test request.
 */

import {
  expectHeader,
  expectJson,
  expectStatus,
  expectText,
} from "../httpTestResponse/index.js";
import type {
  HttpTestExpectation,
  HttpTestResponse,
} from "../httpTestResponse/index.js";
import {
  appendQuery,
  basicAuthorization,
  normalizePath,
} from "./httpTestRequest.encode.js";
import { executeHttpTestRequest } from "./httpTestRequest.execute.js";
import type { RegisteredExpectation } from "./httpTestRequest.execute.js";
import type {
  HttpTestBody,
  HttpTestQuery,
  HttpTestRequest,
  HttpTestRequestContext,
} from "./httpTestRequest.type.js";

/**
 * Creates a request bound to a client context. Nothing is sent until the
 * request is awaited.
 */
export function createHttpTestRequest(
  context: HttpTestRequestContext,
  method: string,
  path: string,
): HttpTestRequest {
  const headers = new Headers(context.headers);
  const expectations: RegisteredExpectation[] = [];
  let target = normalizePath(path);
  let body: HttpTestBody | undefined;
  let hasBody = false;
  let timeoutMs = context.timeout;
  let sent: Promise<HttpTestResponse> | undefined;

  const mutable = (): void => {
    if (sent) {
      throw new TypeError(
        `${method} ${target} has already been sent; build a new request.`,
      );
    }
  };

  const execute = (): Promise<HttpTestResponse> =>
    executeHttpTestRequest(context, {
      method,
      target,
      headers,
      body,
      hasBody,
      timeoutMs,
      expectations,
    });

  const register = (check: HttpTestExpectation): HttpTestRequest => {
    mutable();
    expectations.push({ check, site: new Error("expectation") });
    return request;
  };

  const request: HttpTestRequest = {
    set(
      nameOrHeaders: string | Readonly<Record<string, string>>,
      value?: string,
    ) {
      mutable();
      const entries =
        typeof nameOrHeaders === "string"
          ? [[nameOrHeaders, value ?? ""] as const]
          : Object.entries(nameOrHeaders);
      for (const [name, entry] of entries) headers.set(name, entry);
      return request;
    },
    query(values: HttpTestQuery) {
      mutable();
      target = appendQuery(target, values);
      return request;
    },
    send(value: HttpTestBody) {
      mutable();
      body = value;
      hasBody = value !== undefined;
      return request;
    },
    auth(tokenOrUser: string, password?: string) {
      mutable();
      headers.set(
        "authorization",
        password === undefined
          ? `Bearer ${tokenOrUser}`
          : basicAuthorization(tokenOrUser, password),
      );
      return request;
    },
    timeout(ms: number) {
      mutable();
      if (!Number.isFinite(ms) || ms <= 0) {
        throw new RangeError(
          `Request timeout must be a positive number of milliseconds; got ${ms}.`,
        );
      }
      timeoutMs = ms;
      return request;
    },
    expect(
      first: number | string | HttpTestExpectation,
      value?: string | RegExp,
    ) {
      if (typeof first === "number") return register(expectStatus(first));
      if (typeof first === "function") return register(first);
      if (value === undefined) {
        throw new TypeError(
          `.expect("${first}") needs the header value or pattern to compare with.`,
        );
      }
      return register(expectHeader(first, value));
    },
    expectJson: (expected: unknown) => register(expectJson(expected)),
    expectText: (expected: string | RegExp) => register(expectText(expected)),
    then(onFulfilled, onRejected) {
      sent ??= execute();
      return sent.then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      sent ??= execute();
      return sent.catch(onRejected);
    },
  };

  return request;
}
