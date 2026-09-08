/**
 * Application configuration.
 *
 * Loaded from environment variables with sensible defaults.
 */
export interface AppConfig {
    readonly port: number;
    readonly host: string;
    readonly nodeEnv: string;
}
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=config.d.ts.map