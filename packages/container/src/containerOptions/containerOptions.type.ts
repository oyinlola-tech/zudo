/**
 * Configuration options for the Zudojs dependency injection container.
 */

import type { ContainerLifecycleOptions } from "../containerLifecycle/containerLifecycle.core.js";
import type { ContainerRegistryOptions } from "../containerRegistry/containerRegistry.type.js";
import type { ResolutionOptions } from "../containerResolution/containerResolution.type.js";

/**
 * The subset of {@link ResolutionOptions} a container accepts at
 * construction time. Per-call plumbing (`cache`, `path`,
 * `allowRegistration`, `onInstanceCreated`) is managed by the container
 * itself and deliberately not configurable here.
 */
export type ContainerResolutionOptions = Pick<
  ResolutionOptions,
  "autoRegisterClasses" | "detectCircularDependencies" | "maxResolutionDepth"
>;

export interface ContainerOptions {
  readonly name?: string;
  readonly registry?: ContainerRegistryOptions;
  readonly lifecycle?: ContainerLifecycleOptions;
  readonly resolution?: ContainerResolutionOptions;
  readonly autoDispose?: boolean;
  readonly allowScopes?: boolean;
  readonly freezeRegistrations?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ResolvedContainerOptions {
  readonly name: string;
  readonly registry: ContainerRegistryOptions;
  readonly lifecycle: ContainerLifecycleOptions;
  readonly resolution: ContainerResolutionOptions;
  readonly autoDispose: boolean;
  readonly allowScopes: boolean;
  readonly freezeRegistrations: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export const DEFAULT_CONTAINER_NAME = "zudojs-container";
export const DEFAULT_AUTO_DISPOSE = true;
export const DEFAULT_ALLOW_SCOPES = true;
export const DEFAULT_FREEZE_REGISTRATIONS = false;

export const DEFAULT_RESOLUTION_OPTIONS: Required<
  Pick<
    ContainerResolutionOptions,
    "autoRegisterClasses" | "detectCircularDependencies" | "maxResolutionDepth"
  >
> = {
  autoRegisterClasses: true,
  detectCircularDependencies: true,
  maxResolutionDepth: 100,
};

export function resolveContainerOptions(
  options: ContainerOptions = {},
): ResolvedContainerOptions {
  const resolution: ContainerResolutionOptions = {
    ...options.resolution,
    autoRegisterClasses:
      options.resolution?.autoRegisterClasses ??
      DEFAULT_RESOLUTION_OPTIONS.autoRegisterClasses,
    detectCircularDependencies:
      options.resolution?.detectCircularDependencies ??
      DEFAULT_RESOLUTION_OPTIONS.detectCircularDependencies,
    maxResolutionDepth:
      options.resolution?.maxResolutionDepth ??
      DEFAULT_RESOLUTION_OPTIONS.maxResolutionDepth,
  };
  validateResolutionOptions(resolution);
  const metadata = options.metadata
    ? Object.freeze({ ...options.metadata })
    : Object.freeze({});
  return Object.freeze({
    name: options.name ?? DEFAULT_CONTAINER_NAME,
    registry: Object.freeze({ ...(options.registry ?? {}) }),
    lifecycle: Object.freeze({ ...(options.lifecycle ?? {}) }),
    resolution: Object.freeze({ ...resolution }),
    autoDispose: options.autoDispose ?? DEFAULT_AUTO_DISPOSE,
    allowScopes: options.allowScopes ?? DEFAULT_ALLOW_SCOPES,
    freezeRegistrations:
      options.freezeRegistrations ?? DEFAULT_FREEZE_REGISTRATIONS,
    metadata,
  });
}

export function validateResolutionOptions(
  options: ContainerResolutionOptions,
): void {
  if (
    options.maxResolutionDepth !== undefined &&
    (!Number.isInteger(options.maxResolutionDepth) ||
      options.maxResolutionDepth <= 0)
  ) {
    throw new RangeError(
      "Container maxResolutionDepth must be a positive integer.",
    );
  }
}

export function allowsContainerScopes(
  options: ResolvedContainerOptions,
): boolean {
  return options.allowScopes;
}
export function shouldAutoDisposeContainer(
  options: ResolvedContainerOptions,
): boolean {
  return options.autoDispose;
}
export function canModifyRegistrations(
  options: ResolvedContainerOptions,
): boolean {
  return !options.freezeRegistrations;
}
