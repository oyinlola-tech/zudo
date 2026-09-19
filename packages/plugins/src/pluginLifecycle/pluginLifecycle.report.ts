import type { PluginLogger } from "../pluginTypes/pluginContext.type.js";

/**
 * Reports a plugin failure that has no caller left to throw to.
 *
 * Goes through the supplied logger when there is one, so the failure is
 * structured and redacted like every other log line. Without a logger
 * it is raised as a process warning (`ZudoPluginWarning`) rather than
 * written with `console.error`.
 *
 * @param logger - The plugin context's (or manager's) logger, if any.
 * @param message - What failed.
 * @param error - The underlying error.
 * @param fields - Extra structured context.
 */
export function reportPluginFailure(
  logger: PluginLogger | undefined,
  message: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  const detail = error instanceof Error ? error.message : String(error);

  if (logger) {
    try {
      logger.error(message, { ...fields, error: detail });
      return;
    } catch {
      // A throwing logger falls through to the process warning.
    }
  }

  const emit = (
    globalThis as {
      process?: { emitWarning?: (w: string, o: object) => void };
    }
  ).process?.emitWarning;

  emit?.(`[@zudojs/plugins] ${message}`, {
    type: "ZudoPluginWarning",
    detail,
  });
}
