import type { IncomingMessage, ServerResponse } from "node:http";
import { createServiceClient } from "../services/index.js";
import { serviceConfigs } from "../config/index.js";
import { createEnrollmentSchema } from "../validators/index.js";

const client = createServiceClient(serviceConfigs["enrollment"]);

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Proxies enrollment creation to the enrollment service.
 */
export async function createEnrollment(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await parseBody(req);
  const validation = createEnrollmentSchema.safeParse(body);

  if (!validation.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: validation.error.flatten(),
    });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const result = await client.post("/api/v1/enrollments", validation.data, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies enrollment listing to the enrollment service.
 */
export async function listEnrollments(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const authHeader = req.headers["authorization"] ?? "";

  const result = await client.get(`/api/v1/enrollments${url.search}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies get enrollment by ID to the enrollment service.
 */
export async function getEnrollmentById(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const enrollmentId = pathParts[pathParts.length - 1];
  const authHeader = req.headers["authorization"] ?? "";

  if (!enrollmentId) {
    jsonResponse(res, 400, { error: "Enrollment ID is required" });
    return;
  }

  const result = await client.get(`/api/v1/enrollments/${enrollmentId}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies enrollment status update to the enrollment service.
 */
export async function updateEnrollmentStatus(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const enrollmentId = pathParts[pathParts.length - 2]; // Before "status"
  const authHeader = req.headers["authorization"] ?? "";

  if (!enrollmentId) {
    jsonResponse(res, 400, { error: "Enrollment ID is required" });
    return;
  }

  const body = await parseBody(req);

  const result = await client.patch(
    `/api/v1/enrollments/${enrollmentId}/status`,
    body,
    {
      authorization: authHeader,
    },
  );

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies enrollment withdrawal to the enrollment service.
 */
export async function withdrawEnrollment(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const enrollmentId = pathParts[pathParts.length - 2]; // Before "withdraw"
  const authHeader = req.headers["authorization"] ?? "";

  if (!enrollmentId) {
    jsonResponse(res, 400, { error: "Enrollment ID is required" });
    return;
  }

  const result = await client.post(
    `/api/v1/enrollments/${enrollmentId}/withdraw`,
    {},
    {
      authorization: authHeader,
    },
  );

  jsonResponse(res, result.status, result.data);
}
