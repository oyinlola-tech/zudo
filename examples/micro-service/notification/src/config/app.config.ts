export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly serviceName: string;
}

export function createAppConfig(): AppConfig {
  return {
    port: Number(process.env?.["PORT"] ?? 3004),
    host: process.env?.["HOST"] ?? "127.0.0.1",
    serviceName: "campusflow-notification",
  };
}
