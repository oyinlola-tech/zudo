import type {
  OpenAPIReference,
  OpenAPISchema,
} from "../openApiTypes/openApiTypes.core.js";
import type { SchemaConversionOptions } from "./schemaConverter.core.js";
import { convertSchema } from "./schemaConverter.core.js";
import { createComponentReference } from "./references.core.js";
import { OpenAPIComponentConflictError } from "../openApiErrors/openApiError.types.js";

/**
 * Schema registry for OpenAPI component schemas.
 */
export interface SchemaRegistry {
  register(name: string, schema: unknown): OpenAPISchema;

  get(name: string): OpenAPISchema | undefined;

  has(name: string): boolean;

  convert(name: string, schema: unknown): OpenAPISchema;

  ref(name: string): OpenAPIReference;

  /** Conversion warnings, keyed by the component they came from. */
  warnings(): ReadonlyMap<string, readonly string[]>;

  /** Every registered schema, ready to drop into `components.schemas`. */
  all(): Readonly<Record<string, OpenAPISchema>>;

  clear(): void;
}

/** Options for {@link SchemaRegistryImpl}. */
export interface SchemaRegistryOptions extends SchemaConversionOptions {
  /**
   * Reports what a conversion could not express. Without a sink these are
   * easy to lose, and "unsupported schema type" silently becoming `{}` is how
   * a specification ends up documenting nothing.
   */
  readonly onWarning?: (name: string, warnings: readonly string[]) => void;
}

/**
 * Default schema registry implementation.
 */
export class SchemaRegistryImpl implements SchemaRegistry {
  private readonly schemas = new Map<string, OpenAPISchema>();
  private readonly conversionWarnings = new Map<string, readonly string[]>();
  private readonly options: SchemaRegistryOptions;

  constructor(options: SchemaRegistryOptions = {}) {
    this.options = options;
  }

  private convertAndRecord(name: string, schema: unknown): OpenAPISchema {
    const result = convertSchema(schema, this.options);
    if (result.warnings.length > 0) {
      this.conversionWarnings.set(name, result.warnings);
      this.options.onWarning?.(name, result.warnings);
    }
    this.schemas.set(name, result.schema);
    return result.schema;
  }

  public register(name: string, schema: unknown): OpenAPISchema {
    if (this.schemas.has(name)) {
      throw new OpenAPIComponentConflictError("schemas", name);
    }
    return this.convertAndRecord(name, schema);
  }

  public get(name: string): OpenAPISchema | undefined {
    return this.schemas.get(name);
  }

  public has(name: string): boolean {
    return this.schemas.has(name);
  }

  public convert(name: string, schema: unknown): OpenAPISchema {
    const existing = this.schemas.get(name);
    if (existing) return existing;
    return this.convertAndRecord(name, schema);
  }

  public ref(name: string): OpenAPIReference {
    return createComponentReference("schemas", name);
  }

  public warnings(): ReadonlyMap<string, readonly string[]> {
    return new Map(this.conversionWarnings);
  }

  public all(): Readonly<Record<string, OpenAPISchema>> {
    return Object.fromEntries(this.schemas);
  }

  public clear(): void {
    this.schemas.clear();
    this.conversionWarnings.clear();
  }
}
