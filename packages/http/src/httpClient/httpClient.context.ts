/**
 * HTTP client request context creation.
 *
 * @module httpClient/context
 */

import { createFetchRequest } from "../httpAdapter/httpFetch.adapter.js";

import type {
  HttpClientMethod,
  HttpClientRequestConfig,
  HttpClientRequestContext,
} from "./httpClient.type.js";

import { buildClientUrl } from "./httpClient.url.js";

import { mergeHeaders } from "./httpClient.headers.js";

import { normalizeRequestBody } from "./httpClient.body.js";

export function createContext(
  url: string | URL,
  config: HttpClientRequestConfig,
  baseUrl: string | undefined,
  defaultHeaders: Headers,
  defaults: Omit<RequestInit, "headers"> = {},
): HttpClientRequestContext {
  const method = (config.method ?? "GET").toUpperCase() as HttpClientMethod;
  const target = buildClientUrl(url, baseUrl, config.query);
  const headers = mergeHeaders(defaultHeaders, config.headers);
  const body = normalizeRequestBody(config.body, headers, method);

  /*
   * Client-level defaults are applied first and the per-request config
   * overrides them. Previously `defaults` was built in the constructor and
   * read nowhere, so `redirect: "manual"`, `credentials: "omit"` and an
   * `integrity` pin were all silently dropped.
   */
  const request = createFetchRequest(
    {
      url: typeof target === "string" ? target : target.toString(),
      method,
      headers: Object.fromEntries(headers.entries()),
      body,
    },
    {
      credentials: config.credentials ?? defaults.credentials,
      mode: config.mode ?? defaults.mode,
      cache: config.cache ?? defaults.cache,
      redirect: config.redirect ?? defaults.redirect,
      referrer: config.referrer ?? defaults.referrer,
      referrerPolicy: config.referrerPolicy ?? defaults.referrerPolicy,
      integrity: config.integrity ?? defaults.integrity,
      keepalive: config.keepalive ?? defaults.keepalive,
    },
  );

  return {
    url: target.toString(),
    config: { ...config, method },
    request,
  };
}
