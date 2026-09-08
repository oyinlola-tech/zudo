import type {
  OpenAPIDocument,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIPathItem,
} from "../openApiTypes/openApiTypes.core.js";
import type { OpenAPIValidationIssue } from "../openApiErrors/openApiError.types.js";
import { OpenAPIValidationError } from "../openApiErrors/openApiError.types.js";
import {
  MAX_OPERATION_ID_LENGTH,
  RESPONSE_KEY_PATTERN,
  SUPPORTED_OPENAPI_VERSIONS,
} from "../openApiConstants/openApiConstants.core.js";
import { extractPathParameters } from "../openApiRouting/routeConverter.core.js";
import { unescapeJsonPointerSegment } from "../openApiSchema/references.core.js";

const OPERATIONS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

/** A path segment that still uses `:name` rather than `{name}`. */
const COLON_SEGMENT = /(^|\/):[^/]+/;

/** The result of validating a document. */
export interface OpenAPIValidationResult {
  readonly valid: boolean;
  readonly errors: readonly OpenAPIValidationIssue[];
  readonly warnings: readonly OpenAPIValidationIssue[];
}

export interface OpenAPIValidator {
  validate(document: OpenAPIDocument): OpenAPIValidationResult;
  assertValid(document: OpenAPIDocument): void;
}

interface Collector {
  readonly errors: OpenAPIValidationIssue[];
  readonly warnings: OpenAPIValidationIssue[];
}

function error(
  collector: Collector,
  path: readonly (string | number)[],
  message: string,
): void {
  collector.errors.push({ path, message, severity: "error" });
}

function warn(
  collector: Collector,
  path: readonly (string | number)[],
  message: string,
): void {
  collector.warnings.push({ path, message, severity: "warning" });
}

export class OpenAPIValidatorImpl implements OpenAPIValidator {
  public validate(document: OpenAPIDocument): OpenAPIValidationResult {
    const collector: Collector = { errors: [], warnings: [] };

    this.validateDocumentStructure(document, collector);
    this.validatePaths(document, collector);
    this.validateOperationIds(document, collector);
    this.validateSecurity(document, collector);
    this.validateReferences(document, collector);

    return {
      valid: collector.errors.length === 0,
      errors: Object.freeze([...collector.errors]),
      warnings: Object.freeze([...collector.warnings]),
    };
  }

  public assertValid(document: OpenAPIDocument): void {
    const result = this.validate(document);
    if (!result.valid) {
      throw new OpenAPIValidationError(
        `OpenAPI validation failed with ${result.errors.length} error${
          result.errors.length === 1 ? "" : "s"
        }.`,
        result.errors,
      );
    }
  }

  private validateDocumentStructure(
    document: OpenAPIDocument,
    collector: Collector,
  ): void {
    if (!document.openapi) {
      error(collector, ["openapi"], "OpenAPI version is required.");
    } else if (
      !(SUPPORTED_OPENAPI_VERSIONS as readonly string[]).includes(
        document.openapi,
      )
    ) {
      error(
        collector,
        ["openapi"],
        `Unsupported OpenAPI version "${document.openapi}". Supported: ${SUPPORTED_OPENAPI_VERSIONS.join(", ")}.`,
      );
    }

    if (!document.info) {
      error(collector, ["info"], "Info object is required.");
    } else {
      if (!document.info.title) {
        error(collector, ["info", "title"], "Info title is required.");
      }
      if (!document.info.version) {
        error(collector, ["info", "version"], "Info version is required.");
      }
    }

    if (!document.paths || Object.keys(document.paths).length === 0) {
      warn(collector, ["paths"], "Document has no paths defined.");
    }

    for (const [index, server] of (document.servers ?? []).entries()) {
      if (!server.url) {
        error(collector, ["servers", index, "url"], "Server url is required.");
      }
    }

    for (const [index, tag] of (document.tags ?? []).entries()) {
      if (!tag.name) {
        error(collector, ["tags", index, "name"], "Tag name is required.");
      }
    }
  }

