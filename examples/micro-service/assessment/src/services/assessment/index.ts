import type { EventBus } from "@zudojs/events";
import type { AssessmentRepository } from "../../interfaces/index.js";
import { CreateAssessmentHandler } from "./commands/create-assessment/create-assessment.handler.js";
import { SubmitAssessmentHandler } from "./commands/submit-assessment/submit-assessment.handler.js";
import { PublishResultHandler } from "./commands/publish-result/publish-result.handler.js";
import { GetAssessmentHandler } from "./queries/get-assessment/get-assessment.handler.js";
import { GetAssessmentResultHandler } from "./queries/get-assessment-result/get-assessment-result.handler.js";
import { ListAssessmentResultsHandler } from "./queries/list-assessment-results/list-assessment-results.handler.js";

export interface AssessmentServiceHandlers {
  readonly createAssessment: CreateAssessmentHandler;
  readonly submitAssessment: SubmitAssessmentHandler;
  readonly publishResult: PublishResultHandler;
  readonly getAssessment: GetAssessmentHandler;
  readonly getAssessmentResult: GetAssessmentResultHandler;
  readonly listAssessmentResults: ListAssessmentResultsHandler;
}

export function registerAssessmentService(
  repository: AssessmentRepository,
  eventBus: EventBus,
): AssessmentServiceHandlers {
  const publishEvent = async (event: {
    readonly type: string;
    readonly payload: unknown;
  }) => {
    await eventBus.publish(event as any);
  };

  const createAssessment = new CreateAssessmentHandler(
    repository,
    publishEvent,
  );
  const submitAssessment = new SubmitAssessmentHandler(
    repository,
    publishEvent,
  );
  const publishResult = new PublishResultHandler(repository, publishEvent);
  const getAssessment = new GetAssessmentHandler(repository);
  const getAssessmentResult = new GetAssessmentResultHandler(repository);
  const listAssessmentResults = new ListAssessmentResultsHandler(repository);

  return {
    createAssessment,
    submitAssessment,
    publishResult,
    getAssessment,
    getAssessmentResult,
    listAssessmentResults,
  };
}
