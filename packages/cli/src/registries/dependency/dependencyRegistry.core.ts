/**
 * zudojs-cli — Dependency Registry
 *
 * Registry for tracking and managing project dependencies.
 */

import { CLIValidationError } from "../../errors/index.js";

export interface DependencyRecord {
  readonly name: string;
  readonly version: string;
  readonly type: "dependency" | "devDependency";
  readonly source: string;
}

export class DependencyRegistry {
  private readonly dependencies = new Map<string, DependencyRecord>();

  /**
   * Records a dependency.
   *
   * A second record for the same package used to overwrite the first one
   * silently, which hid version disagreements between two callers. Use
   * {@link replace} when overwriting is the intent.
   */
  add(record: DependencyRecord): void {
    const existing = this.dependencies.get(record.name);

    if (existing !== undefined) {
      throw new CLIValidationError(
        `Dependency "${record.name}" is already registered as ${existing.version} (${existing.source}). Use replace() to override it.`,
      );
    }

    this.dependencies.set(record.name, record);
  }

  /** Records a dependency, replacing any record of the same name. */
  replace(record: DependencyRecord): void {
    this.dependencies.set(record.name, record);
  }

  addMany(records: readonly DependencyRecord[]): void {
    for (const record of records) {
      this.add(record);
    }
  }

  get(name: string): DependencyRecord | undefined {
    return this.dependencies.get(name);
  }

  getAll(): readonly DependencyRecord[] {
    return Array.from(this.dependencies.values());
  }

  getByType(type: "dependency" | "devDependency"): readonly DependencyRecord[] {
    return this.getAll().filter((d) => d.type === type);
  }

  remove(name: string): boolean {
    return this.dependencies.delete(name);
  }

  clear(): void {
    this.dependencies.clear();
  }

  get names(): readonly string[] {
    return Array.from(this.dependencies.keys());
  }
}
