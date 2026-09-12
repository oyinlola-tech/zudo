/**
 * HTTP response context implementation.
 *
 * @module httpResponse/context
 */

import type {
  ResponseBody,
  ResponseHeaders,
  ResponseContextInit,
  ResponseCookie,
  ResponseContextSnapshot,
} from "./core/httpResponse.type.js";

import { DEFAULT_RESPONSE_STATUS } from "./core/httpResponse.type.js";

import { getStatusText } from "./core/httpResponse.statusText.js";

import { assertSafeRedirect } from "../httpRedirect/http.redirect.js";

export class HttpResponseContext {
  private _status: number;
  private _statusText: string;
  private _headers: ResponseHeaders;
  private _body: ResponseBody;
  private _cookies: ResponseCookie[];
  private _sent = false;
  private _timestamp: number;

  constructor(init: ResponseContextInit = {}) {
    this._status = init.status ?? DEFAULT_RESPONSE_STATUS;
    this._statusText = init.statusText ?? getStatusText(this._status);
    this._headers = { ...init.headers };
    this._body = init.body;
    this._cookies = [...(init.cookies ?? [])];
    this._timestamp = Date.now();
  }

  get status(): number {
    return this._status;
  }

  get statusText(): string {
    return this._statusText;
  }

  get headers(): ResponseHeaders {
    return { ...this._headers };
  }

  get body(): ResponseBody {
    return this._body;
  }

  get cookies(): readonly ResponseCookie[] {
    return this._cookies;
  }

  get sent(): boolean {
    return this._sent;
  }

  get timestamp(): number {
    return this._timestamp;
  }

  status_code(code: number): this {
    this._status = code;
    this._statusText = getStatusText(code);
    return this;
  }

  header(name: string, value: string | string[]): this {
    this._headers[name.toLowerCase()] = value;
    return this;
  }

  headers_obj(headers: ResponseHeaders): this {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        this._headers[key.toLowerCase()] = value;
      }
    }
    return this;
  }

  setBody(body: ResponseBody): this {
    this._body = body;
    return this;
  }

  json(data: unknown): this {
    this._body = JSON.stringify(data);
    this._headers["content-type"] = "application/json";
    return this;
  }

  text(content: string): this {
    this._body = content;
    this._headers["content-type"] = "text/plain";
    return this;
  }

  html(content: string): this {
    this._body = content;
    this._headers["content-type"] = "text/html";
    return this;
  }

  cookie(
    name: string,
    value: string,
    options?: ResponseCookie["options"],
  ): this {
    this._cookies.push({ name, value, options });
    return this;
  }

  removeCookie(name: string): this {
    this._cookies = this._cookies.filter((c) => c.name !== name);
    return this;
  }

  /**
   * Redirects to `url`.
   *
   * The destination goes through `assertSafeRedirect`: a `javascript:` or
   * `data:` URL, a scheme-relative `//evil.com`, or a value carrying a
   * control character throws instead of being emitted as `Location`. An
   * absolute `http(s)` URL and a same-origin path reference are accepted.
   *
   * @throws {TypeError} If the destination is not a safe redirect target.
   */
  redirect(url: string, status = 302): this {
    const location = assertSafeRedirect(url);
    this._status = status;
    this._statusText = getStatusText(status);
    this._headers["location"] = location;
    return this;
  }

  markSent(): void {
    this._sent = true;
  }

  assertMutable(): void {
    if (this._sent) {
      throw new Error("Response context is already sent");
    }
  }

  commit(): void {
    this._sent = true;
    this._timestamp = Date.now();
  }

  get contentType(): string | undefined {
    const ct = this._headers["content-type"];
    return typeof ct === "string" ? ct : undefined;
  }

  set contentType(value: string | undefined) {
    if (value !== undefined) {
      this._headers["content-type"] = value;
    }
  }

  get contentLength(): number | undefined {
    const cl = this._headers["content-length"];
    if (typeof cl === "string") {
      return parseInt(cl, 10);
    }
    return undefined;
  }

  setContentType(value: string): this {
    this._headers["content-type"] = value;
    return this;
  }

  setContentLength(value: number): this {
    this._headers["content-length"] = String(value);
    return this;
  }

  removeHeader(name: string): this {
    delete this._headers[name.toLowerCase()];
    return this;
  }

  /* ------------------------------------------------------------------ */
  /* Adapter-compatible setters                                         */
  /* ------------------------------------------------------------------ */

  setStatus(code: number, statusText?: string): this {
    this._status = code;
    this._statusText = statusText ?? getStatusText(code);
    return this;
  }

  setHeader(name: string, value: string): this {
    this._headers[name.toLowerCase()] = value;
    return this;
  }

  setCookie(cookie: ResponseCookie): this {
    this._cookies.push(cookie);
    return this;
  }

  private _metadata: Record<string, unknown> = {};

  get metadata(): Readonly<Record<string, unknown>> {
    return { ...this._metadata };
  }

  setMetadata(key: string, value: unknown): this {
    this._metadata[key] = value;
    return this;
  }

  internalServerError(): this {
    this._status = 500;
    this._statusText = getStatusText(500);
    return this;
  }

  snapshot(): ResponseContextSnapshot {
    return {
      status: this._status,
      statusText: this._statusText,
      headers: { ...this._headers },
      body: this._body,
      cookies: [...this._cookies],
      sent: this._sent,
      timestamp: this._timestamp,
    };
  }

  clone(): HttpResponseContext {
    const clone = new HttpResponseContext({
      status: this._status,
      statusText: this._statusText,
      headers: { ...this._headers },
      body: this._body,
      cookies: [...this._cookies],
    });
    return clone;
  }
}

/**
 * Creates a new response context.
 */
export function createResponseContext(
  init?: ResponseContextInit,
): HttpResponseContext {
  return new HttpResponseContext(init);
}

export * from "./core/httpResponse.type.js";
export * from "./core/httpResponse.statusText.js";
export * from "./httpResponse.helper.js";
export type {
  ResponseCookie,
  CookieOptions,
  SameSite,
  CookiePriority,
} from "./core/httpResponse.type.js";
