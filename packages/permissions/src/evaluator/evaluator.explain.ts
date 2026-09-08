/**
 * Permission evaluator with a full explain trace.
 *
 * A thin alias over {@link evaluateWithTrace}: the trace is produced by the
 * same pass that produces the decision, so the two cannot disagree.
 *
 * @module evaluator/evaluator.explain
 */

import type {
  PermissionActor,
  ExplainResult,
  AuthorizationOptions,
} from "../permissionTypes/index.js";
import type { EvaluatorOptions } from "./evaluator.pipeline.js";
import { evaluateWithTrace } from "./evaluator.core.js";

/**
 * Evaluate with a full explain trace.
 */
export async function evaluateWithExplain(
  actor: PermissionActor,
  permissionStr: string,
  resource: unknown,
  options: EvaluatorOptions,
  authOptions?: AuthorizationOptions,
): Promise<ExplainResult> {
  return evaluateWithTrace(
    actor,
    permissionStr,
    resource,
    options,
    authOptions,
  );
}
