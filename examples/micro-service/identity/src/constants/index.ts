/**
 * Application constants for the Identity service.
 */

/** Service name identifier. */
export const APP_NAME = "campusflow-identity" as const;

/** Default page size for paginated queries. */
export const DEFAULT_PAGE_SIZE = 20 as const;

/** Maximum page size for paginated queries. */
export const MAX_PAGE_SIZE = 100 as const;

/** Default JWT expiry duration. */
export const DEFAULT_JWT_EXPIRY = "24h" as const;

/** Bcrypt salt rounds for password hashing. */
export const BCRYPT_SALT_ROUNDS = 10 as const;

/** Event source identifier. */
export const EVENT_SOURCE = "identity-service" as const;
