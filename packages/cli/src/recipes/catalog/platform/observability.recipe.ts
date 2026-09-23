/**
 * zudojs-cli — `zudojs add observability`: logger, metrics and tracer
 * (@zudojs/observability), flushed and shut down on stop. Console
 * exporters are on outside production.
 */

import { zudojsDependencies } from "../../../constants/index.js";
import type { AppRecipe } from "../../recipe.type.js";

const source = (): string => `import { createObservability } from "@zudojs/observability";

import type { Integration } from "./integration.js";

type Observability = ReturnType<typeof createObservability>;

let instance: Observability | undefined;

/** Logger, metrics and tracer. Throws before the runtime has started. */
export function observability(): Observability {
  if (instance === undefined) {
    throw new Error("Observability is not started: start the runtime first.");
  }
  return instance;
}

export const observabilityIntegration: Integration = {
  name: "observability",

  async start({ config }) {
    instance = createObservability({
      serviceName: config.observability.serviceName,
      environment: config.nodeEnv,
      useConsoleExporters: config.nodeEnv !== "production",
    });
  },

  async stop() {
    await instance?.shutdown();
    instance = undefined;
  },
};
`;

export const observabilityRecipe: AppRecipe = {
  scope: "app",
  feature: "observability",
  summary: "Metrics, tracing and structured logs (src/integrations/observability.ts)",
  dependencies: zudojsDependencies(["@zudojs/observability"]),
  env: (context) => [{ name: "SERVICE_NAME", value: context.projectSlug }],
  configSection: `observability: Object.freeze({ serviceName: text(config, "service_name", "app") }),`,
  integration: { file: "observability.ts", exportName: "observabilityIntegration", source },
};
