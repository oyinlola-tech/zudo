/**
 * Audit round 10 regression tests: shutdown grace, media compression and
 * static conditional requests (HTTP-09, HTTP-12, HTTP-15).
 */

import { describe, it, expect, vi } from "vitest";

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import * as http from "../src/index.js";

vi.mock("fluent-ffmpeg", () => {
  const factory = () => {
    const command = {
      input: () => command,
      inputFormat: () => command,
      outputOptions: () => command,
      format: () => command,
      on: () => command,
      pipe: () => {
        const out = new PassThrough();
        setImmediate(() => out.end(Buffer.from("transcoded")));
        return out;
      },
    };
    return command;
  };
  return { default: factory };
});

async function run(middleware: http.HttpMiddleware, response: http.HttpResponseContext, headers = {}) {
  const pipeline = new http.HttpMiddlewarePipeline();
  pipeline.use(middleware);
  pipeline.use(async () => response);
  return pipeline.execute(
    http.createRequestContext({ method: "GET", url: "/f", headers }),
    http.createResponseContext(),
  );
}

describe("HTTP-09", () => {
  it("passes the server's shutdown timeout to the adapter as its grace period", async () => {
    const seen: unknown[] = [];
    const adapter = http.createNodeHttpAdapter({ host: "127.0.0.1", port: 0 });
    const stop = adapter.stop.bind(adapter);
    adapter.stop = async (options) => { seen.push(options); await stop(options); };

    const server = http.createHttpServer({ adapter, gracefulShutdownTimeout: 30_000, handler: () => "ok" });
    await server.start();
    await server.stop();

    expect(seen[0]).toEqual({ graceMs: 30_000 });
  });
});

describe("HTTP-12", () => {
  it("compresses the response returned by next(), capped by maxWidth", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#f00" } }).png().toBuffer();

    const result = await run(
      http.createImageCompressionMiddleware({ defaultFormat: "webp", maxWidth: 100 }),
      http.createResponseContext().setHeader("content-type", "image/png").setBody(png),
    );

    expect(result.headers["content-type"]).toBe("image/webp");
    expect((await sharp(result.body as Buffer).metadata()).width).toBe(100);
  });

  it("transcodes video through an ffmpeg() command instance", async () => {
    const errors: unknown[] = [];
    const result = await run(
      http.createVideoCompressionMiddleware({ onError: (e) => errors.push(e) }),
      http.createResponseContext().setHeader("content-type", "video/mp4").setBody(Buffer.from("raw")),
    );

    expect(errors).toEqual([]);
    expect(String(result.body)).toBe("transcoded");
  });
});

describe("HTTP-15", () => {
  const root = mkdtempSync(join(tmpdir(), "zudo-r10-"));
  writeFileSync(join(root, "f"), "DATA");
  const staticMw = http.createStaticMiddleware({ root });

  it("answers 304 for lists, weak tags, * and If-Modified-Since", async () => {
    const first = await run(staticMw, http.createResponseContext().setStatus(404));
    const etag = String(first.headers["etag"]);
    const lastModified = String(first.headers["last-modified"]);

    for (const headers of [
      { "if-none-match": `"zzz", ${etag}` },
      { "if-none-match": `W/${etag}` },
      { "if-none-match": "*" },
      { "if-modified-since": lastModified },
    ]) {
      expect((await run(staticMw, http.createResponseContext(), headers)).status).toBe(304);
    }
  });
});
