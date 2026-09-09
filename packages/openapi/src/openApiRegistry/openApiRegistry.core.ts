import type {
  OpenAPIDocument,
  OpenAPIExample,
  OpenAPIHeader,
  OpenAPIInfo,
  OpenAPILink,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIPathItem,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPISchema,
  OpenAPISecurityRequirement,
  OpenAPISecurityScheme,
  OpenAPIServer,
  OpenAPITag,
  OpenAPIReference,
} from "../openApiTypes/openApiTypes.core.js";
import type { OpenAPIRoute, OpenAPIRegistry } from "./openApiRegistry.type.js";
import type { ComponentSection } from "../openApiSchema/references.core.js";
import { createComponentReference } from "../openApiSchema/references.core.js";
import {
  DEFAULT_OPENAPI_VERSION,
  SUPPORTED_OPENAPI_VERSIONS,
} from "../openApiConstants/openApiConstants.core.js";
import {
  OpenAPIComponentConflictError,
  OpenAPIOperationError,
  OpenAPIVersionError,
} from "../openApiErrors/openApiError.types.js";

/** Placeholder used until {@link OpenAPIRegistryImpl.setInfo} is called. */
const DEFAULT_INFO: OpenAPIInfo = { title: "API", version: "0.0.0" };

/** Default OpenAPI registry implementation. */
export class OpenAPIRegistryImpl implements OpenAPIRegistry {
  public readonly version: string;

  private info: OpenAPIInfo = DEFAULT_INFO;
  private readonly servers: OpenAPIServer[] = [];
  private readonly security: OpenAPISecurityRequirement[] = [];

  private readonly routes = new Map<string, OpenAPIRoute>();
  private readonly schemas = new Map<string, OpenAPISchema>();
  private readonly responses = new Map<string, OpenAPIResponse>();
  private readonly parameters = new Map<string, OpenAPIParameter>();
  private readonly requestBodies = new Map<string, OpenAPIRequestBody>();
  private readonly headers = new Map<string, OpenAPIHeader>();
  private readonly examples = new Map<string, OpenAPIExample>();
  private readonly securitySchemes = new Map<string, OpenAPISecurityScheme>();
  private readonly tags = new Map<string, OpenAPITag>();
  private readonly links = new Map<string, OpenAPILink>();
  private readonly callbacks = new Map<
    string,
    Readonly<Record<string, OpenAPIPathItem>>
  >();

  constructor(version: string = DEFAULT_OPENAPI_VERSION) {
    if (!(SUPPORTED_OPENAPI_VERSIONS as readonly string[]).includes(version)) {
      // Fail where the version is chosen, not later inside generate().
      throw new OpenAPIVersionError(version, SUPPORTED_OPENAPI_VERSIONS);
    }
    this.version = version;
  }

  /** Sets the document's `info` object. */
  public setInfo(info: OpenAPIInfo): void {
    this.info = { ...info };
  }

  /** The document's current `info` object. */
  public getInfo(): OpenAPIInfo {
    return { ...this.info };
  }

  public addServer(server: OpenAPIServer): void {
    this.servers.push({ ...server });
  }

  public addSecurityRequirement(requirement: OpenAPISecurityRequirement): void {
    this.security.push({ ...requirement });
  }

  private static routeKey(route: {
    readonly method: string;
    readonly path: string;
  }): string {
    return `${route.method.toLowerCase()}:${route.path}`;
  }

  public registerRoute(route: OpenAPIRoute): void {
    const key = OpenAPIRegistryImpl.routeKey(route);
    const existing = this.routes.get(key);
    if (existing) {
      throw new OpenAPIOperationError(
        `Duplicate operation for ${route.method.toUpperCase()} ${route.path}` +
          (existing.operation.operationId
            ? ` (already registered as "${existing.operation.operationId}")`
            : ""),
        {
          metadata: {
            method: route.method,
            path: route.path,
            operationId: existing.operation.operationId,
          },
        },
      );
    }
    this.setRoute(route);
  }

  /**
   * Registers a route, replacing any existing one.
   *
   * This is what makes regeneration idempotent: re-registering the same routes
   * into a registry that already holds them used to throw, so calling
   * `generate()` twice failed.
   */
  public setRoute(route: OpenAPIRoute): void {
    this.routes.set(OpenAPIRegistryImpl.routeKey(route), {
      ...route,
      operation: Object.freeze({
        ...route.operation,
        responses: Object.freeze({ ...route.operation.responses }),
      }),
    });
  }

  private static register<T>(
    map: Map<string, T>,
    section: ComponentSection,
    name: string,
    value: T,
  ): void {
    if (map.has(name)) {
      throw new OpenAPIComponentConflictError(section, name);
    }
    map.set(name, Object.freeze(value));
  }

  public registerSchema(name: string, schema: OpenAPISchema): void {
    OpenAPIRegistryImpl.register(this.schemas, "schemas", name, { ...schema });
  }

  public registerResponse(name: string, response: OpenAPIResponse): void {
    OpenAPIRegistryImpl.register(this.responses, "responses", name, {
      ...response,
    });
  }

  public registerParameter(name: string, parameter: OpenAPIParameter): void {
    OpenAPIRegistryImpl.register(this.parameters, "parameters", name, {
      ...parameter,
    });
  }

