/**
 * Schema recognition and validation for operation `input` / `output`.
 *
 * Two contracts are recognised structurally, so the package depends on no
 * particular validation library:
 *
 * 1. Standard Schema (https://standardschema.dev): a `"~standard"` object
 *    with a `validate` function (Zod, Valibot, ArkType, …).
 * 2. A `safeParse` schema returning `{ success, data }` /
 *    `{ success: false, issues }` (`@zudojs/schema`) or
 *    `{ success: false, error: { issues } }` (Zod-style).
 *
 * Anything else is *unrecognised*. The executor fails closed on an
 * unrecognised schema rather than treating it as documentation, because a
 * schema that is silently skipped validates nothing.
 */

type IssuePathSegment = PropertyKey | { readonly key: PropertyKey };

/** A validation issue normalised from either supported contract. */
export interface APISchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<IssuePathSegment>;
}

/** Normalised validation outcome. */
export type APISchemaResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: ReadonlyArray<APISchemaIssue> };

interface StandardSchemaLike {
  readonly "~standard": { validate(value: unknown): unknown };
}

interface SafeParseSchemaLike {
  safeParse(value: unknown): unknown;
}

function isStandardSchema(value: unknown): value is StandardSchemaLike {
  if (typeof value !== "object" && typeof value !== "function") return false;
  if (value === null) return false;
  const standard = (value as { "~standard"?: { validate?: unknown } })[
    "~standard"
  ];
  return typeof standard?.validate === "function";
}

function isSafeParseSchema(value: unknown): value is SafeParseSchemaLike {
  if (typeof value !== "object" && typeof value !== "function") return false;
  if (value === null) return false;
  return typeof (value as { safeParse?: unknown }).safeParse === "function";
}

/**
 * Whether `value` is a schema the executor can validate against.
 *
 * `undefined` (no schema declared) is not a schema; callers treat it as
 * "nothing to validate" and must reject every other unrecognised value.
 */
export function isAPISchema(value: unknown): boolean {
  return isStandardSchema(value) || isSafeParseSchema(value);
}

/**
 * Throws when `schema` is declared but is not a recognised schema.
 *
 * @throws {TypeError} naming the operation and the offending field.
 */
export function assertAPISchema(
  schema: unknown,
  field: "input" | "output",
  operationName: string,
): void {
  if (schema === undefined || isAPISchema(schema)) return;
  throw new TypeError(
    `Operation "${operationName}" declares an ${field} schema that is neither a Standard Schema ("~standard".validate) nor a safeParse schema; refusing to run it unvalidated.`,
  );
}

const MALFORMED = "Schema returned a result in an unrecognised shape.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toIssues(raw: unknown): ReadonlyArray<APISchemaIssue> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ message: "Validation failed without a recorded issue." }];
  }
  return raw.map((issue: unknown) => {
    const record = isRecord(issue) ? issue : {};
    const path = Array.isArray(record["path"])
      ? (record["path"] as ReadonlyArray<IssuePathSegment>)
      : undefined;
    const message =
      typeof record["message"] === "string" ? record["message"] : "invalid";
    return path === undefined ? { message } : { message, path };
  });
}

function fromStandard(result: unknown): APISchemaResult {
  if (!isRecord(result)) throw new TypeError(MALFORMED);
  const issues = result["issues"];
  if (Array.isArray(issues) && issues.length > 0) {
    return { ok: false, issues: toIssues(issues) };
  }
  if (!("value" in result)) throw new TypeError(MALFORMED);
  return { ok: true, value: result["value"] };
}

function fromSafeParse(result: unknown): APISchemaResult {
  if (!isRecord(result)) throw new TypeError(MALFORMED);
  if (result["success"] === true) {
    return { ok: true, value: result["data"] };
  }
  if (result["success"] === false) {
    const error = result["error"];
    const issues =
      result["issues"] ?? (isRecord(error) ? error["issues"] : undefined);
    return { ok: false, issues: toIssues(issues) };
  }
  throw new TypeError(MALFORMED);
}

/**
 * Validates `value` against a recognised schema.
 *
 * Fails closed: an unrecognised schema, or a result in an unexpected
 * shape, throws rather than letting the value through.
 *
 * @throws {TypeError} for an unrecognised schema or malformed result.
 */
export async function validateWithSchema(
  schema: unknown,
  value: unknown,
): Promise<APISchemaResult> {
  if (isStandardSchema(schema)) {
    return fromStandard(await schema["~standard"].validate(value));
  }
  if (isSafeParseSchema(schema)) {
    return fromSafeParse(await schema.safeParse(value));
  }
  throw new TypeError("Unrecognised schema: refusing to validate.");
}
