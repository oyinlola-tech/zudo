/**
 * Public projection of validation issues.
 *
 * @module httpAdapter/errorResponse/issues
 */

/**
 * Reduces validation issues to the fields a client may see: where
 * (`path` / `field`), what (`code`) and why (`message`). Submitted values
 * (`value`, `received`, `input`) are never echoed.
 */
export function publicIssues(
  value: unknown,
): readonly Record<string, unknown>[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const issues: Record<string, unknown>[] = [];

  for (const entry of value) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }

    const issue = entry as Record<string, unknown>;

    const safe: Record<string, unknown> = {};

    if (Array.isArray(issue.path)) {
      safe.path = issue.path.filter(
        (part) => typeof part === "string" || typeof part === "number",
      );
    }

    if (typeof issue.field === "string") {
      safe.field = issue.field;
    }

    if (typeof issue.code === "string") {
      safe.code = issue.code;
    }

    if (typeof issue.message === "string") {
      safe.message = issue.message;
    }

    issues.push(safe);
  }

  return issues.length > 0 ? issues : undefined;
}
