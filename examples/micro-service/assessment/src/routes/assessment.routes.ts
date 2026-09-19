import type { AssessmentServiceHandlers } from "../services/index.js";
import { jsonResponse, errorResponse } from "../utils/index.js";
import { CreateAssessmentCommand } from "../services/assessment/commands/create-assessment/create-assessment.command.js";
import { SubmitAssessmentCommand } from "../services/assessment/commands/submit-assessment/submit-assessment.command.js";
import { PublishResultCommand } from "../services/assessment/commands/publish-result/publish-result.command.js";
import { GetAssessmentQuery } from "../services/assessment/queries/get-assessment/get-assessment.query.js";
import { GetAssessmentResultQuery } from "../services/assessment/queries/get-assessment-result/get-assessment-result.query.js";
import { ListAssessmentResultsQuery } from "../services/assessment/queries/list-assessment-results/list-assessment-results.query.js";
import {
  validateCreateAssessment,
  validateSubmitAssessment,
  validatePublishResult,
} from "../validators/index.js";

export function createAssessmentRoutes(handlers: AssessmentServiceHandlers) {
  return async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (method === "POST" && path === "/assessments") {
        const body = (await request.json()) as {
          courseId: string;
          title: string;
          type: string;
          totalPoints: number;
          durationMinutes?: number | null;
        };
        const errors = validateCreateAssessment(body);
        if (errors.length > 0) {
          return jsonResponse({ errors }, 400);
        }
        const command = new CreateAssessmentCommand(body);
        const result = await handlers.createAssessment.execute(command);
        return jsonResponse(result, 201);
      }

      if (
        method === "GET" &&
        path.startsWith("/assessments/") &&
        !path.includes("/submissions")
      ) {
        const id = path.split("/assessments/")[1];
        if (!id) return errorResponse("Invalid assessment id", 400);
        const query = new GetAssessmentQuery(id);
        const result = await handlers.getAssessment.execute(query);
        return jsonResponse(result);
      }

      if (method === "POST" && path === "/submissions") {
        const body = (await request.json()) as {
          assessmentId: string;
          studentId: string;
          answers: string;
        };
        const errors = validateSubmitAssessment(body);
        if (errors.length > 0) {
          return jsonResponse({ errors }, 400);
        }
        const command = new SubmitAssessmentCommand(body);
        const result = await handlers.submitAssessment.execute(command);
        return jsonResponse(result, 201);
      }

      if (
        method === "GET" &&
        path.startsWith("/submissions/") &&
        path.endsWith("/result")
      ) {
        const id = path.split("/submissions/")[1]?.split("/result")[0];
        if (!id) return errorResponse("Invalid submission id", 400);
        const query = new GetAssessmentResultQuery(id);
        const result = await handlers.getAssessmentResult.execute(query);
        return jsonResponse(result);
      }

      if (
        method === "GET" &&
        path.startsWith("/assessments/") &&
        path.endsWith("/results")
      ) {
        const id = path.split("/assessments/")[1]?.split("/results")[0];
        if (!id) return errorResponse("Invalid assessment id", 400);
        const query = new ListAssessmentResultsQuery(id);
        const result = await handlers.listAssessmentResults.execute(query);
        return jsonResponse(result);
      }

      if (method === "POST" && path === "/results/publish") {
        const body = (await request.json()) as {
          submissionId: string;
          score: number;
        };
        const errors = validatePublishResult(body);
        if (errors.length > 0) {
          return jsonResponse({ errors }, 400);
        }
        const command = new PublishResultCommand(body);
        const result = await handlers.publishResult.execute(command);
        return jsonResponse(result);
      }

      return errorResponse("Not Found", 404);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal Server Error";
      const status = (error as any)?.statusCode ?? 500;
      return errorResponse(message, status);
    }
  };
}
