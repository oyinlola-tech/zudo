/**
 * zudojs-cli — Command Error Helpers
 *
 * Rendering for errors a command reports to the user.
 */

/** How many `cause` links are followed before the chain is cut off. */
const MAX_CAUSE_DEPTH = 5;

/**
 * Renders an error together with everything it was caused by.
 *
 * Generators wrap failures in a CLIGenerationError whose own message says
 * only what was being attempted — "Failed to write project files:",
 * "Failed to generate service: billing" — and the cause carried the reason
 * (ENOTDIR, EACCES) without anything ever printing it.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth += 1) {
    const message = current.message.replace(/[:\s]+$/, "");
    if (message.length > 0 && !parts.includes(message)) {
      parts.push(message);
    }
    current = (current as { cause?: unknown }).cause;
  }

  return parts.length > 0 ? parts.join(": ") : String(error);
}
