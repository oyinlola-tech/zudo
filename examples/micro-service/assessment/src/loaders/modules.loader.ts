import type { EventBus } from "@zudojs/events";
import type { AssessmentRepository } from "../interfaces/index.js";
import { registerAssessmentService } from "../services/index.js";
import { createAssessmentRoutes } from "../routes/index.js";

export interface ModulesLoaderResult {
  readonly handler: (request: Request) => Promise<Response>;
}

export function loadModules(
  repository: AssessmentRepository,
  eventBus: EventBus,
): ModulesLoaderResult {
  const handlers = registerAssessmentService(repository, eventBus);
  const handler = createAssessmentRoutes(handlers);

  return { handler };
}
