/**
 * Shared harness for the audit round 10 regression tests: a real
 * `NodeHttpAdapter` on an ephemeral port and a raw-socket client, so request
 * targets reach the server byte-for-byte.
 */

import { connect } from "node:net";

import * as http from "../src/index.js";

export interface WireResponse {
  readonly status: number;
  readonly head: string;
  readonly body: string;
}

export function sendRaw(
  port: number,
  target: string,
  headers: Readonly<Record<string, string>> = { host: "x" },
  method = "GET",
  version = "1.1",
): Promise<WireResponse> {
  const lines = [`${method} ${target} HTTP/${version}`];

  for (const [name, value] of Object.entries(headers)) {
    lines.push(`${name}: ${value}`);
  }

  lines.push("connection: close", "", "");

  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");

    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
    });

    const finish = () => {
      const split = buffer.indexOf("\r\n\r\n");
      const head = split === -1 ? buffer : buffer.slice(0, split);
      const status = Number(head.split(" ")[1] ?? 0);

      resolve({ status, head, body: split === -1 ? "" : buffer.slice(split + 4) });
    };

    socket.on("close", finish);
    socket.on("error", () => undefined);
    socket.write(lines.join("\r\n"));
  });
}

export async function withAdapter(
  options: http.NodeAdapterOptions,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const adapter = new http.NodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    ...options,
  });

  await adapter.start();

  try {
    await run(adapter.address?.port ?? 0);
  } finally {
    await adapter.stop();
  }
}

export function jsonBody(response: WireResponse): unknown {
  const body = response.body;

  if (/transfer-encoding: chunked/i.test(response.head)) {
    const start = body.indexOf("\r\n") + 2;

    return JSON.parse(body.slice(start, body.indexOf("\r\n", start)));
  }

  return JSON.parse(body);
}
