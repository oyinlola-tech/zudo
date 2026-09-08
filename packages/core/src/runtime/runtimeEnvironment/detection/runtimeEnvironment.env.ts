import type { RuntimeEnvironmentVariables } from "../runtimeEnvironment.type.js";

export function detectCI(variables: RuntimeEnvironmentVariables): boolean {
  const explicit = variables.CI ?? variables.CONTINUOUS_INTEGRATION;

  if (isTruthyEnvironmentValue(explicit)) {
    return true;
  }

  if (variables.GITHUB_ACTIONS === "true") {
    return true;
  }

  if (variables.GITLAB_CI === "true") {
    return true;
  }

  if (variables.BUILDKITE === "true") {
    return true;
  }

  if (variables.CIRCLECI === "true") {
    return true;
  }

  if (variables.JENKINS_URL) {
    return true;
  }

  return false;
}

/**
 * Detects a container environment from the supplied variable
 * snapshot only, so callers that inject variables get deterministic
 * results.
 */
export function detectContainer(
  variables: RuntimeEnvironmentVariables,
): boolean {
  if (isTruthyEnvironmentValue(variables.CONTAINER)) {
    return true;
  }

  if (isTruthyEnvironmentValue(variables.DOCKER_CONTAINER)) {
    return true;
  }

  if (variables.KUBERNETES_SERVICE_HOST) {
    return true;
  }

  if (variables.container) {
    return true;
  }

  return false;
}

function isTruthyEnvironmentValue(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  return (
    value === "1" ||
    value === "true" ||
    value === "TRUE" ||
    value === "yes" ||
    value === "YES"
  );
}
