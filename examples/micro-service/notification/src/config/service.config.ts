export interface ServiceConfig {
  readonly queueConcurrency: number;
  readonly maxRetries: number;
}

export function createServiceConfig(): ServiceConfig {
  return {
    queueConcurrency: 5,
    maxRetries: 3,
  };
}
