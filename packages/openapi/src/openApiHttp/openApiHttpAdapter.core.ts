import type {
  OpenAPIDocument,
  OpenAPIInfo,
  OpenAPILogo,
  OpenAPISchema,
  OpenAPISecurityRequirement,
  OpenAPISecurityScheme,
  OpenAPIServer,
  OpenAPITag,
} from "../openApiTypes/openApiTypes.core.js";
import type {
  RouteInfo,
  OpenAPIHttpMethod,
} from "../openApiRouting/routeMetadata.type.js";
import { OpenAPIRegistryImpl } from "../openApiRegistry/openApiRegistry.core.js";
import { OpenAPIRouteScannerImpl } from "../openApiRouting/routeScanner.core.js";
import {
  OpenAPIValidatorImpl,
  type OpenAPIValidationResult,
} from "../openApiValidation/openApiValidator.core.js";
import { SchemaRegistryImpl } from "../openApiSchema/schemaRegistry.core.js";
import {
  toOpenAPIJSON,
  toOpenAPIYAML,
} from "../openApiSerialization/openApiSerializer.core.js";
import {
  DEFAULT_MEDIA_TYPE,
  DEFAULT_OPENAPI_VERSION,
  DOCUMENT_CACHE_TTL_MS,
} from "../openApiConstants/openApiConstants.core.js";
import {
  renderOpenAPIUI,
  zudoLogo,
  type OpenAPIUIOptions,
} from "../openApiUi/openApiUi.core.js";

/** Options for {@link OpenAPIManager}. */
export interface OpenAPIManagerOptions {
  /** Specification version to emit. Default: 3.1.0. */
  readonly version?: string;
  /** Document metadata. Without it the document is titled "API" at 0.0.0. */
  readonly info?: OpenAPIInfo;
  readonly servers?: readonly OpenAPIServer[];
  readonly tags?: readonly OpenAPITag[];
  readonly security?: readonly OpenAPISecurityRequirement[];
  /**
   * How long a generated document is reused before it is rebuilt, in ms.
   * Default: five minutes. `0` disables caching. Mutating the manager
   * invalidates the cache regardless.
   */
  readonly cacheTtlMs?: number;
  /** Reports what a schema conversion could not express. */
  readonly onSchemaWarning?: (
    name: string,
    warnings: readonly string[],
  ) => void;
  /** Supplies the clock, for tests. */
  readonly now?: () => number;
  /**
   * Logo written to `info["x-logo"]` so viewers such as ReDoc and Scalar
   * show it, and used by {@link OpenAPIManager.toUIResponse}.
   * Default: the Zudo mark. Pass `false` to emit no logo, or an
   * {@link OpenAPILogo} to use your own.
   */
  readonly branding?: boolean | OpenAPILogo;
}

/** An HTTP response carrying a rendered documentation page. */
export interface OpenAPIUIResponse {
  readonly status: 200;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** An HTTP response carrying the specification document. */
export interface OpenAPIDocumentResponse {
  readonly status: 200;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * High-level OpenAPI manager that coordinates generation, validation, and
 * serving.
 *
 * Every mutation invalidates the cached document, so a route added after a
 * first `generate()` appears in the next one, and regeneration is idempotent
 * rather than throwing on the routes it registered last time.
 */
export class OpenAPIManager {
  private readonly registry: OpenAPIRegistryImpl;
  private readonly scanner: OpenAPIRouteScannerImpl;
  private readonly validator: OpenAPIValidatorImpl;
  private readonly schemas: SchemaRegistryImpl;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly logo: OpenAPILogo | undefined;
  /** True when `branding` was a caller-supplied logo rather than the default. */
  private readonly customLogo: boolean;

  private cachedDocument?: OpenAPIDocument;
  private cachedAt = 0;
  /** Whether the cached document was produced by a validating generate. */
  private cachedValidated = false;

