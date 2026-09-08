/**
 * @zudojs/observability — Propagation
 *
 * Context propagation with AsyncLocalStorage for request-scoped IDs.
 */

export {
  createPropagationContext,
  derivePropagationContext,
  getCurrentContext,
  requireCurrentContext,
  AsyncPropagationManager,
  createPropagationManager,
} from "./propagation.core.js";
