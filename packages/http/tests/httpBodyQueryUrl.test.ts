import { describe, it, expect } from "vitest";

import { PassThrough, Readable, Writable } from "node:stream";
import type { IncomingMessage } from "node:http";

import {
  parseQuery,
  parseQueryKey,
  parseQueryString,
  normalizeQueryValue,
  getQuery,
  HTTPQueryLimitError,
} from "../src/httpQuery/http.query.js";

import {
  parseMultipartBuffer,
  parseMultipartParts,
  sanitizeFilename,
  MultipartParseError,
  MultipartLimitError,
} from "../src/httpMultipart/http.multipart.js";

import { parseMultipartBody } from "../src/httpBody/httpBody.formData.js";

import {
  readBody,
  readJSON,
  readForm,
  getContentLength,
} from "../src/httpBody/http.body.js";

import {
  normalizePath,
  sameOrigin,
  sameHostname,
  isLocalhost,
  isPrivateHostLiteral,
  isIPLiteral,
  setQueryParams,
  queryToObject,
} from "../src/httpUrl/http.url.js";

import {
  parseRangeHeader,
  resolveRangeHeader,
} from "../src/httpRange/http.range.js";

import {
  parseCompressionPreferences,
  chooseCompression,
  shouldCompress,
  applyCompressionHeaders,
  negotiateCompression,
} from "../src/httpCompression/http.compression.js";

import { readStream } from "../src/httpStream/httpStream.read.js";
import { consumeStream } from "../src/httpStream/httpStream.consume.js";
import { pipeStreamWithProgress } from "../src/httpStream/httpStream.progress.js";
import { waitForDrain } from "../src/httpStream/httpStream.backpressure.js";
import { getChunkSize, toBuffer } from "../src/httpStream/httpStream.helper.js";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fakeRequest(
  body: Buffer | undefined,
  headers: Record<string, string | string[]> = {},
): IncomingMessage {
  const stream = new PassThrough();

  const request = stream as unknown as IncomingMessage;

  Object.defineProperty(request, "headers", { value: headers });

  if (body !== undefined) {
    process.nextTick(() => {
      stream.end(body);
    });
  }

  return request;
}

function multipartBody(boundary: string, parts: string[]): Buffer {
  return Buffer.from(
    parts.map((part) => `--${boundary}\r\n${part}\r\n`).join("") +
      `--${boundary}--\r\n`,
    "utf8",
  );
}

/* -------------------------------------------------------------------------- */
/* Query — prototype pollution                                                */
/* -------------------------------------------------------------------------- */

