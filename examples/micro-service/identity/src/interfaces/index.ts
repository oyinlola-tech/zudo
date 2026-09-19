/**
 * Configuration interfaces for the Identity service.
 */

/**
 * Application-level configuration.
 */
export interface AppConfig {
  readonly name: string;
  readonly port: number;
  readonly host: string;
  readonly env: string;
}

/**
 * Database configuration.
 */
export interface DatabaseConfig {
  readonly filename: string;
}

/**
 * Security configuration for JWT and passwords.
 */
export interface SecurityConfig {
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
}

/**
 * Service-specific configuration.
 */
export interface ServiceConfig {
  readonly port: number;
  readonly host: string;
}
