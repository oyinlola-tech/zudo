/**
 * Gateway configuration interfaces.
 */

/** Configuration for a single backend service. */
export interface ServiceConfig {
  readonly name: string;
  readonly url: string;
  readonly timeout: number;
}

/** Full gateway configuration. */
export interface GatewayConfig {
  readonly port: number;
  readonly host: string;
  readonly jwtSecret: string;
  readonly corsOrigin: string;
  readonly services: {
    readonly identity: ServiceConfig;
    readonly enrollment: ServiceConfig;
    readonly assessment: ServiceConfig;
    readonly notification: ServiceConfig;
  };
}