  public registerRequestBody(name: string, body: OpenAPIRequestBody): void {
    OpenAPIRegistryImpl.register(this.requestBodies, "requestBodies", name, {
      ...body,
    });
  }

  public registerHeader(name: string, header: OpenAPIHeader): void {
    OpenAPIRegistryImpl.register(this.headers, "headers", name, { ...header });
  }

  public registerExample(name: string, example: OpenAPIExample): void {
    OpenAPIRegistryImpl.register(this.examples, "examples", name, {
      ...example,
    });
  }

  public registerSecurityScheme(
    name: string,
    scheme: OpenAPISecurityScheme,
  ): void {
    OpenAPIRegistryImpl.register(
      this.securitySchemes,
      "securitySchemes",
      name,
      {
        ...scheme,
      },
    );
  }

  public registerLink(name: string, link: OpenAPILink): void {
    OpenAPIRegistryImpl.register(this.links, "links", name, { ...link });
  }

  public registerCallback(
    name: string,
    callback: Readonly<Record<string, OpenAPIPathItem>>,
  ): void {
    OpenAPIRegistryImpl.register(this.callbacks, "callbacks", name, {
      ...callback,
    });
  }

  /**
   * Registers a tag.
   *
   * Re-registering a tag name conflicts, like every other component: quietly
   * keeping the first definition discarded corrected descriptions without a
   * word.
   */
  public registerTag(tag: OpenAPITag): void {
    if (this.tags.has(tag.name)) {
      throw new OpenAPIComponentConflictError("tags", tag.name);
    }
    this.tags.set(tag.name, Object.freeze({ ...tag }));
  }

  /** Registers a tag, replacing any existing one with the same name. */
  public setTag(tag: OpenAPITag): void {
    this.tags.set(tag.name, Object.freeze({ ...tag }));
  }

  public ref(section: ComponentSection, name: string): OpenAPIReference {
    return createComponentReference(section, name);
  }

  public hasComponent(section: ComponentSection, name: string): boolean {
    return this.componentMap(section)?.has(name) ?? false;
  }

  private componentMap(
    section: ComponentSection,
  ): ReadonlyMap<string, unknown> | undefined {
    switch (section) {
      case "schemas":
        return this.schemas;
      case "responses":
        return this.responses;
      case "parameters":
        return this.parameters;
      case "requestBodies":
        return this.requestBodies;
      case "headers":
        return this.headers;
      case "examples":
        return this.examples;
      case "securitySchemes":
        return this.securitySchemes;
      case "links":
        return this.links;
      case "callbacks":
        return this.callbacks;
      default:
        return undefined;
    }
  }

  public generate(): OpenAPIDocument {
    // A `Map` rather than an object literal: a route registered at the path
    // `__proto__` assigned to a literal sets the object's prototype instead
    // of adding an entry, so the path disappears from the document with no
    // error raised anywhere. `Object.fromEntries` defines own properties and
    // has no such hole.
    const paths = new Map<string, OpenAPIPathItem>();

    for (const route of this.routes.values()) {
      const operation: OpenAPIOperation = Object.freeze({
        ...route.operation,
        responses: Object.freeze({ ...route.operation.responses }),
      });
      // Operations keep their own parameters. Hoisting them to the path item
      // makes them apply to every method on that path, so two methods with
      // different parameters overwrote one another.
      //
      // The method is lower-cased here as well as in the cache key: a path
      // item field is defined in lower case, and `GET` would emit a field no
      // consumer recognises while still colliding on the key.
      paths.set(
        route.path,
        Object.freeze({
          ...(paths.get(route.path) ?? {}),
          [route.method.toLowerCase()]: operation,
        }),
      );
    }

    const components: Record<string, unknown> = {};
    const componentMaps: readonly [string, ReadonlyMap<string, unknown>][] = [
      ["schemas", this.schemas],
      ["responses", this.responses],
      ["parameters", this.parameters],
      ["requestBodies", this.requestBodies],
      ["headers", this.headers],
      ["examples", this.examples],
      ["securitySchemes", this.securitySchemes],
      ["links", this.links],
      ["callbacks", this.callbacks],
    ];
    for (const [key, map] of componentMaps) {
      if (map.size > 0)
        components[key] = Object.freeze(Object.fromEntries(map));
    }

    return Object.freeze({
      openapi: this.version,
      info: Object.freeze({ ...this.info }),
      ...(this.servers.length > 0
        ? { servers: Object.freeze([...this.servers]) }
        : {}),
      paths: Object.freeze(Object.fromEntries(paths)),
      ...(Object.keys(components).length > 0
        ? { components: Object.freeze(components) }
        : {}),
      ...(this.security.length > 0
        ? { security: Object.freeze([...this.security]) }
        : {}),
      ...(this.tags.size > 0
        ? { tags: Object.freeze([...this.tags.values()]) }
        : {}),
    }) as OpenAPIDocument;
  }

  public clear(): void {
    this.info = DEFAULT_INFO;
    this.servers.length = 0;
    this.security.length = 0;
    for (const map of [
      this.routes,
      this.schemas,
      this.responses,
      this.parameters,
      this.requestBodies,
      this.headers,
      this.examples,
      this.securitySchemes,
      this.tags,
      this.links,
      this.callbacks,
    ]) {
      map.clear();
    }
  }
}
