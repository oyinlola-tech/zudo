import type { ValidationConstraint } from "../validationConstraints/index.js";
import type { ValidationResult } from "../validationResult/validationResult.type.js";
import { checkConstraints } from "../validationConstraints/index.js";
import type { ValidationSchema } from "../validationSchema/validationSchema.core.js";
import { validate } from "../validationSchema/validationSchema.core.js";
import { ReadonlyValidationRegistry } from "./validationRegistry.readonly.js";

/** A named validation rule. */
export interface ValidationRule<T = unknown> {
  readonly name: string;
  readonly description?: string;
  readonly schema?: ValidationSchema<T>;
  readonly constraints?: readonly ValidationConstraint<T>[];
}

/** Options used when registering a validation rule. */
export interface ValidationRuleOptions {
  readonly overwrite?: boolean;
}

/** Normalizes registry keys. */
function normalizeRuleName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0)
    throw new TypeError("Validation rule name cannot be empty.");
  return normalized;
}

/** Registry of reusable validation schemas and constraints. */
export class ValidationRegistry {
  private readonly rules = new Map<string, ValidationRule>();

  public register<T>(
    rule: ValidationRule<T>,
    options: ValidationRuleOptions = {},
  ): this {
    const name = normalizeRuleName(rule.name);
    if (!options.overwrite && this.rules.has(name))
      throw new Error(`Validation rule "${name}" is already registered.`);
    if (!rule.schema && (!rule.constraints || rule.constraints.length === 0)) {
      throw new TypeError(
        `Validation rule "${name}" must define a schema or at least one constraint.`,
      );
    }
    this.rules.set(
      name,
      Object.freeze({
        ...rule,
        name,
        ...(rule.constraints
          ? { constraints: Object.freeze([...rule.constraints]) }
          : {}),
      }) as ValidationRule,
    );
    return this;
  }

  public registerSchema<T>(
    name: string,
    schema: ValidationSchema<T>,
    options: {
      readonly description?: string;
      readonly overwrite?: boolean;
    } = {},
  ): this {
    return this.register(
      { name, description: options.description, schema },
      options,
    );
  }

  public registerConstraints<T>(
    name: string,
    constraints: readonly ValidationConstraint<T>[],
    options: {
      readonly description?: string;
      readonly overwrite?: boolean;
    } = {},
  ): this {
    return this.register(
      { name, description: options.description, constraints },
      options,
    );
  }

  public get<T = unknown>(name: string): ValidationRule<T> | undefined {
    return this.rules.get(normalizeRuleName(name)) as
      ValidationRule<T> | undefined;
  }

  public require<T = unknown>(name: string): ValidationRule<T> {
    const rule = this.get<T>(name);
    if (!rule) throw new Error(`Validation rule "${name}" is not registered.`);
    return rule;
  }

  public has(name: string): boolean {
    return this.rules.has(normalizeRuleName(name));
  }

  public unregister(name: string): boolean {
    return this.rules.delete(normalizeRuleName(name));
  }

  public names(): readonly string[] {
    return Object.freeze([...this.rules.keys()]);
  }

  public entries(): readonly ValidationRule[] {
    return Object.freeze([...this.rules.values()]);
  }

  public get size(): number {
    return this.rules.size;
  }

  public clear(): void {
    this.rules.clear();
  }

  /**
   * Validate a value against a registered rule.
   *
   * Constraints receive whatever the caller passed, which at a trust boundary
   * is arbitrary JSON. `checkConstraints` guards and catches internally, so a
   * wrong-typed value reports as a validation failure rather than escaping as
   * a `TypeError` and turning a 400 into a 500.
   */
  public validate<T>(name: string, value: unknown): ValidationResult<T> {
    const rule = this.require<T>(name);
    if (rule.schema) return validate(rule.schema, value);
    if (rule.constraints && rule.constraints.length > 0)
      return checkConstraints(rule.constraints, value as T);
    throw new TypeError(
      `Validation rule "${name}" has no validation implementation.`,
    );
  }

  public clone(): ValidationRegistry {
    const registry = new ValidationRegistry();
    for (const rule of this.rules.values()) registry.register(rule);
    return registry;
  }

  public extend(
    source: ValidationRegistry,
    options: ValidationRuleOptions = {},
  ): this {
    for (const rule of source.entries()) this.register(rule, options);
    return this;
  }

  public readonly(): ReadonlyValidationRegistry {
    return new ReadonlyValidationRegistry(this);
  }
}

/** Creates an empty validation registry. */
export function createValidationRegistry(): ValidationRegistry {
  return new ValidationRegistry();
}

/** Creates a registry from an initial collection of rules. */
export function createRegistryFromRules(
  rules: readonly ValidationRule[],
): ValidationRegistry {
  const registry = new ValidationRegistry();
  for (const rule of rules) registry.register(rule);
  return registry;
}
