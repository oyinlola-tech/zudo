export interface CacheHealth {
  readonly healthy: boolean;
  readonly adapter: string;
  readonly latencyMs?: number;
  readonly checkedAt: Date;
  readonly error?: string;
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
