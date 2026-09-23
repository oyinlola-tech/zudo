import { isSchemaDefinition } from "@zudojs/openapi";

import { schema } from "@zudojs/schema";

/**
 * The `{ ok: false, error }` body every binding sends on failure, as a
 * `@zudojs/schema` schema for OpenAPI documents.
 */
export const apiWireErrorBodySchema = schema.object({
  ok: schema.literal(false),
  error: schema.object({
    code: schema.string(),
    message: schema.string(),
    statusCode: schema.number(),
    requestId: schema.string(),
    issues: schema.optional(schema.array(schema.string())),
  }),
});

/**
 * Builds the `{ ok: true, data }` success envelope around an operation's
 * output schema. An output that OpenAPI generation cannot convert (a
 * Standard Schema from another library), or no output at all, is
 * documented as `data: unknown`.
 */
export function apiSuccessBodySchema(output: unknown): unknown {
  const data = isSchemaDefinition(output) ? output : schema.unknown();
  return schema.object({
    ok: schema.literal(true),
    data: data as ReturnType<typeof schema.unknown>,
  });
}

interface SplittableObjectSchema {
  readonly _type: "object";
  readonly shape: Readonly<Record<string, unknown>>;
  pick(keys: readonly string[]): unknown;
  omit(keys: readonly string[]): unknown;
}

function isSplittable(value: unknown): value is SplittableObjectSchema {
  const candidate = value as Partial<SplittableObjectSchema> | null;
  return (
    isSchemaDefinition(value) &&
    candidate?._type === "object" &&
    typeof candidate.shape === "object" &&
    typeof candidate.pick === "function" &&
    typeof candidate.omit === "function"
  );
}

/**
 * Splits an input schema into the path-parameter part and the rest, so
 * a field bound from the path is not also documented as a query parameter
 * or body property. Returns `undefined` parts for input OpenAPI cannot
 * convert.
 */
export function splitInputSchema(
  input: unknown,
  pathParams: readonly string[],
): { readonly params?: unknown; readonly rest?: unknown } {
  if (!isSchemaDefinition(input)) {
    return {};
  }
  if (!isSplittable(input)) {
    return { rest: input };
  }
  const bound = pathParams.filter((name) => Object.hasOwn(input.shape, name));
  if (bound.length === 0) {
    return { rest: input };
  }
  const rest = input.omit(bound);
  const restEmpty =
    Object.keys((rest as { shape?: object }).shape ?? {}).length === 0;
  return {
    params: input.pick(bound),
    ...(restEmpty ? {} : { rest }),
  };
}
