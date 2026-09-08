/**
 * Database error factory functions.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import {
  DatabaseError,
  DatabaseOperation,
  type DatabaseErrorOptions,
} from "./databaseError.base.js";

/** Creates a database connection error. */
export function databaseConnectionError(
  message = "Unable to connect to the database.",
  options: Omit<DatabaseErrorOptions, "operation"> = {},
): DatabaseError {
  return new DatabaseError(message, {
    ...options,
    code: ErrorCode.DATABASE_CONNECTION,
    operation: DatabaseOperation.CONNECT,
  });
}

/** Creates a database query error. */
export function databaseQueryError(
  message = "The database query failed.",
  options: Omit<DatabaseErrorOptions, "operation"> = {},
): DatabaseError {
  return new DatabaseError(message, {
    ...options,
    code: ErrorCode.DATABASE_QUERY,
    operation: DatabaseOperation.QUERY,
  });
}

/** Creates a database transaction error. */
export function databaseTransactionError(
  message = "The database transaction failed.",
  options: Omit<DatabaseErrorOptions, "operation"> = {},
): DatabaseError {
  return new DatabaseError(message, {
    ...options,
    code: ErrorCode.DATABASE_TRANSACTION,
    operation: DatabaseOperation.TRANSACTION,
  });
}

/** Creates a database migration error. */
export function databaseMigrationError(
  message = "The database migration failed.",
  options: Omit<DatabaseErrorOptions, "operation"> = {},
): DatabaseError {
  return new DatabaseError(message, {
    ...options,
    code: ErrorCode.DATABASE_MIGRATION,
    operation: DatabaseOperation.MIGRATION,
  });
}
