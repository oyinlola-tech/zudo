/**
 * zudojs-cli — `zudojs add queue`: an in-process job queue (@zudojs/queue)
 * with an example processor; closed (draining in-flight jobs) on stop.
 */

import { zudojsDependencies } from "../../../constants/index.js";
import type { AppRecipe } from "../../recipe.type.js";

const source = (): string => `import { createInMemoryQueue, createQueueName } from "@zudojs/queue";

import type { Integration } from "./integration.js";

/** Payload of the jobs this app queues. */
export type JobData = Readonly<Record<string, unknown>>;

type JobQueue = ReturnType<typeof createInMemoryQueue<JobData>>;

let queue: JobQueue | undefined;

/** The job queue. Throws before the runtime has started. */
export function jobs(): JobQueue {
  if (queue === undefined) {
    throw new Error("The job queue is not running: start the runtime first.");
  }
  return queue;
}

export const queueIntegration: Integration = {
  name: "queue",

  async start({ config, logger }) {
    queue = createInMemoryQueue<JobData>(createQueueName("jobs"), {
      concurrency: config.queue.concurrency,
      logger: {
        info: (message, data) => logger.info(message, data),
        error: (message, data) => logger.error(message, data),
      },
    });
    // Example processor: add yours, then queue work with jobs().add("log", { ... }).
    queue.process("log", async (job) => {
      logger.info("Processed job", { id: job.id });
    });
  },

  async stop() {
    await queue?.close();
    queue = undefined;
  },

  async health() {
    return queue !== undefined;
  },
};
`;

export const queueRecipe: AppRecipe = {
  scope: "app",
  feature: "queue",
  summary: "In-process job queue (src/integrations/queue.ts)",
  dependencies: zudojsDependencies(["@zudojs/queue"]),
  env: () => [{ name: "QUEUE_CONCURRENCY", value: "5" }],
  configSection: `queue: Object.freeze({ concurrency: int(config, "queue_concurrency", 5) }),`,
  integration: { file: "queue.ts", exportName: "queueIntegration", source },
};