  private validatePaths(document: OpenAPIDocument, collector: Collector): void {
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      if (!pathItem) continue;

      if (!path.startsWith("/")) {
        error(
          collector,
          ["paths", path],
          `Path "${path}" must start with "/".`,
        );
      }

      // Catches "/users/:id" and "/a/:id/{b}" alike, which a bare
      // `includes(":") && !includes("{")` test misses.
      if (COLON_SEGMENT.test(path)) {
        error(
          collector,
          ["paths", path],
          `Path "${path}" contains un-converted path parameters. Use "/users/{id}" instead of "/users/:id".`,
        );
      }

      const templateParameters = extractPathParameters(path);
      const duplicates = templateParameters.filter(
        (name, index) => templateParameters.indexOf(name) !== index,
      );
      for (const duplicate of duplicates) {
        error(
          collector,
          ["paths", path],
          `Path "${path}" declares the template parameter "{${duplicate}}" more than once.`,
        );
      }

      for (const method of OPERATIONS) {
        const operation = (pathItem as OpenAPIPathItem)[method];
        if (!operation) continue;
        this.validateOperation(
          path,
          method,
          operation,
          pathItem,
          templateParameters,
          collector,
        );
      }
    }
  }

  private validateOperation(
    path: string,
    method: string,
    operation: OpenAPIOperation,
    pathItem: OpenAPIPathItem,
    templateParameters: readonly string[],
    collector: Collector,
  ): void {
    const base = ["paths", path, method] as const;

    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      error(
        collector,
        [...base, "responses"],
        "Every operation must declare at least one response.",
      );
    } else {
      for (const key of Object.keys(operation.responses)) {
        if (!RESPONSE_KEY_PATTERN.test(key)) {
          error(
            collector,
            [...base, "responses", key],
            `Response key "${key}" is not a status code, a range such as "4XX", or "default".`,
          );
        }
        const response = operation.responses[key];
        if (response && typeof response.description !== "string") {
          error(
            collector,
            [...base, "responses", key, "description"],
            "A response must have a description.",
          );
        }
      }
    }

    if (
      operation.operationId &&
      operation.operationId.length > MAX_OPERATION_ID_LENGTH
    ) {
      error(
        collector,
        [...base, "operationId"],
        `operationId "${operation.operationId}" exceeds the maximum length of ${MAX_OPERATION_ID_LENGTH}.`,
      );
    }

    const parameters: readonly OpenAPIParameter[] = [
      ...(pathItem.parameters ?? []),
      ...(operation.parameters ?? []),
    ];

    const seen = new Set<string>();
    for (const parameter of parameters) {
      if (!parameter.name) {
        error(
          collector,
          [...base, "parameters"],
          "Every parameter must have a name.",
        );
        continue;
      }

      const key = `${parameter.in}:${parameter.name}`;
      if (seen.has(key)) {
        error(
          collector,
          [...base, "parameters"],
          `Duplicate parameter "${parameter.name}" in "${parameter.in}".`,
        );
      }
      seen.add(key);

      if (parameter.in === "path" && parameter.required !== true) {
        error(
          collector,
          [...base, "parameters"],
          `Path parameter "${parameter.name}" must be required.`,
        );
      }
    }

    // The classic OpenAPI mistake: a templated path with no matching
    // parameter, or a path parameter that no template slot refers to.
    const declaredPathParameters = new Set(
      parameters
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name),
    );

    for (const name of templateParameters) {
      if (!declaredPathParameters.has(name)) {
        error(
          collector,
          [...base, "parameters"],
          `Path template "{${name}}" has no matching parameter with in: "path".`,
        );
      }
    }

    for (const name of declaredPathParameters) {
      if (!templateParameters.includes(name)) {
        error(
          collector,
          [...base, "parameters"],
          `Path parameter "${name}" does not appear in the path template "${path}".`,
        );
      }
    }

    for (const tag of operation.tags ?? []) {
      if (!tag) {
        error(collector, [...base, "tags"], "Tags must be non-empty strings.");
      }
    }
  }

  private validateOperationIds(
    document: OpenAPIDocument,
    collector: Collector,
  ): void {
    const operationIds = new Map<string, string>();

    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      if (!pathItem) continue;
      for (const method of OPERATIONS) {
        const operation = (pathItem as OpenAPIPathItem)[method];
        if (!operation?.operationId) continue;

        const previous = operationIds.get(operation.operationId);
        if (previous) {
          error(
            collector,
            ["paths", path, method, "operationId"],
            `Duplicate operationId "${operation.operationId}" (also used by ${previous}).`,
          );
        } else {
          operationIds.set(
            operation.operationId,
            `${method.toUpperCase()} ${path}`,
          );
        }
      }
    }
  }

  /**
   * Checks that every security requirement names a declared scheme.
   *
   * A typo here produces a document that *looks* protected: tooling shows a
   * lock icon, generated clients send nothing, and the mismatch is invisible
   * without this check.
   */
  private validateSecurity(
    document: OpenAPIDocument,
    collector: Collector,
  ): void {
    const schemes = new Set(
      Object.keys(document.components?.securitySchemes ?? {}),
    );

    const check = (
      requirements: readonly Readonly<Record<string, readonly string[]>>[],
      path: readonly (string | number)[],
    ): void => {
      for (const requirement of requirements) {
        for (const name of Object.keys(requirement)) {
          if (!schemes.has(name)) {
            error(
              collector,
              path,
              `Security requirement "${name}" does not match any scheme in components.securitySchemes.`,
            );
          }
        }
      }
    };

    check(document.security ?? [], ["security"]);

    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      if (!pathItem) continue;
      for (const method of OPERATIONS) {
        const operation = (pathItem as OpenAPIPathItem)[method];
        if (!operation?.security) continue;
        check(operation.security, ["paths", path, method, "security"]);
      }
    }
  }

  /**
   * Checks that every local `$ref` resolves inside the document.
   */
  private validateReferences(
    document: OpenAPIDocument,
    collector: Collector,
  ): void {
    const seen = new WeakSet<object>();

    const walk = (value: unknown, path: readonly (string | number)[]): void => {
      if (typeof value !== "object" || value === null) return;
      if (seen.has(value)) return;
      seen.add(value);

      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, [...path, index]));
        return;
      }

      const record = value as Record<string, unknown>;
      const ref = record["$ref"];
      if (typeof ref === "string") {
        if (ref.startsWith("#") && !resolvePointer(document, ref)) {
          error(
            collector,
            path,
            `Reference "${ref}" does not resolve within the document.`,
          );
        }
        return;
      }

      for (const [key, entry] of Object.entries(record)) {
        walk(entry, [...path, key]);
      }
    };

    walk(document.paths ?? {}, ["paths"]);
    walk(document.components ?? {}, ["components"]);
  }
}

/** Resolves a local JSON Pointer, returning whether the target exists. */
function resolvePointer(document: OpenAPIDocument, ref: string): boolean {
  const pointer = ref.slice(1);
  if (pointer === "" || pointer === "/") return true;
  if (!pointer.startsWith("/")) return false;

  let current: unknown = document;
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = unescapeJsonPointerSegment(decodeURIComponent(rawSegment));
    if (typeof current !== "object" || current === null) return false;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
      continue;
    }
    if (!(segment in (current as Record<string, unknown>))) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return current !== undefined;
}

/** Creates a validator. */
export function createOpenAPIValidator(): OpenAPIValidatorImpl {
  return new OpenAPIValidatorImpl();
}
