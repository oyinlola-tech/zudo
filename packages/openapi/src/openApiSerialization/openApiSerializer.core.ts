import type { OpenAPIDocument } from "../openApiTypes/openApiTypes.core.js";
import { OpenAPISerializationError } from "../openApiErrors/openApiError.types.js";

/**
 * Serializes an OpenAPI document to a JSON string.
 */
export function toOpenAPIJSON(
  document: OpenAPIDocument,
  options?: { readonly indent?: number },
): string {
  try {
    return JSON.stringify(document, null, options?.indent ?? 2);
  } catch (error) {
    throw new OpenAPISerializationError(
      `Failed to serialize the OpenAPI document to JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

/* ── YAML ──────────────────────────────────────────────────────────────── */

/**
 * Strings that must be quoted because bare YAML would read them as something
 * else: the booleans and null forms YAML 1.1 recognises, plus the empty
 * string.
 */
const YAML_RESERVED = new Set([
  "",
  "true",
  "false",
  "yes",
  "no",
  "on",
  "off",
  "null",
  "~",
  "y",
  "n",
]);

/** A bare (unquoted) YAML scalar may not start with these. */
const YAML_UNSAFE_START = /^[-?:,[\]{}#&*!|>'"%@`\s]/;
const YAML_UNSAFE_ANYWHERE = /[:#\n\r\t]|: |\s#/;
const YAML_NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

function quoteYamlString(value: string): string {
  // Double quotes with JSON escaping is always valid YAML and needs no
  // decision about block scalars or line folding.
  return JSON.stringify(value);
}

function yamlScalar(value: string): string {
  if (
    YAML_RESERVED.has(value.toLowerCase()) ||
    YAML_UNSAFE_START.test(value) ||
    YAML_UNSAFE_ANYWHERE.test(value) ||
    YAML_NUMERIC.test(value) ||
    value !== value.trim()
  ) {
    return quoteYamlString(value);
  }
  return value;
}

function yamlKey(key: string): string {
  return yamlScalar(key);
}

function isEmptyContainer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && value !== null) {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

function toYaml(value: unknown, indent: number, seen: WeakSet<object>): string {
  const pad = "  ".repeat(indent);

  if (value === null) return "null";
  if (value === undefined) return "null";

  switch (typeof value) {
    case "string":
      return yamlScalar(value);
    case "number":
      return Number.isFinite(value) ? String(value) : ".nan";
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      return value.toString();
    default:
      break;
  }

  if (typeof value !== "object") {
    return quoteYamlString(String(value));
  }

  const container = value as object;
  if (seen.has(container)) {
    throw new OpenAPISerializationError(
      "Failed to serialize the OpenAPI document to YAML: the document contains a cycle.",
    );
  }
  seen.add(container);

  try {
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      return value
        .map((entry) => {
          const rendered = toYaml(entry, indent + 1, seen);
          if (
            typeof entry === "object" &&
            entry !== null &&
            !isEmptyContainer(entry)
          ) {
            // Nested block: put the first line beside the dash.
            return `${pad}- ${rendered.slice((indent + 1) * 2)}`;
          }
          return `${pad}- ${rendered}`;
        })
        .join("\n");
    }

    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) => entry !== undefined,
    );
    if (entries.length === 0) return "{}";

    return entries
      .map(([key, entry]) => {
        const renderedKey = `${pad}${yamlKey(key)}:`;
        if (entry === null) return `${renderedKey} null`;
        if (typeof entry !== "object") {
          return `${renderedKey} ${toYaml(entry, indent + 1, seen)}`;
        }
        if (isEmptyContainer(entry)) {
          return `${renderedKey} ${Array.isArray(entry) ? "[]" : "{}"}`;
        }
        return `${renderedKey}\n${toYaml(entry, indent + 1, seen)}`;
      })
      .join("\n");
  } finally {
    seen.delete(container);
  }
}

/**
 * Serializes an OpenAPI document to a YAML string.
 *
 * A real YAML encoder, not JSON under a different name: an OpenAPI document
 * is plain data — maps, arrays and scalars — which is exactly the subset of
 * YAML that can be emitted correctly without a full library. Strings that
 * YAML would reinterpret (`true`, `null`, `1.0`, anything starting with a
 * reserved character) are quoted.
 */
export function toOpenAPIYAML(document: OpenAPIDocument): string {
  try {
    return `${toYaml(document, 0, new WeakSet())}\n`;
  } catch (error) {
    if (error instanceof OpenAPISerializationError) throw error;
    throw new OpenAPISerializationError(
      `Failed to serialize the OpenAPI document to YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}
