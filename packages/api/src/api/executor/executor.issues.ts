import type { APISchemaIssue } from "../schema/index.js";

import { MAX_VALIDATION_ISSUE_LENGTH } from "../constants.js";

/**
 * Truncates `value` to at most `max` characters, marking the cut with `…`.
 */
export function truncate(value: string, max: number): string {
  const text = typeof value === "string" ? value : String(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Renders a Standard Schema issue path as a dotted string. Path segments
 * are field names, never submitted values, so they are safe to expose.
 */
export function formatIssuePath(issue: APISchemaIssue): string {
  const path = issue.path;
  if (path === undefined || path.length === 0) {
    return "(root)";
  }

  return path
    .map((segment) => {
      const key =
        typeof segment === "object" && segment !== null && "key" in segment
          ? segment.key
          : segment;
      return truncate(String(key), 64);
    })
    .join(".");
}

/**
 * Converts schema issues into the capped, redacted list carried on the
 * client-facing `APIValidationError`.
 *
 * With `exposeMessages` off (the default), each entry names only the
 * failing path (`"user.email: invalid"`), never the submitted value.
 */
export function toClientIssues(
  issues: ReadonlyArray<APISchemaIssue>,
  limit: number,
  exposeMessages: boolean,
): readonly string[] {
  const shown = issues
    .slice(0, limit)
    .map((issue) =>
      exposeMessages
        ? truncate(issue.message, MAX_VALIDATION_ISSUE_LENGTH)
        : `${formatIssuePath(issue)}: invalid`,
    );

  const omitted = issues.length - shown.length;
  if (omitted > 0) {
    shown.push(`… and ${omitted} more issue(s) omitted.`);
  }

  return shown;
}
