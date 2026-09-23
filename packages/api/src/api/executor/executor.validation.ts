import type { APIResult } from "../result/apiResult.type.js";

import { apiFailure, apiSuccess } from "../result/apiResult.type.js";

import type { APIOperation } from "../operation/operation.type.js";

import { APIInternalError, APIValidationError } from "../errors/index.js";

import { validateWithSchema } from "../schema/index.js";

import { normalizeAPIError } from "./executor.normalize.js";

import { formatIssuePath, toClientIssues } from "./executor.issues.js";

/**
 * How client-facing validation issues are reported.
 */
export interface APIInputIssueOptions {
  /** Maximum number of issues carried on the error. */
  readonly maxIssues: number;
  /** Whether raw schema messages are copied (otherwise paths only). */
  readonly exposeMessages: boolean;
}

/**
 * Validates input against `operation.input`, returning the validated
 * (possibly transformed) value, or a client-facing `APIValidationError`
 * (422) whose issues name failing paths, never submitted values.
 *
 * A schema that throws, or is unrecognised, fails closed with an
 * internal error rather than letting the input through.
 */
export async function validateOperationInput<TInput, TOutput>(
  operation: APIOperation<TInput, TOutput>,
  input: TInput,
  options: APIInputIssueOptions,
): Promise<APIResult<TInput>> {
  if (operation.input === undefined) {
    return apiSuccess(input);
  }
  try {
    const validation = await validateWithSchema(operation.input, input);
    if (!validation.ok) {
      return apiFailure(
        new APIValidationError(
          `Invalid input for operation "${operation.name}".`,
          toClientIssues(
            validation.issues,
            options.maxIssues,
            options.exposeMessages,
          ),
        ),
      );
    }
    return apiSuccess(validation.value as TInput);
  } catch (error) {
    return apiFailure(normalizeAPIError(error, operation.name));
  }
}

/**
 * Validates handler output against `operation.output`.
 *
 * A response that does not match its declared schema is a server bug,
 * not a client mistake, so failures surface as an `APIInternalError`
 * (500, `expose: false`) naming only the failing paths — never the
 * offending values, which are exactly the fields (password hashes,
 * internal audit columns) that should not reach a client.
 */
export async function validateOperationOutput<TInput, TOutput>(
  operation: APIOperation<TInput, TOutput>,
  output: TOutput,
  maxIssues: number,
): Promise<APIResult<TOutput>> {
  if (operation.output === undefined) {
    return apiSuccess(output);
  }

  let validation: Awaited<ReturnType<typeof validateWithSchema>>;
  try {
    validation = await validateWithSchema(operation.output, output);
  } catch (error) {
    return apiFailure(normalizeAPIError(error, operation.name));
  }

  if (!validation.ok) {
    const paths = validation.issues
      .slice(0, maxIssues)
      .map(formatIssuePath)
      .join(", ");
    return apiFailure(
      new APIInternalError(
        `Invalid output for operation "${operation.name}" at: ${paths}.`,
      ),
    );
  }

  return apiSuccess(validation.value as TOutput);
}