  constructor(versionOrOptions: string | OpenAPIManagerOptions = {}) {
    const options: OpenAPIManagerOptions =
      typeof versionOrOptions === "string"
        ? { version: versionOrOptions }
        : versionOrOptions;

    this.registry = new OpenAPIRegistryImpl(
      options.version ?? DEFAULT_OPENAPI_VERSION,
    );
    this.scanner = new OpenAPIRouteScannerImpl();
    this.validator = new OpenAPIValidatorImpl();
    this.schemas = new SchemaRegistryImpl({
      version: options.version ?? DEFAULT_OPENAPI_VERSION,
      onWarning: options.onSchemaWarning,
    });
    this.cacheTtlMs = options.cacheTtlMs ?? DOCUMENT_CACHE_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    this.logo =
      options.branding === false
        ? undefined
        : options.branding === true || options.branding === undefined
          ? zudoLogo()
          : options.branding;
    this.customLogo =
      typeof options.branding === "object" && options.branding !== null;

    if (options.info) this.registry.setInfo(options.info);
    for (const server of options.servers ?? []) this.registry.addServer(server);
    for (const tag of options.tags ?? []) this.registry.setTag(tag);
    for (const requirement of options.security ?? []) {
      this.registry.addSecurityRequirement(requirement);
    }
  }

  /** The document version this manager emits. */
  public get version(): string {
    return this.registry.version;
  }

  /* ── Mutation ────────────────────────────────────────────────────────── */

  /** Sets the document's `info` object. */
  public setInfo(info: OpenAPIInfo): this {
    this.registry.setInfo(info);
    return this.invalidateCache();
  }

  public addServer(server: OpenAPIServer): this {
    this.registry.addServer(server);
    return this.invalidateCache();
  }

  public addTag(tag: OpenAPITag): this {
    this.registry.setTag(tag);
    return this.invalidateCache();
  }

  public addSecurityRequirement(requirement: OpenAPISecurityRequirement): this {
    this.registry.addSecurityRequirement(requirement);
    return this.invalidateCache();
  }

  public addSecurityScheme(name: string, scheme: OpenAPISecurityScheme): this {
    this.registry.registerSecurityScheme(name, scheme);
    return this.invalidateCache();
  }

  /** Registers a route. Duplicate method+path combinations are rejected. */
  public addRoute(route: RouteInfo): this {
    this.scanner.addRoute(route);
    return this.invalidateCache();
  }

  /** Registers a route, replacing any existing one for the same method+path. */
  public setRoute(route: RouteInfo): this {
    this.scanner.setRoute(route);
    return this.invalidateCache();
  }

  /** Removes a route. Returns whether one was removed. */
  public removeRoute(method: OpenAPIHttpMethod, path: string): boolean {
    const removed = this.scanner.removeRoute(method, path);
    if (removed) this.invalidateCache();
    return removed;
  }

  /**
   * Registers a component schema.
   *
   * `schema` is converted from a `@zudojs/schema` schema; pass an already
   * converted {@link OpenAPISchema} to {@link OpenAPIManager.addRawSchema}.
   */
  public addSchema(name: string, schema: unknown): this {
    const converted = this.schemas.register(name, schema);
    this.registry.registerSchema(name, converted);
    return this.invalidateCache();
  }

  /** Registers an already-converted OpenAPI schema. */
  public addRawSchema(name: string, schema: OpenAPISchema): this {
    this.registry.registerSchema(name, schema);
    return this.invalidateCache();
  }

  /** Conversion warnings, keyed by component name. */
  public schemaWarnings(): ReadonlyMap<string, readonly string[]> {
    return this.schemas.warnings();
  }

  /* ── Generation ──────────────────────────────────────────────────────── */

  /**
   * Builds the document from the registered routes and components.
   *
   * Safe to call repeatedly: routes are replaced rather than re-added.
   */
  public generate(validate = false): OpenAPIDocument {
    // The scanner is the source of truth for routes. Re-setting on top of
    // the previous route set kept routes that had since been removed or
    // hidden, so `removeRoute()` had no effect once a document had been
    // generated.
    this.registry.clearRoutes();
    for (const route of this.scanner.scan()) {
      this.registry.setRoute(route);
    }

    // Brand the document unless the caller supplied a logo or opted out.
    const info = this.registry.getInfo();
    if (this.logo && !info["x-logo"]) {
      this.registry.setInfo({ ...info, "x-logo": this.logo });
    }

    const document = this.registry.generate();
    if (validate) this.validator.assertValid(document);

    this.cachedDocument = document;
    this.cachedAt = this.now();
    this.cachedValidated = validate;
    return document;
  }

