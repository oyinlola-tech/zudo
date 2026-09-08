/**
 * @zudojs/database — Health Checks
 *
 * Database health and readiness monitoring.
 */

export {
  checkDatabaseHealth,
  checkDatabaseReadiness,
  assertDatabaseHealth,
  isDatabaseHealthy,
  getHealthCheckCause,
  DatabaseUnhealthyError,
  DEFAULT_HEALTH_TIMEOUT_MS,
  type DatabaseHealthStatus,
  type DatabaseHealth,
  type DatabaseHealthOptions,
  type DatabaseReadiness,
} from "./health.check.js";
