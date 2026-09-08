/**
 * Static file serving middleware.
 *
 * @module httpMiddleware/builtin/static
 */

import type {
  HttpMiddleware,
  HttpMiddlewareContext,
} from "../../httpMiddleware.type.js";

import type { HttpResponseContext as ResponseContext } from "../../../httpResponse/httpResponse.context.js";

import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, resolve, sep } from "node:path";

export interface StaticMiddlewareOptions {
  readonly root: string;
  readonly index?: string | string[];
  readonly maxAge?: number;
  readonly immutable?: boolean;
  readonly hidden?: boolean;
  readonly extensions?: string[];
  readonly fallback?: string;

  /**
   * Maximum file size, in bytes, that will be read into memory and served.
   * Defaults to 10 MiB.
   */
  readonly maxFileSize?: number;
}

const DEFAULT_INDEX = "index.html";
const DEFAULT_MAX_AGE = 3600;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
};

function getContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function generateETag(data: Buffer): string {
  return `"${createHash("md5").update(data).digest("hex")}"`;
}

/**
 * Decodes a request pathname without letting a traversal payload through.
 *
 * `new URL()` does not decode `%2e`, so `/%2e%2e/%2e%2e/etc/passwd` reaches
 * this function intact and only becomes `../../etc/passwd` once decoded —
 * after which `path.join` happily resolves it outside the root. Decoding per
 * segment and rejecting `.`/`..` closes that before any path is built.
 *
 * @returns The decoded pathname, or `undefined` if it must not be served.
 */
function decodePathname(pathname: string): string | undefined {
  const parts = pathname.split("/");

  const decoded: string[] = [];

  for (const part of parts) {
    let value: string;

    try {
      value = decodeURIComponent(part);
    } catch {
      /* Malformed percent-encoding. */
      return undefined;
    }

    if (value === "." || value === "..") {
      return undefined;
    }

    if (
      value.includes("/") ||
      value.includes("\\") ||
      value.includes("\u0000")
    ) {
      return undefined;
    }

    decoded.push(value);
  }

  return decoded.join("/");
}

/**
 * Resolves a candidate path and confirms it stays inside the served root.
 *
 * This is the containment check, and it is deliberately independent of the
 * dotfile filter: relying on `pathname.includes("/.")` to stop `/..` is
 * accidental, and it is switched off entirely by `hidden: true`.
 *
 * @returns The resolved absolute path, or `undefined` if it escapes the root.
 */
function containedPath(
  resolvedRoot: string,
  candidate: string,
): string | undefined {
  const resolved = resolve(candidate);

  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${sep}`)
  ) {
    return undefined;
  }

  return resolved;
}

export function createStaticMiddleware(
  options: StaticMiddlewareOptions,
): HttpMiddleware {
  const root = options.root;
  const resolvedRoot = resolve(root);
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  /**
   * Reads a candidate path, but only if it is inside the root and within the
   * size cap.
   */
  const readContained = async (
    candidate: string,
  ): Promise<{ path: string; data: Buffer; mtime: Date } | undefined> => {
    const resolved = containedPath(resolvedRoot, candidate);

    if (resolved === undefined) {
      return undefined;
    }

    try {
      const stats = await stat(resolved);

      if (!stats.isFile() || stats.size > maxFileSize) {
        return undefined;
      }

      return {
        path: resolved,
        data: await readFile(resolved),
        mtime: stats.mtime,
      };
    } catch {
      return undefined;
    }
  };
  const indexFiles = Array.isArray(options.index)
    ? options.index
    : [options.index ?? DEFAULT_INDEX];
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
  const immutable = options.immutable ?? false;
  const hidden = options.hidden ?? false;
  const extensions = options.extensions ?? [];
  const fallback = options.fallback;

  return async (
    context: HttpMiddlewareContext,
    next: () => Promise<ResponseContext>,
  ) => {
    const method = (
      context.request as unknown as { method?: string }
    ).method?.toUpperCase();

    if (method !== undefined && method !== "GET" && method !== "HEAD") {
      return next();
    }

    const url = new URL(context.request.url);

    const decodedPathname = decodePathname(url.pathname);

    if (decodedPathname === undefined) {
      return next();
    }

    let pathname = decodedPathname;

    if (pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }

    if (!hidden && pathname.includes("/.")) {
      return next();
    }

    const filePaths = [
      join(root, pathname),
      ...extensions.map((ext) => join(root, `${pathname}.${ext}`)),
    ];

    let found: { path: string; data: Buffer; mtime: Date } | undefined;

    for (const candidate of filePaths) {
      found = await readContained(candidate);

      if (found) {
        break;
      }
    }

    if (!found) {
      for (const indexFile of indexFiles) {
        found = await readContained(join(root, `${pathname}/${indexFile}`));

        if (found) {
          break;
        }
      }
    }

    if (!found && fallback) {
      found = await readContained(join(root, fallback));
    }

    if (!found) {
      return next();
    }

    const filePath = found.path;
    const fileData = found.data;

    const etag = generateETag(fileData);
    const lastModified = found.mtime.toUTCString();
    const contentType = getContentType(filePath);
    const cacheControl = immutable
      ? `public, max-age=${maxAge}, immutable`
      : `public, max-age=${maxAge}`;

    const responseHeaders = new Headers(
      context.response.headers as Record<string, string>,
    );
    responseHeaders.set("content-type", contentType);
    responseHeaders.set("etag", etag);
    responseHeaders.set("last-modified", lastModified);
    responseHeaders.set("cache-control", cacheControl);
    /*
     * `Accept-Ranges: bytes` is deliberately NOT set: this middleware always
     * returns the whole body and has no 206 path, so advertising range
     * support makes range-aware clients misbehave.
     */

    const ifNoneMatch = context.request.headers["if-none-match"];
    if (ifNoneMatch === etag) {
      return {
        ...context.response,
        status: 304,
        headers: responseHeaders,
      } as unknown as ResponseContext;
    }

    return {
      ...context.response,
      body: fileData,
      headers: responseHeaders,
    } as unknown as ResponseContext;
  };
}
