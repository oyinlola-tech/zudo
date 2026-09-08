export interface CacheHealth {
  readonly healthy: boolean;
  readonly adapter: string;
  readonly latencyMs?: number;
  readonly checkedAt: Date;
  readonly error?: string;
  /**
   * True when the cache is configured `enabled: false`. The check is
   * reported healthy without touching the adapter.
   */
  readonly disabled?: boolean;
}

export interface CacheHealthChecker {
  healthCheck(): Promise<CacheHealth>;
}

export interface CacheSerializer<TValue = unknown, TSerialized = unknown> {
  serialize(value: TValue): TSerialized;
  deserialize(value: TSerialized): TValue;
}

export interface CacheSerializationOptions {
  readonly serializer?: CacheSerializer;
}
