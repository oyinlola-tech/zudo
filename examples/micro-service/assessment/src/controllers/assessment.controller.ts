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

export class AssessmentController {
  private readonly handlers: AssessmentServiceHandlers;

  constructor(handlers: AssessmentServiceHandlers) {
    this.handlers = handlers;
  }

  async createAssessment(body: unknown): Promise<Response> {
    const dto = body as {
      courseId: string;
      title: string;
      type: string;
      totalPoints: number;
      durationMinutes?: number | null;
    };
    const errors = validateCreateAssessment(dto);
    if (errors.length > 0) {
      return jsonResponse({ errors }, 400);
    }
    const command = new CreateAssessmentCommand(dto);
    const result = await this.handlers.createAssessment.execute(command);
    return jsonResponse(result, 201);
  }

  async getAssessment(id: string): Promise<Response> {
    const query = new GetAssessmentQuery(id);
    const result = await this.handlers.getAssessment.execute(query);
    return jsonResponse(result);
  }

  async submitAssessment(body: unknown): Promise<Response> {
    const dto = body as {
      assessmentId: string;
      studentId: string;
      answers: string;
    };
    const errors = validateSubmitAssessment(dto);
    if (errors.length > 0) {
      return jsonResponse({ errors }, 400);
    }
    const command = new SubmitAssessmentCommand(dto);
    const result = await this.handlers.submitAssessment.execute(command);
    return jsonResponse(result, 201);
  }

  async getResult(submissionId: string): Promise<Response> {
    const query = new GetAssessmentResultQuery(submissionId);
    const result = await this.handlers.getAssessmentResult.execute(query);
    return jsonResponse(result);
  }

  async listResults(assessmentId: string): Promise<Response> {
    const query = new ListAssessmentResultsQuery(assessmentId);
    const result = await this.handlers.listAssessmentResults.execute(query);
    return jsonResponse(result);
  }

  async publishResult(body: unknown): Promise<Response> {
    const dto = body as { submissionId: string; score: number };
    const errors = validatePublishResult(dto);
    if (errors.length > 0) {
      return jsonResponse({ errors }, 400);
    }
    const command = new PublishResultCommand(dto);
    const result = await this.handlers.publishResult.execute(command);
    return jsonResponse(result);
  }
}
