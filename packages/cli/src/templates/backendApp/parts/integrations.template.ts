/**
 * zudojs-cli — Generated `src/integrations/`.
 *
 * An integration is a client with a lifecycle (Redis, a database, a
 * WebSocket server, a mail transport). `integrations/index.ts` lists them
 * between markers; `integration.ts` runs the list as one runtime module,
 * so they start with `runtime.start()` and stop, in reverse, with
 * `runtime.stop()`. `zudojs add <feature>` writes `integrations/<name>.ts`
 * and registers it.
 */

import { MARKERS, renderMarkerBlock } from "../../../wiring/index.js";
import type { MarkerLines } from "./wiring.template.js";

/** Renders `src/integrations/index.ts`. */
export function renderIntegrationsIndex(lines: MarkerLines): string {
  return `import type { Integration } from "./integration.js";
${renderMarkerBlock(MARKERS.integrationImports, lines.imports)}

export {
  IntegrationsModule,
  checkIntegrations,
  drainIntegrations,
  type Integration,
  type IntegrationContext,
} from "./integration.js";

/**
 * Started with the runtime in this order and stopped in reverse.
 * \`zudojs add <feature>\` adds entries between the markers.
 */
export const integrations: readonly Integration[] = [
${renderMarkerBlock(MARKERS.integrations, lines.entries, "  ")}
];
`;
}

/** Renders `src/integrations/integration.ts`. */
export function renderIntegrationContract(): string {
  return `import type { Server } from "node:http";

import { BaseModule, type ModuleContext } from "@zudojs/core";

import type { AppConfig } from "../configs/index.js";

/** What an integration receives when it starts. */
export interface IntegrationContext {
  readonly config: AppConfig;
  readonly logger: ModuleContext["logger"];
  /** The Node HTTP server, for integrations that attach to it (WebSockets). */
  readonly httpServer?: Server;
}

/** A client or server with a lifecycle, started and stopped with the runtime. */
export interface Integration {
  readonly name: string;
  start(context: IntegrationContext): Promise<void>;
  stop(): Promise<void>;
  /** Called when shutdown begins, before HTTP stops: close long-lived connections. */
  drain?(): Promise<void>;
  /** Whether the integration is healthy; reported by /health. */
  health?(): Promise<boolean>;
}

/** Runs the integrations as one runtime module. */
export class IntegrationsModule extends BaseModule {
  public readonly id = "integrations";
  public readonly name = "integrations";
  private readonly started: Integration[] = [];

  public constructor(
    private readonly entries: readonly Integration[],
    private readonly startContext: Omit<IntegrationContext, "logger">,
  ) {
    super({ version: "0.1.0" });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
    for (const integration of this.entries) {
      await integration.start({ ...this.startContext, logger: context.logger });
      this.started.push(integration);
      context.logger.info(\`\${integration.name} started\`);
    }
  }

  public override async onShutdown(context: ModuleContext): Promise<void> {
    for (const integration of [...this.started].reverse()) {
      try {
        await integration.stop();
      } catch (error) {
        context.logger.error(\`\${integration.name} failed to stop\`, { error });
      }
    }
    this.started.length = 0;
  }
}

/** Lets each integration close long-lived connections before HTTP stops. */
export async function drainIntegrations(integrations: readonly Integration[]): Promise<void> {
  for (const integration of integrations) {
    await integration.drain?.().catch(() => undefined);
  }
}

/** Health of every integration that reports one. */
export async function checkIntegrations(
  integrations: readonly Integration[],
): Promise<Record<string, "up" | "down">> {
  const checks: Record<string, "up" | "down"> = {};
  for (const integration of integrations) {
    if (integration.health === undefined) continue;
    const healthy = await integration.health().catch(() => false);
    checks[integration.name] = healthy ? "up" : "down";
  }
  return checks;
}
`;
}
