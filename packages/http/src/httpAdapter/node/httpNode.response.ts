/**
 * Node.js HTTP response writer.
 *
 * @module httpAdapter/node/response
 */

import type { ServerResponse } from "node:http";

import type { HttpResponseWriter } from "../../httpResponse/httpResponse.writer.js";

/* -------------------------------------------------------------------------- */
/* Node Response Writer                                                       */
/* -------------------------------------------------------------------------- */

export class NodeResponseWriter implements HttpResponseWriter {
  constructor(private readonly response: ServerResponse) {}

  get headersSent(): boolean {
    return this.response.headersSent;
  }

  get writableEnded(): boolean {
    return this.response.writableEnded;
  }

  get writable(): boolean {
    return this.response.writable;
  }

  writeHead(
    status: number,
    statusText?: string,
    headers?: Readonly<Record<string, string>>,
  ): void {
    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, value);
      }
    }

    if (statusText !== undefined && statusText !== "") {
      this.response.writeHead(status, statusText);

      return;
    }

    this.response.writeHead(status);
  }

  setHeader(name: string, value: string): void {
    this.response.setHeader(name, value);
  }

  appendHeader(name: string, value: string): void {
    const existing = this.response.getHeader(name);

    if (existing === undefined) {
      this.response.setHeader(name, value);

      return;
    }

    if (Array.isArray(existing)) {
      this.response.setHeader(name, [...existing.map(String), value]);

      return;
    }

    this.response.setHeader(name, [String(existing), value]);
  }

  removeHeader(name: string): void {
    this.response.removeHeader(name);
  }

  write(chunk: string | Uint8Array): boolean {
    return this.response.write(chunk);
  }

  end(chunk?: string | Uint8Array): void {
    if (chunk === undefined) {
      this.response.end();

      return;
    }

    this.response.end(chunk);
  }

  /**
   * Resolves once the socket has drained, or immediately if it already has.
   */
  waitForDrain(): Promise<void> {
    if (this.response.writableEnded || this.response.destroyed) {
      return Promise.resolve();
    }

    if (this.response.writableNeedDrain !== true) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const done = (): void => {
        this.response.off("drain", done);

        this.response.off("close", done);

        this.response.off("error", done);

        resolve();
      };

      this.response.once("drain", done);

      this.response.once("close", done);

      this.response.once("error", done);
    });
  }

  flushHeaders(): void {
    this.response.flushHeaders();
  }

  flush(): void {
    const response = this.response as ServerResponse & {
      flush?: () => void;
    };

    response.flush?.();
  }
}
