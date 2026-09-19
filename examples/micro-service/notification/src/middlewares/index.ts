import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Simple request logging middleware.
 */
export function requestLogger(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const start = Date.now();
  const method = req.method;
  const url = req.url;

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${method} ${url} ${res.statusCode} ${duration}ms`);
  });

  next();
}

/**
 * Simple JSON body parser middleware.
 */
export function jsonBodyParser(
  req: IncomingMessage,
  _res: ServerResponse,
  next: () => void,
): void {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const contentType = req.headers["content-type"];
    if (contentType?.includes("application/json")) {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          (req as IncomingMessage & { body?: unknown }).body = raw
            ? JSON.parse(raw)
            : {};
        } catch {
          (req as IncomingMessage & { body?: unknown }).body = {};
        }
        next();
      });
      return;
    }
  }
  next();
}
