/**
 * @zudojs/container
 *
 * Dependency injection container with token-based registration for the Zudojs framework.
 */

export * from "./containerCore/index.js";
export * from "./containerLifecycle/index.js";
export * from "./containerOptions/index.js";
export * from "./containerProvider/index.js";
export * from "./containerRegistration/index.js";
export * from "./containerRegistry/index.js";
export * from "./containerResolution/index.js";
export * from "./containerScope/index.js";
export * from "./containerToken/index.js";

// Error classes the container throws but that live in @zudojs/errors,
// re-exported so `instanceof` checks need only this package.
export {
  CircularDependencyError,
  DuplicateRegistrationError,
  RegistrationNotFoundError,
  ProviderResolutionError,
} from "@zudojs/errors";
