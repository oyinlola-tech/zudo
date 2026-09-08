/**
 * Adapter capability enforcement.
 *
 * Every adapter declares what it supports. Requesting something it does not
 * provide has to fail loudly: silently running a `serializable` unit of work
 * at the driver's default isolation is worse than not starting it.
 *
 * @module manager/manager.capabilities
 */

import type { TransactionOptions } from "../transactionTypes/transaction.interface.js";
import type { TransactionAdapter } from "../transactionTypes/transactionAdapter.js";
import { TransactionAdapterError } from "../transactionErrors/transactionError.types.js";

/**
 * Assert that an adapter can honour the options a transaction requests.
 *
 * @param adapter - The adapter about to begin the transaction.
 * @param options - The requested options.
 * @throws {TransactionAdapterError} when a requested capability is missing.
 */
export function assertAdapterSupports(
  adapter: TransactionAdapter,
  options: TransactionOptions | undefined,
): void {
  if (!options) return;

  const { capabilities } = adapter;

  if (
    options.isolation !== undefined &&
    !capabilities.isolationLevels.includes(options.isolation)
  ) {
    throw new TransactionAdapterError(
      `Adapter does not support isolation level "${options.isolation}"`,
    );
  }

  if (options.readOnly === true && !capabilities.readOnlyTransactions) {
    throw new TransactionAdapterError(
      "Adapter does not support read-only transactions",
    );
  }

  if (
    options.timeout !== undefined &&
    options.timeout > 0 &&
    !capabilities.timeouts
  ) {
    throw new TransactionAdapterError(
      "Adapter does not support transaction timeouts",
    );
  }
}
