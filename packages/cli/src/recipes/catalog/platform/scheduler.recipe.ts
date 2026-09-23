/**
 * zudojs-cli — `zudojs add scheduler`: a cron scheduler (@zudojs/scheduler)
 * with an example job; in-flight jobs are aborted and awaited on stop.
 */

import { zudojsDependencies } from "../../../constants/index.js";
import type { AppRecipe } from "../../recipe.type.js";

const source = (): string => `import { Scheduler } from "@zudojs/scheduler";

import type { Integration } from "./integration.js";

let scheduler: Scheduler | undefined;

/** The scheduler. Throws before the runtime has started. */
export function schedules(): Scheduler {
  if (scheduler === undefined) {
    throw new Error("The scheduler is not running: start the runtime first.");
  }
  return scheduler;
}

export const schedulerIntegration: Integration = {
  name: "scheduler",

  async start({ logger }) {
    scheduler = new Scheduler({
      onError: ({ jobId, error }) => logger.error("Scheduled job failed", { jobId, error }),
    });
    // Example job: replace with yours.
    scheduler.define({
      id: "heartbeat",
      name: "Heartbeat",
      handler: async () => {
        logger.debug("Scheduler heartbeat");
      },
    });
    scheduler.cron("*/5 * * * *", "heartbeat", { timezone: "UTC" });
    scheduler.start();
  },

  async stop() {
    await scheduler?.stop({ timeoutMs: 10_000 });
    scheduler = undefined;
  },

  async health() {
    return scheduler !== undefined;
  },
};
`;

export const schedulerRecipe: AppRecipe = {
  scope: "app",
  feature: "scheduler",
  summary: "Cron scheduler (src/integrations/scheduler.ts)",
  dependencies: zudojsDependencies(["@zudojs/scheduler"]),
  integration: { file: "scheduler.ts", exportName: "schedulerIntegration", source },
};
