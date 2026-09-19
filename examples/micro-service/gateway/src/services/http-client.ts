import type { ServiceConfig } from "../interfaces/index.js";

/**
 * Response from a proxied service call.
 */
export interface ServiceResponse<T = unknown> {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly data: T;
}

/**
 * Options for a proxy request.
 */
export interface ProxyRequestOptions {
  readonly method: string;
  readonly path: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly timeout?: number;
}

/**
 * Simple HTTP client for calling backend microservices using fetch().
 */
export class HttpClient {
  private readonly config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;
  }

  /**
   * Sends a GET request to the service.
   */
  async get<T = unknown>(
    path: string,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: "GET", path, headers, timeout });
  }

  /**
   * Sends a POST request to the service.
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: "POST", path, headers, body, timeout });
  }

  /**
   * Sends a PUT request to the service.
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: "PUT", path, headers, body, timeout });
  }

  /**
   * Sends a PATCH request to the service.
   */
  async patch<T = unknown>(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: "PATCH", path, headers, body, timeout });
  }

  /**
   * Sends a DELETE request to the service.
   */
  async delete<T = unknown>(
    path: string,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: "DELETE", path, headers, timeout });
  }

  /**
   * Core request method.
   */
  async request<T = unknown>(
    options: ProxyRequestOptions,
  ): Promise<ServiceResponse<T>> {
    const url = new URL(options.path, this.config.url);
    const timeout = options.timeout ?? this.config.timeout;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions: RequestInit = {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      };

      if (options.body !== undefined && options.method !== "GET") {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(url.toString(), fetchOptions);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let data: T;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as unknown as T;
      }

      return { status: response.status, headers: responseHeaders, data };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `Request to ${this.config.name} timed out after ${timeout}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Creates an HTTP client for a specific backend service.
 */
export function createServiceClient(config: ServiceConfig): HttpClient {
  return new HttpClient(config);
}