  /**
   * Returns the document, rebuilding it when the cache is stale, absent, or
   * was produced without the validation this call asks for.
   */
  public getDocument(validate = false): OpenAPIDocument {
    if (this.cachedDocument && this.isCacheFresh()) {
      if (!validate || this.cachedValidated) return this.cachedDocument;
      // The cached document was never validated; validating it now is
      // cheaper than rebuilding, and skipping the check silently is what a
      // caller passing `true` is explicitly asking us not to do.
      this.validator.assertValid(this.cachedDocument);
      this.cachedValidated = true;
      return this.cachedDocument;
    }
    return this.generate(validate);
  }

  private isCacheFresh(): boolean {
    if (this.cacheTtlMs <= 0) return false;
    return this.now() - this.cachedAt < this.cacheTtlMs;
  }

  /** Validates the current document without throwing. */
  public validate(): OpenAPIValidationResult {
    return this.validator.validate(this.getDocument());
  }

  /** Drops the cached document. Called automatically by every mutation. */
  public invalidateCache(): this {
    this.cachedDocument = undefined;
    this.cachedAt = 0;
    this.cachedValidated = false;
    return this;
  }

  /** Drops every registered route, component and the cached document. */
  public reset(): this {
    this.scanner.clear();
    this.registry.clear();
    this.schemas.clear();
    return this.invalidateCache();
  }

  /**
   * @deprecated Use {@link OpenAPIManager.reset} — the old name cleared all
   * registered routes, which is not what "invalidate" suggests.
   */
  public invalidate(): void {
    this.reset();
  }

  /* ── Serialization ───────────────────────────────────────────────────── */

  public toJSON(validate = false): string {
    return toOpenAPIJSON(this.getDocument(validate));
  }

  public toYAML(validate = false): string {
    return toOpenAPIYAML(this.getDocument(validate));
  }

  /* ── Serving ─────────────────────────────────────────────────────────── */

  /**
   * Builds an HTTP response carrying the document.
   *
   * Framework-agnostic on purpose: `{ status, headers, body }` is what every
   * adapter in this monorepo can turn into its own response type.
   */
  public toResponse(options?: {
    readonly format?: "json" | "yaml";
    readonly validate?: boolean;
    readonly cacheControl?: string;
  }): OpenAPIDocumentResponse {
    const format = options?.format ?? "json";
    const body =
      format === "yaml"
        ? this.toYAML(options?.validate ?? false)
        : this.toJSON(options?.validate ?? false);

    return Object.freeze({
      status: 200 as const,
      headers: Object.freeze({
        "content-type":
          format === "yaml"
            ? "application/yaml; charset=utf-8"
            : `${DEFAULT_MEDIA_TYPE}; charset=utf-8`,
        "cache-control": options?.cacheControl ?? "public, max-age=300",
      }),
      body,
    });
  }

  /**
   * Builds an HTTP response carrying a branded documentation page (Swagger UI
   * by default, ReDoc on request) that loads the specification from
   * `options.specUrl`. Pair it with {@link OpenAPIManager.toResponse}:
   *
   * ```ts
   * app.get("/openapi.json", () => manager.toResponse());
   * app.get("/docs", () => manager.toUIResponse({ specUrl: "/openapi.json" }));
   * ```
   */
  public toUIResponse(options: OpenAPIUIOptions): OpenAPIUIResponse {
    const info = this.registry.getInfo();
    const body = renderOpenAPIUI({
      title:
        info.title && info.title !== "API"
          ? `${info.title} · API reference`
          : undefined,
      ...options,
      // Precedence: an explicit page logo, then the manager's `branding`
      // (a custom logo is used as-is; `false` renders none), then the
      // page's own default wordmark.
      logo:
        options.logo !== undefined
          ? options.logo
          : this.logo === undefined
            ? false
            : this.customLogo
              ? this.logo
              : undefined,
    });
    return Object.freeze({
      status: 200 as const,
      headers: Object.freeze({
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      }),
      body,
    });
  }
}

/** Creates an OpenAPI manager. */
export function createOpenAPIManager(
  options?: OpenAPIManagerOptions,
): OpenAPIManager {
  return new OpenAPIManager(options ?? {});
}
