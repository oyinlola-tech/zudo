/** Application-level configuration. */
export interface AppConfig {
  /** Application name. */
  readonly name: string;
  /** Application version. */
  readonly version: string;
  /** Runtime environment. */
  readonly env: "development" | "production" | "test";
  /** HTTP port to listen on. */
  readonly port: number;
  /** Hostname to bind to. */
  readonly host: string;
}

/** SQLite database configuration. */
export interface DatabaseConfig {
  /** File path to the SQLite database. */
  readonly filename: string;
  /** Whether verbose mode is enabled. */
  readonly verbose: boolean;
}

/** Logger configuration. */
export interface LoggerConfig {
  /** Minimum log level. */
  readonly level: string;
  /** Whether logging is enabled. */
  readonly enabled: boolean;
}

/** HTTP server configuration. */
export interface HttpConfig {
  /** Port to listen on. */
  readonly port: number;
  /** Hostname to bind to. */
  readonly host: string;
  /** Whether CORS is enabled. */
  readonly cors: boolean;
}

/** Service-level configuration. */
export interface ServiceConfig {
  /** Unique service identifier. */
  readonly serviceId: string;
  /** Service display name. */
  readonly serviceName: string;
  /** Service version. */
  readonly version: string;
}
