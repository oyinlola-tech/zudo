import type { IncomingMessage, ServerResponse } from "node:http";
import { createServiceClient } from "../services/index.js";
import { serviceConfigs } from "../config/index.js";
import {
  createUserSchema,
  updateUserSchema,
  loginUserSchema,
} from "../validators/index.js";

const client = createServiceClient(serviceConfigs["identity"]);

/**
 * Parses the request body as JSON.
 */
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

/**
 * Sends a JSON response.
 */
function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Proxies user creation to the identity service.
 */
export async function createUser(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await parseBody(req);
  const validation = createUserSchema.safeParse(body);

  if (!validation.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: validation.error.flatten(),
    });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const result = await client.post("/api/v1/users", validation.data, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies user listing to the identity service.
 */
export async function listUsers(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const authHeader = req.headers["authorization"] ?? "";

  const result = await client.get(`/api/v1/users${url.search}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies get user by ID to the identity service.
 */
export async function getUserById(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const userId = pathParts[pathParts.length - 1];
  const authHeader = req.headers["authorization"] ?? "";

  if (!userId) {
    jsonResponse(res, 400, { error: "User ID is required" });
    return;
  }

  const result = await client.get(`/api/v1/users/${userId}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies user update to the identity service.
 */
export async function updateUser(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const userId = pathParts[pathParts.length - 1];
  const authHeader = req.headers["authorization"] ?? "";

  if (!userId) {
    jsonResponse(res, 400, { error: "User ID is required" });
    return;
  }

  const body = await parseBody(req);
  const validation = updateUserSchema.safeParse(body);

  if (!validation.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: validation.error.flatten(),
    });
    return;
  }

  const result = await client.patch(
    `/api/v1/users/${userId}`,
    validation.data,
    {
      authorization: authHeader,
    },
  );

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies user deletion to the identity service.
 */
export async function deleteUser(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const userId = pathParts[pathParts.length - 1];
  const authHeader = req.headers["authorization"] ?? "";

  if (!userId) {
    jsonResponse(res, 400, { error: "User ID is required" });
    return;
  }

  const result = await client.delete(`/api/v1/users/${userId}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies user login to the identity service.
 */
export async function loginUser(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await parseBody(req);
  const validation = loginUserSchema.safeParse(body);

  if (!validation.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: validation.error.flatten(),
    });
    return;
  }

  const result = await client.post("/api/v1/auth/login", validation.data);

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies user registration to the identity service.
 */
export async function registerUser(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await parseBody(req);
  const validation = createUserSchema.safeParse(body);

  if (!validation.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: validation.error.flatten(),
    });
    return;
  }

  const result = await client.post("/api/v1/auth/register", validation.data);

  jsonResponse(res, result.status, result.data);
}
