/**
 * @zudojs/transactions — Transaction Barrel
 */

export { createTransaction } from "./transaction.core.js";
export {
  createNonTransactional,
  createParticipant,
} from "./transaction.participant.js";
export {
  canTransition,
  createTransitionFunction,
  isTerminal,
} from "./transactionStateMachine.js";
export { asSavepointHandle } from "./transaction.internal.js";
export type { SavepointHandle } from "./transaction.internal.js";
