/**
 * OpenAPI schema types.
 *
 * Follows JSON Schema 2020-12 as OpenAPI 3.1 does, while keeping the 3.0-only
 * `nullable` keyword available for documents targeting 3.0.x.
 */

export interface OpenAPISchema {
  readonly title?: string;
  /** A single type, or — in 3.1 — a union such as `["string", "null"]`. */
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, OpenAPISchema>>;
  readonly required?: readonly string[];
  readonly description?: string;
  readonly format?: string;
  readonly default?: unknown;
  /** OpenAPI 3.0 only. In 3.1, nullability is part of `type`. */
  readonly nullable?: boolean;
  readonly readOnly?: boolean;
  readonly writeOnly?: boolean;
  readonly deprecated?: boolean;
  readonly example?: unknown;
  readonly examples?: readonly unknown[];
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly $ref?: string;
  readonly allOf?: readonly OpenAPISchema[];
  readonly oneOf?: readonly OpenAPISchema[];
  readonly anyOf?: readonly OpenAPISchema[];
  readonly not?: OpenAPISchema;
  readonly items?: OpenAPISchema;
  /** JSON Schema 2020-12 positional items, used for tuples. */
  readonly prefixItems?: readonly OpenAPISchema[];
  readonly additionalProperties?: OpenAPISchema | boolean;
  readonly discriminator?: OpenAPIDiscriminator;
  readonly xml?: OpenAPIXml;

  /* ── String constraints ─────────────────────────────────────────────── */
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;

  /* ── Numeric constraints ────────────────────────────────────────────── */
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number | boolean;
  readonly exclusiveMaximum?: number | boolean;
  readonly multipleOf?: number;

  /* ── Array constraints ──────────────────────────────────────────────── */
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;

  /* ── Object constraints ─────────────────────────────────────────────── */
  readonly minProperties?: number;
  readonly maxProperties?: number;

  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface OpenAPIDiscriminator {
  readonly propertyName: string;
  readonly mapping?: Readonly<Record<string, string>>;
  readonly oneOf?: readonly OpenAPISchema[];
}

export interface OpenAPIXml {
  readonly name?: string;
  readonly namespace?: string;
  readonly prefix?: string;
  readonly attribute?: boolean;
  readonly wrapped?: boolean;
}
