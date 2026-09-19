import type { IncomingMessage, ServerResponse } from "node:http";
import { createServiceClient } from "../services/index.js";
import { serviceConfigs } from "../config/index.js";
import {
  createAssessmentSchema,
  createSubmissionSchema,
} from "../validators/index.js";

const client = createServiceClient(serviceConfigs["assessment"]);

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
 * Proxies assessment creation to the assessment service.
 */
export async function createAssessment(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await parseBody(req);
  const validation = createAssessmentSchema.safeParse(body);

  if (!validation.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: validation.error.flatten(),
    });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const result = await client.post("/api/v1/assessments", validation.data, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies assessment listing to the assessment service.
 */
export async function listAssessments(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const authHeader = req.headers["authorization"] ?? "";

  const result = await client.get(`/api/v1/assessments${url.search}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies get assessment by ID to the assessment service.
 */
export async function getAssessmentById(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const assessmentId = pathParts[pathParts.length - 1];
  const authHeader = req.headers["authorization"] ?? "";

  if (!assessmentId) {
    jsonResponse(res, 400, { error: "Assessment ID is required" });
    return;
  }

  const result = await client.get(`/api/v1/assessments/${assessmentId}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies submission creation to the assessment service.
 */
export async function createSubmission(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await parseBody(req);
  const validation = createSubmissionSchema.safeParse(body);

  if (!validation.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: validation.error.flatten(),
    });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const result = await client.post("/api/v1/submissions", validation.data, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies submission listing to the assessment service.
 */
export async function listSubmissions(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const authHeader = req.headers["authorization"] ?? "";

  const result = await client.get(`/api/v1/submissions${url.search}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies submission grading to the assessment service.
 */
export async function gradeSubmission(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const submissionId = pathParts[pathParts.length - 2]; // Before "grade"
  const authHeader = req.headers["authorization"] ?? "";

  if (!submissionId) {
    jsonResponse(res, 400, { error: "Submission ID is required" });
    return;
  }

  const body = await parseBody(req);

  const result = await client.patch(
    `/api/v1/submissions/${submissionId}/grade`,
    body,
    {
      authorization: authHeader,
    },
  );

  jsonResponse(res, result.status, result.data);
}