describe("parseQuery prototype pollution", () => {
  it("does not let __proto__ reach Object.prototype", () => {
    parseQuery("__proto__[polluted]=owned");

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("does not pollute through a nested path", () => {
    parseQuery("a[__proto__][x]=1&b[constructor][prototype][y]=2");

    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(({} as Record<string, unknown>).y).toBeUndefined();
  });

  it("drops a parameter whose path contains a forbidden segment", () => {
    expect(parseQueryKey("__proto__[polluted]")).toEqual([]);
    expect(parseQueryKey("a[constructor]")).toEqual([]);
    expect(parseQueryKey("a[b]")).toEqual(["a", "b"]);
  });

  it("returns null-prototype containers so lookups cannot inherit", () => {
    const parsed = parseQuery("a=1") as Record<string, unknown>;

    expect(Object.getPrototypeOf(parsed)).toBe(null);
    expect(parsed.constructor).toBeUndefined();
    expect(parsed.toString).toBeUndefined();
  });

  it("keeps parseQueryString free of inherited members", () => {
    const parsed = parseQueryString("a=1");

    expect(Object.getPrototypeOf(parsed)).toBe(null);
    expect(parsed.constructor as unknown).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Query — limits                                                             */
/* -------------------------------------------------------------------------- */

describe("parseQuery limits", () => {
  it("rejects a deeply nested key instead of overflowing the stack", () => {
    const key = `a${"[b]".repeat(20_000)}`;

    const started = Date.now();

    expect(() => parseQuery(`${key}=1`)).toThrow(HTTPQueryLimitError);

    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("rejects too many parameters", () => {
    const query = Array.from({ length: 2000 }, (_, i) => `a${i}=1`).join("&");

    expect(() => parseQuery(query)).toThrow(HTTPQueryLimitError);
  });

  it("rejects an oversized query string", () => {
    expect(() => parseQuery("a=".concat("x".repeat(2 * 1024 * 1024)))).toThrow(
      HTTPQueryLimitError,
    );
  });

  it("rejects an oversized single value", () => {
    expect(() => parseQuery(`a=${"x".repeat(20_000)}`)).toThrow(
      HTTPQueryLimitError,
    );
  });

  it("carries a 414 status code on the limit error", () => {
    try {
      parseQuery(Array.from({ length: 2000 }, (_, i) => `a${i}=1`).join("&"));

      expect.unreachable();
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(414);
    }
  });

  it("honours a caller-supplied depth limit", () => {
    expect(() => parseQuery("a[b][c]=1", { maxDepth: 2 })).toThrow(
      HTTPQueryLimitError,
    );

    expect(parseQuery("a[b]=1", { maxDepth: 2 })).toEqual({ a: { b: 1 } });
  });
});

/* -------------------------------------------------------------------------- */
/* Query — decoding and options                                               */
/* -------------------------------------------------------------------------- */

describe("parseQuery options", () => {
  it("does not throw on malformed percent-encoding", () => {
    expect(() => parseQuery("a=%ZZ")).not.toThrow();
    expect(parseQuery("a=%ZZ")).toEqual({ a: "%ZZ" });
    expect(parseQuery("a=%E0%A4%A")).toEqual({ a: "%E0%A4%A" });
  });

  it("honours decode: false", () => {
    expect(parseQuery("a=%41%42", { decode: false })).toEqual({ a: "%41%42" });
  });

  it("honours plusAsSpace: false", () => {
    expect(parseQuery("a=b+c", { plusAsSpace: false })).toEqual({ a: "b+c" });
    expect(parseQuery("a=b+c")).toEqual({ a: "b c" });
  });

  it("honours commaSeparated", () => {
    expect(parseQuery("a=1,2", { commaSeparated: true })).toEqual({
      a: [1, 2],
    });

    expect(parseQuery("a=1,2")).toEqual({ a: "1,2" });
  });

  it("does not rewrite an identifier that cannot round-trip as a number", () => {
    expect(normalizeQueryValue("99999999999999999999")).toBe(
      "99999999999999999999",
    );

    expect(normalizeQueryValue("42")).toBe(42);
    expect(normalizeQueryValue("0123")).toBe("0123");
  });

  it("reads a query off a request", () => {
    expect(getQuery({ url: "/x?a=1&a=2" } as never)).toEqual({ a: [1, 2] });
  });
});

/* -------------------------------------------------------------------------- */
/* Multipart                                                                  */
/* -------------------------------------------------------------------------- */

describe("multipart parsing", () => {
  const boundary = "----zudo";

  it("does not truncate content that ends in CRLF", () => {
    const body = multipartBody(boundary, [
      'Content-Disposition: form-data; name="f"; filename="a.txt"\r\n' +
        "\r\n" +
        "DATA\r\n",
    ]);

    const result = parseMultipartBuffer(body, boundary);

    const [file] = result.files;

    if (file === undefined) {
      throw new Error("expected the multipart part to be parsed as a file");
    }

    expect(file.data.toString()).toBe("DATA\r\n");
    expect(file.size).toBe(6);
  });

  it("does not let a __proto__ field name touch the result prototype", () => {
    const body = multipartBody(boundary, [
      'Content-Disposition: form-data; name="__proto__"\r\n\r\nv1',
      'Content-Disposition: form-data; name="__proto__"\r\n\r\nv2',
    ]);

    const result = parseMultipartBuffer(body, boundary);

    expect(Object.getPrototypeOf(result.fields)).toBe(null);
    expect(Array.isArray(Object.getPrototypeOf(result.fields))).toBe(false);
    expect(({} as Record<string, unknown>).length).toBeUndefined();
  });

  it("ignores a forged boundary embedded mid-line in content", () => {
    const forged = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="a"\r\n\r\n`,
        "utf8",
      ),
      Buffer.from(
        `X--${boundary}\r\nContent-Disposition: form-data; name="injected"\r\n\r\nevil`,
        "utf8",
      ),
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    const result = parseMultipartBuffer(forged, boundary);

    expect(Object.keys(result.fields)).toEqual(["a"]);
    expect(result.fields.injected).toBeUndefined();
  });

  it("rejects a body whose closing delimiter is missing", () => {
    const truncated = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="a"\r\n\r\nv\r\n`,
      "utf8",
    );

    expect(() => parseMultipartBuffer(truncated, boundary)).toThrow(
      MultipartParseError,
    );
  });

  it("caps the number of parts", () => {
    const parts = Array.from(
      { length: 20 },
      (_, i) => `Content-Disposition: form-data; name="f${i}"\r\n\r\nv`,
    );

    expect(() =>
      parseMultipartParts(multipartBody(boundary, parts), boundary, {
        maxParts: 5,
      }),
    ).toThrow(MultipartLimitError);
  });

  it("caps per-field size", () => {
    const body = multipartBody(boundary, [
      `Content-Disposition: form-data; name="a"\r\n\r\n${"x".repeat(200)}`,
    ]);

    expect(() =>
      parseMultipartBuffer(body, boundary, { maxFieldSize: 10 }),
    ).toThrow(MultipartLimitError);
  });

  it("parses a filename containing a quoted semicolon the same way everywhere", () => {
    const body = multipartBody(boundary, [
      'Content-Disposition: form-data; name="f"; filename="a;b.txt"\r\n\r\nx',
    ]);

    const viaMultipart = parseMultipartBuffer(body, boundary);

    const viaFormData = parseMultipartBody(body, boundary, {});

    const file = viaFormData.get("f") as { filename: string };

    const [multipartFile] = viaMultipart.files;

    if (multipartFile === undefined) {
      throw new Error("expected the multipart part to be parsed as a file");
    }

    expect(multipartFile.filename).toBe("a;b.txt");
    expect(file.filename).toBe("a;b.txt");
  });

  it("decodes an RFC 5987 filename and sanitises the traversal it hides", () => {
    const body = multipartBody(boundary, [
      "Content-Disposition: form-data; name=\"f\"; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd\r\n\r\nx",
    ]);

    const [file] = parseMultipartBuffer(body, boundary).files;

    if (file === undefined) {
      throw new Error("expected the multipart part to be parsed as a file");
    }

    expect(file.filename).toBe("passwd");
  });

  it("supports bare-LF part headers instead of silently dropping the part", () => {
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="a"\n\nvalue\r\n--${boundary}--\r\n`,
      "utf8",
    );

    expect(parseMultipartBuffer(body, boundary).fields.a).toBe("value");
  });

  it("decodes a field declaring a non-Node charset", () => {
    const value = Buffer.from("héllo", "utf16le");

    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="a"\r\nContent-Type: text/plain; charset=utf-16le\r\n\r\n`,
      "utf8",
    );

    const body = Buffer.concat([
      head,
      value,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    expect(parseMultipartBody(body, boundary, {}).get("a")).toBe("héllo");
  });
});

/* -------------------------------------------------------------------------- */
/* Filename sanitisation                                                      */
/* -------------------------------------------------------------------------- */

describe("sanitizeFilename", () => {
  it("neutralises traversal, drive-relative and control-character names", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..")).toMatch(/^upload-/);
    expect(sanitizeFilename(".")).toMatch(/^upload-/);
    expect(sanitizeFilename("C:evil.txt")).toBe("evil.txt");
    expect(sanitizeFilename("..\\..\\windows\\system32\\cmd.exe")).toBe(
      "cmd.exe",
    );
    expect(sanitizeFilename("a b.txt")).toBe("ab.txt");
    expect(sanitizeFilename("")).toMatch(/^upload-/);
  });

  it("caps the length so it cannot exceed NAME_MAX", () => {
    const sanitized = sanitizeFilename(`${"a".repeat(64 * 1024)}.txt`);

    expect(Buffer.byteLength(sanitized, "utf8")).toBeLessThanOrEqual(255);
  });
});

/* -------------------------------------------------------------------------- */
/* Body reader                                                                */
/* -------------------------------------------------------------------------- */

describe("body reader", () => {
  it("rejects a body shorter than the declared Content-Length", async () => {
    const request = fakeRequest(Buffer.from("short"), {
      "content-length": "1000",
    });

    await expect(readBody({ request })).rejects.toThrow(
      /does not match Content-Length/,
    );
  });

  it("rejects conflicting duplicate Content-Length headers", () => {
    const request = fakeRequest(undefined, {
      "content-length": ["10", "20"],
    });

    expect(() => getContentLength(request)).toThrow(/Conflicting/);
  });

  it("rejects Content-Length together with Transfer-Encoding", () => {
    const request = fakeRequest(undefined, {
      "content-length": "10",
      "transfer-encoding": "chunked",
    });

    expect(() => getContentLength(request)).toThrow(/must not both be present/);
  });

  it("enforces the body limit", async () => {
    const request = fakeRequest(Buffer.alloc(4096));

    await expect(readBody({ request, limit: 128 })).rejects.toThrow();
  });

  it("honours strict JSON parsing", async () => {
    const scalar = fakeRequest(Buffer.from("5"), {
      "content-length": "1",
    });

    await expect(readJSON({ request: scalar, strict: true })).rejects.toThrow(
      /object or an array/,
    );

    const empty = fakeRequest(Buffer.from(""), { "content-length": "0" });

    await expect(readJSON({ request: empty, strict: true })).rejects.toThrow(
      /empty/,
    );

    const object = fakeRequest(Buffer.from('{"a":1}'), {
      "content-length": "7",
    });

    await expect(readJSON({ request: object, strict: true })).resolves.toEqual({
      a: 1,
    });
  });

  it("keeps a __proto__ form field off the prototype", async () => {
    const payload = "__proto__[x]=1&__proto__=2";

    const request = fakeRequest(Buffer.from(payload), {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(payload.length),
    });

    const form = await readForm({ request });

    expect(Object.getPrototypeOf(form)).toBe(null);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* URL                                                                        */
/* -------------------------------------------------------------------------- */

describe("URL helpers", () => {
  it("treats opaque origins as never same-origin", () => {
    expect(sameOrigin("data:text/html,a", "data:text/html,b")).toBe(false);
    expect(sameOrigin("https://a.com/x", "https://a.com/y")).toBe(true);
  });

  it("exposes host equality under an honest name", () => {
    expect(sameHostname("http://a.com", "https://a.com")).toBe(true);
    expect(sameHostname("http://a.com", "http://b.a.com")).toBe(false);
  });

  it("collapses percent-encoded and backslash traversal", () => {
    expect(normalizePath("/a/%2e%2e/%2e%2e/etc/passwd")).toBe("/etc/passwd");
    expect(normalizePath("/a/..\\..\\etc")).toBe("/etc");
    expect(normalizePath("//foo///bar")).toBe("/foo/bar");
  });

  it("recognises every loopback literal form", () => {
    for (const host of [
      "http://127.0.0.1",
      "http://127.0.0.2",
      "http://127.1",
      "http://2130706433",
      "http://0177.0.0.1",
      "http://0x7f.0.0.1",
      "http://0.0.0.0",
      "http://localhost.",
      "http://[::1]",
      "http://[::ffff:127.0.0.1]",
    ]) {
      expect([host, isLocalhost(host)]).toEqual([host, true]);
    }

    expect(isLocalhost("http://example.com")).toBe(false);
    expect(isLocalhost("http://8.8.8.8")).toBe(false);
  });

  it("recognises the private ranges", () => {
    expect(isPrivateHostLiteral("http://10.0.0.5")).toBe(true);
    expect(isPrivateHostLiteral("http://169.254.169.254")).toBe(true);
    expect(isPrivateHostLiteral("http://192.168.1.1")).toBe(true);
    expect(isPrivateHostLiteral("http://[fd00::1]")).toBe(true);
    expect(isPrivateHostLiteral("http://8.8.8.8")).toBe(false);
  });

  it("validates IP literals rather than pattern-matching them", () => {
    expect(isIPLiteral("http://1.2.3.4.5.com")).toBe(false);
    expect(isIPLiteral("http://127.0.0.1")).toBe(true);
    expect(isIPLiteral("http://[2001:db8::1]")).toBe(true);
  });

  it("replaces the whole query without leaving residue", () => {
    expect(
      setQueryParams("https://x.com/?a=1&b=2&c=3&d=4", { z: "9" }).search,
    ).toBe("?z=9");
  });

  it("builds a null-prototype object from a query string", () => {
    const object = queryToObject("https://x.com/?__proto__=1&a=2");

    expect(Object.getPrototypeOf(object)).toBe(null);
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Range                                                                      */
/* -------------------------------------------------------------------------- */

describe("range parsing", () => {
  it("rejects an oversized range list quickly", () => {
    const header = `bytes=${Array.from({ length: 100_000 }, () => "0-1").join(",")}`;

    const started = Date.now();

    expect(parseRangeHeader(header)).toBeUndefined();

    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("coalesces duplicate ranges so a response cannot be amplified", () => {
    const header = `bytes=${Array.from({ length: 128 }, () => "0-0").join(",")}`;

    const resolved = resolveRangeHeader(header, 1024);

    expect(resolved?.ranges).toHaveLength(1);
  });

  it("still rejects inverted and unparseable ranges", () => {
    expect(parseRangeHeader("bytes=10-5")).toBeUndefined();
    expect(parseRangeHeader("bytes=a-b")).toBeUndefined();
    expect(parseRangeHeader("bytes=-")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Compression                                                                */
/* -------------------------------------------------------------------------- */

describe("compression negotiation", () => {
  it("drops unknown codings instead of aliasing them to identity", () => {
    const preferences = parseCompressionPreferences("zstd;q=0.9, gzip;q=0.1");

    expect(preferences.map((p) => p.encoding)).toEqual(["gzip"]);

    /*
     * The old aliasing turned the zstd preference into a high-quality
     * preference for identity, which then beat the client's explicit gzip
     * fallback and returned an uncompressed response.
     */
    expect(
      chooseCompression("zstd;q=0.9, gzip", 5000, "text/html"),
    ).toMatchObject({ encoding: "gzip", compress: true });

    expect(
      chooseCompression("zstd;q=0.9, gzip;q=0.1", 5000, "text/html").quality,
    ).not.toBe(0.9);
  });

  it("treats a wildcard as a wildcard", () => {
    expect(negotiateCompression("*", ["br", "gzip"])).toBe("br");
  });

  it("treats an empty Accept-Encoding as identity-only", () => {
    expect(negotiateCompression("", ["br", "gzip", "identity"])).toBe(
      "identity",
    );

    expect(chooseCompression("", 5000, "text/html")).toMatchObject({
      encoding: "identity",
      compress: false,
    });

    /* An absent header still means "anything is acceptable". */
    expect(negotiateCompression(undefined, ["br", "gzip"])).toBe("br");
  });

  it("only compresses types on the allowlist", () => {
    expect(shouldCompress(5000, "application/pdf")).toBe(false);
    expect(shouldCompress(5000, "font/woff2")).toBe(false);
    expect(shouldCompress(5000, "application/octet-stream")).toBe(false);
    expect(shouldCompress(5000, "text/html")).toBe(true);
    expect(shouldCompress(5000, "application/vnd.api+json")).toBe(true);
  });

  it("sets Vary on identity responses and emits no identity coding", () => {
    const headers = applyCompressionHeaders([], "identity");

    expect(headers.find((h) => h.name.toLowerCase() === "vary")?.value).toBe(
      "Accept-Encoding",
    );

    expect(
      headers.find((h) => h.name.toLowerCase() === "content-encoding"),
    ).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Stream                                                                     */
/* -------------------------------------------------------------------------- */

describe("stream helpers", () => {
  it("caps readStream so an unbounded body cannot exhaust memory", async () => {
    const source = Readable.from(
      (function* generate() {
        for (let index = 0; index < 32; index += 1) {
          yield Buffer.alloc(1024);
        }
      })(),
    );

    await expect(readStream(source, { maxBytes: 4096 })).rejects.toThrow(
      /maximum allowed size/,
    );
  });

  it("destroys the source when the consumer rejects a chunk", async () => {
    const source = new PassThrough();

    process.nextTick(() => {
      source.write(Buffer.from("a"));
      source.write(Buffer.from("b"));
    });

    await expect(
      consumeStream(source, () => {
        throw new Error("rejected");
      }),
    ).rejects.toThrow("rejected");

    expect(source.destroyed).toBe(true);
  });

  it("settles pipeStreamWithProgress when the source is destroyed", async () => {
    const source = new PassThrough();

    const destination = new PassThrough();

    destination.resume();

    const pending = pipeStreamWithProgress(source, destination, () => {});

    process.nextTick(() => {
      source.destroy();
    });

    await expect(pending).rejects.toThrow(/closed before completion/);
  });

  it("settles waitForDrain when the writable is destroyed", async () => {
    const slow = new Writable({
      highWaterMark: 1,
      write() {
        /* never calls the callback: stays backpressured */
      },
    });

    slow.write(Buffer.alloc(64));

    const pending = waitForDrain(slow);

    process.nextTick(() => {
      slow.destroy();
    });

    await expect(pending).rejects.toThrow(/destroyed/);
  });

  it("ends the destination exactly once on a successful pipe", async () => {
    const { pipeStream } = await import("../src/httpStream/httpStream.pipe.js");

    const source = Readable.from([Buffer.from("abc")]);

    const destination = new PassThrough();

    const errors: unknown[] = [];

    destination.on("error", (error) => errors.push(error));

    const chunks: Buffer[] = [];

    destination.on("data", (chunk: Buffer) => chunks.push(chunk));

    const result = await pipeStream(source, destination);

    expect(result.bytes).toBe(3);
    expect(Buffer.concat(chunks).toString()).toBe("abc");
    expect(destination.writableEnded).toBe(true);
    expect(errors).toEqual([]);
  });

  it("rejects object-mode chunks rather than mangling them", () => {
    expect(() => getChunkSize({ a: 1 })).toThrow(TypeError);
    expect(() => toBuffer({ a: 1 })).toThrow(TypeError);
    expect(getChunkSize("abc")).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* Regex hardening                                                            */
/* -------------------------------------------------------------------------- */

describe("parameter regexes stay linear on pathological input", () => {
  it("extracts a boundary from a 64 KB pathological Content-Type in bounded time", async () => {
    const { extractBoundary } =
      await import("../src/httpMultipart/http.multipart.js");

    const pathological = `multipart/form-data;${" ".repeat(64 * 1024)}x`;

    const started = Date.now();

    expect(extractBoundary(pathological)).toBeUndefined();

    expect(Date.now() - started).toBeLessThan(250);
  });

  it("parses a pathological Content-Disposition in bounded time", () => {
    const boundary = "b";

    const disposition = `Content-Disposition: form-data;${"\t".repeat(
      32 * 1024,
    )}name="a"`;

    const body = Buffer.from(
      `--${boundary}\r\n${disposition}\r\n\r\nv\r\n--${boundary}--\r\n`,
      "utf8",
    );

    const started = Date.now();

    expect(parseMultipartBuffer(body, boundary).fields.a).toBe("v");

    expect(Date.now() - started).toBeLessThan(250);
  });

  it("normalizes a query value regex against a long digit string in bounded time", () => {
    const started = Date.now();

    expect(normalizeQueryValue("9".repeat(100_000))).toBe("9".repeat(100_000));

    expect(Date.now() - started).toBeLessThan(250);
  });
});
