/**
 * HTTP client core class.
 *
 * @module httpClient/client
 */

import type {
  HttpClientRequestConfig,
  HttpRetryOptions,
  HttpClientOptions,
  HttpClientResponse,
  HttpRequestInterceptor,
  HttpResponseInterceptor,
  HttpErrorInterceptor,
} from "./httpClient.type.js";

import {
  normalizeBaseUrl,
  validateTimeout,
  isHttpClientResponse,
  HttpClientResponseMarker,
} from "./httpClient.helpers.js";

import { normalizeRetryOptions } from "./httpClient.retry.js";

import { normalizeClientError } from "./httpClient.errorNormalizer.js";

import { createContext } from "./httpClient.context.js";

import { executeWithRetry } from "./httpClient.executor.js";

import {
  addRequestInterceptor,
  addResponseInterceptor,
  addErrorInterceptor,
} from "./httpClient.interceptors.js";

export class HttpClient {
  readonly baseUrl: string | undefined;
  private readonly defaultHeaders: Headers;
  readonly defaultTimeout: number | undefined;
  readonly defaultRetry: HttpRetryOptions | undefined;
  readonly defaults: Omit<RequestInit, "headers">;
  readonly fetchImpl: typeof globalThis.fetch;
  private readonly requestInterceptors: HttpRequestInterceptor[];
  private readonly responseInterceptors: HttpResponseInterceptor[];
  private readonly errorInterceptors: HttpErrorInterceptor[];

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.defaultHeaders = new Headers(options.headers);
    this.defaultTimeout = validateTimeout(options.timeout);
    this.defaultRetry = normalizeRetryOptions(options.retry);

    this.defaults = {
      credentials: options.credentials,
      mode: options.mode,
      cache: options.cache,
      redirect: options.redirect,
      referrer: options.referrer,
      referrerPolicy: options.referrerPolicy,
      integrity: options.integrity,
      keepalive: options.keepalive,
    };

    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.requestInterceptors = [...(options.interceptors?.request ?? [])];
    this.responseInterceptors = [...(options.interceptors?.response ?? [])];
    this.errorInterceptors = [...(options.interceptors?.error ?? [])];
  }

  request<T = unknown>(
    url: string | URL,
    config: HttpClientRequestConfig = {},
  ): Promise<HttpClientResponse<T>> {
    return this.execute<T>(url, config);
  }

  /* Interceptors */

  addRequestInterceptor(interceptor: HttpRequestInterceptor): () => void {
    return addRequestInterceptor(this.requestInterceptors, interceptor);
  }

  addResponseInterceptor(interceptor: HttpResponseInterceptor): () => void {
    return addResponseInterceptor(this.responseInterceptors, interceptor);
  }

  addErrorInterceptor(interceptor: HttpErrorInterceptor): () => void {
    return addErrorInterceptor(this.errorInterceptors, interceptor);
  }

  /* Execution */

  private async execute<T>(
    url: string | URL,
    config: HttpClientRequestConfig,
  ): Promise<HttpClientResponse<T>> {
    let context = createContext(
      url,
      config,
      this.baseUrl,
      this.defaultHeaders,
      this.defaults,
    );

    try {
      for (const interceptor of this.requestInterceptors) {
        context = await interceptor(context);
      }

      const response = await executeWithRetry(context, this);

      let transformed: HttpClientResponse<T> =
        response as HttpClientResponse<T>;
      for (const interceptor of this.responseInterceptors) {
        transformed = await interceptor<T>(transformed);
      }

      return transformed;
    } catch (error) {
      const normalized = normalizeClientError(error, context.request);

      for (const interceptor of this.errorInterceptors) {
        const result = await interceptor(normalized);

        if (result instanceof HttpClientResponseMarker) {
          return result.value as HttpClientResponse<T>;
        }

        if (isHttpClientResponse(result)) {
          return result as HttpClientResponse<T>;
        }
      }

      throw normalized;
    }
  }
}
