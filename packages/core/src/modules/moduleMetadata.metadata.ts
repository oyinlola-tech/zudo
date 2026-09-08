import type { ModuleId } from "./module.js";
import type { Environment } from "@zudojs/constants";
import { InvalidModuleDefinitionError } from "./moduleError/moduleError.registration.js";

/** Environment in which a module is intended to run. */
export type ModuleEnvironment = Environment;

/** Category describing the role of a module. */
export type ModuleCategory =
  | "application"
  | "infrastructure"
  | "domain"
  | "integration"
  | "transport"
  | "observability"
  | "security"
  | "system"
  | "custom";

/** Metadata describing a Zudojs module. */
export interface ModuleMetadata {
  readonly description?: string;
  readonly author?: string;
  readonly homepage?: string;
  readonly repository?: string;
  readonly category?: ModuleCategory;
  readonly tags?: readonly string[];
  readonly environments?: readonly ModuleEnvironment[];
  readonly experimental?: boolean;
  readonly deprecated?: boolean;
  readonly deprecationMessage?: string;
  readonly replacement?: ModuleId;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface ModuleMetadataOptions extends ModuleMetadata {}

function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTags(
  tags: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!tags || tags.length === 0) return undefined;
  const normalized = new Set<string>();
  for (const tag of tags) {
    const value = tag.trim();
    if (value.length > 0) normalized.add(value);
  }
  if (normalized.size === 0) return undefined;
  return Object.freeze([...normalized]);
}

function normalizeEnvironments(
  environments: readonly ModuleEnvironment[] | undefined,
): readonly ModuleEnvironment[] | undefined {
  if (!environments || environments.length === 0) return undefined;
  return Object.freeze([...new Set(environments)]);
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateModuleMetadata(metadata: ModuleMetadata): void {
  if (
    metadata.deprecated &&
    metadata.deprecationMessage === undefined &&
    metadata.replacement === undefined
  ) {
    throw new InvalidModuleDefinitionError(
      "Deprecated modules should provide either a deprecationMessage or replacement module.",
    );
  }
  if (metadata.homepage && !isValidUrl(metadata.homepage))
    throw new InvalidModuleDefinitionError(
      `Invalid module homepage URL: ${metadata.homepage}`,
    );
  if (metadata.repository && !isValidUrl(metadata.repository))
    throw new InvalidModuleDefinitionError(
      `Invalid module repository URL: ${metadata.repository}`,
    );
}

/** Creates immutable module metadata. */
export function createModuleMetadata(
  options: ModuleMetadataOptions = {},
): ModuleMetadata {
  const metadata: ModuleMetadata = {
    description: normalizeOptionalString(options.description),
    author: normalizeOptionalString(options.author),
    homepage: normalizeOptionalString(options.homepage),
    repository: normalizeOptionalString(options.repository),
    category: options.category,
    tags: normalizeTags(options.tags),
    environments: normalizeEnvironments(options.environments),
    experimental: options.experimental ?? false,
    deprecated: options.deprecated ?? false,
    deprecationMessage: normalizeOptionalString(options.deprecationMessage),
    replacement: normalizeOptionalString(options.replacement),
    extra: options.extra ? Object.freeze({ ...options.extra }) : undefined,
  };
  validateModuleMetadata(metadata);
  return Object.freeze(metadata);
}

/**
 * Removes keys whose value is undefined so spreading a metadata
 * object cannot clobber defined values with undefined.
 */
function withoutUndefinedValues(
  metadata: ModuleMetadata | undefined,
): Partial<ModuleMetadata> {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as Partial<ModuleMetadata>;
}

/** Merges two metadata objects. Values from `override` take precedence. */
export function mergeModuleMetadata(
  base?: ModuleMetadata,
  override?: ModuleMetadata,
): ModuleMetadata {
  if (!base && !override) return createModuleMetadata();
  return createModuleMetadata({
    ...withoutUndefinedValues(base),
    ...withoutUndefinedValues(override),
    tags: [...(base?.tags ?? []), ...(override?.tags ?? [])],
    environments: override?.environments ?? base?.environments,
    extra: { ...(base?.extra ?? {}), ...(override?.extra ?? {}) },
  });
}

/** Determines whether a module is enabled for an environment. */
export function isModuleEnabledForEnvironment(
  metadata: ModuleMetadata | undefined,
  environment: ModuleEnvironment,
): boolean {
  if (!metadata?.environments || metadata.environments.length === 0)
    return true;
  return metadata.environments.includes(environment);
}

/** Determines whether a module is deprecated. */
export function isModuleDeprecated(
  metadata: ModuleMetadata | undefined,
): boolean {
  return metadata?.deprecated === true;
}

/** Determines whether a module is experimental. */
export function isModuleExperimental(
  metadata: ModuleMetadata | undefined,
): boolean {
  return metadata?.experimental === true;
}

/** Creates a compact metadata object suitable for diagnostics. */
export function getModuleMetadataSummary(
  metadata?: ModuleMetadata,
): Readonly<Record<string, unknown>> {
  if (!metadata) return {};
  return Object.freeze({
    description: metadata.description,
    author: metadata.author,
    category: metadata.category,
    tags: metadata.tags,
    environments: metadata.environments,
    experimental: metadata.experimental,
    deprecated: metadata.deprecated,
    replacement: metadata.replacement,
  });
}
