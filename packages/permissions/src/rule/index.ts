/**
 * Rule matching, evaluation, and compilation for permission decisions.
 *
 * @module rule
 */

export {
  ruleMatches,
  patternStrMatches,
  evaluateRules,
  evaluateRulesSync,
} from "./rule.core.js";

export {
  compileRules,
  findMatchingRules,
  type RuleIndex,
} from "./ruleCompiler.js";
