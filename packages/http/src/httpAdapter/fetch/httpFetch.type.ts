/**
 * Fetch adapter types.
 *
 * @module httpAdapter/fetch/types
 */

import { DEFAULT_MAX_BODY_SIZE } from "../../httpSecurity/httpSecurity.config.js";

export interface FetchAdapterOptions {
  readonly port?: number;
  readonly host?: string;
  readonly maxBodySize?: number;
  readonly trustProxy?: boolean;
}

export interface FetchRequestInput {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

export interface FetchResponseWriter {
  readonly status: (code: number) => FetchResponseWriter;
  readonly header: (name: string, value: string) => FetchResponseWriter;
  readonly send: (body?: unknown) => Promise<void>;
  readonly json: (data: unknown) => Promise<void>;
  readonly end: () => Promise<void>;
}

export interface FetchAdapterResult {
  readonly response: Response;
  readonly context: unknown;
}

export { DEFAULT_MAX_BODY_SIZE };
