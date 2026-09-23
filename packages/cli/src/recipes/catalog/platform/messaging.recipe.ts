/**
 * zudojs-cli — `zudojs add messaging`: an in-process message bus
 * (@zudojs/messaging), disposed on stop.
 */

import { zudojsDependencies } from "../../../constants/index.js";
import type { AppRecipe } from "../../recipe.type.js";

const source = (): string => `import { createMessageBus } from "@zudojs/messaging";

import type { Integration } from "./integration.js";

type MessageBus = ReturnType<typeof createMessageBus>;

let bus: MessageBus | undefined;

/** The message bus. Throws before the runtime has started. */
export function messages(): MessageBus {
  if (bus === undefined) {
    throw new Error("The message bus is not running: start the runtime first.");
  }
  return bus;
}

export const messagingIntegration: Integration = {
  name: "messaging",

  async start() {
    bus = createMessageBus();
  },

  async stop() {
    bus?.dispose();
    bus = undefined;
  },

  async health() {
    return bus !== undefined;
  },
};
`;

export const messagingRecipe: AppRecipe = {
  scope: "app",
  feature: "messaging",
  summary: "In-process message bus (src/integrations/messaging.ts)",
  dependencies: zudojsDependencies(["@zudojs/messaging"]),
  integration: { file: "messaging.ts", exportName: "messagingIntegration", source },
};
