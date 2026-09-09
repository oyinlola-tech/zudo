/**
 * zudojs-cli — Prompts Index
 */

export { promptProjectName } from "./project/project-name.prompt.js";
export { promptProjectType } from "./project/project-type.prompt.js";
export { promptConfirmation } from "./project/confirmation.prompt.js";

export { promptBackendArchitecture } from "./backend/backend-architecture.prompt.js";
export { promptDatabase } from "./backend/database.prompt.js";
export { promptApiStyle } from "./backend/api-style.prompt.js";

export { promptFramework } from "./frontend/framework.prompt.js";
export { promptFrontendArchitecture } from "./frontend/frontend-architecture.prompt.js";

export { promptPackageManager } from "./workspace/package-manager.prompt.js";

export {
  promptCapabilities,
  type CapabilityOption,
} from "./capabilities/capabilities.prompt.js";
