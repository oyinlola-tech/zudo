import { assessmentConfig } from "./config/app.config.js";
import { createAssessmentDatabase } from "./databases/assessment.database.js";
import { loadModules } from "./loaders/index.js";

export async function createApp(): Promise<
  (request: Request) => Promise<Response>
> {
  const repository = createAssessmentDatabase();
  const eventBus = {
    publish: async (event: unknown) => {
      console.log("[EventBus] Published:", (event as { type: string }).type);
    },
  } as any;

  const { handler } = loadModules(repository, eventBus);

  return handler;
}
