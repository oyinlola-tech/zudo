import type { ConfigValue } from "../../configValue/configValue.core.js";

import type { ConfigSchema } from "../../configSchema/index.js";

import type { ConfigResolver } from "../core/configResolver.core.js";

/**
 * Resolver scoped to a configuration key prefix.
 */
export class ScopedConfigResolver {
  private readonly resolver: ConfigResolver;

  private readonly prefix: string;

  constructor(resolver: ConfigResolver, prefix: string) {
    this.resolver = resolver;

    this.prefix = prefix.trim().replace(/\.$/, "");
  }

  /**
   * Resolves a key inside the current scope.
   */
  key(key: string): string {
    return this.prefix ? `${this.prefix}.${key}` : key;
  }

  get<T extends ConfigValue = ConfigValue>(key: string): T | undefined {
    return this.resolver.get<T>(this.key(key));
  }

  required<T extends ConfigValue = ConfigValue>(key: string): T {
    return this.resolver.required<T>(this.key(key));
  }

  string(key: string, fallback?: string): string | undefined {
    return this.resolver.string(this.key(key), fallback);
  }

  number(key: string, fallback?: number): number | undefined {
    return this.resolver.number(this.key(key), fallback);
  }

  boolean(key: string, fallback?: boolean): boolean | undefined {
    return this.resolver.boolean(this.key(key), fallback);
  }

  bigint(key: string, fallback?: bigint): bigint | undefined {
    return this.resolver.bigint(this.key(key), fallback);
  }

  date(key: string, fallback?: Date): Date | undefined {
    return this.resolver.date(this.key(key), fallback);
  }

  object<T extends ConfigValue = ConfigValue>(
    key: string,
    fallback?: T,
  ): T | undefined {
    return this.resolver.object<T>(this.key(key), fallback);
  }

  array<T extends ConfigValue = ConfigValue>(
    key: string,
    fallback?: readonly T[],
  ): readonly T[] | undefined {
    return this.resolver.array<T>(this.key(key), fallback);
  }

  resolve<T extends ConfigValue>(
    key: string,
    schema: ConfigSchema<T>,
  ): T | undefined {
    return this.resolver.resolve(this.key(key), schema);
  }

  pick(keys: readonly string[]): Readonly<Record<string, ConfigValue>> {
    return this.resolver.pick(keys.map((key) => this.key(key)));
  }

  scoped(prefix: string): ScopedConfigResolver {
    return this.resolver.scoped(this.key(prefix));
  }
}
