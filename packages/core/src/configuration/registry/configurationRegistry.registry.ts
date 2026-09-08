import { Configuration } from "../core/configuration.js";

import { normalizeConfigurationPath } from "../core/configurationPath.path.js";

import type { ConfigurationSource } from "../core/configurationSource.source.js";

/**
 * A named configuration section.
 *
 * Sections allow modules to expose configuration under a
 * predictable namespace.
 *
 * Example:
 *
 * auth
 * database
 * cache
 * messaging
 */
export interface ConfigurationSection {
  /**
   * Unique section name.
   */
  readonly name: string;

  /**
   * Configuration namespace/path represented by this section.
   */
  readonly path: string;

  /**
   * Optional description for documentation and diagnostics.
   */
  readonly description?: string;
}

/**
 * Options used when registering a configuration section.
 */
export interface ConfigurationSectionOptions {
  /**
   * Section name.
   */
  readonly name: string;

  /**
   * Configuration path represented by the section.
   *
   * Example:
   *
   * auth.jwt
   */
  readonly path?: string;

  /**
   * Optional description.
   */
  readonly description?: string;
}

/**
 * Registry containing configuration sources and sections
 * registered by the framework and application modules.
 *
 * The registry does not load configuration.
 */
export class ConfigurationRegistry {
  private readonly sources = new Map<string, ConfigurationSource>();

  private readonly sections = new Map<string, ConfigurationSection>();

  /**
   * Registers a configuration source.
   *
   * Source names must be unique.
   */
  public registerSource(source: ConfigurationSource): void {
    if (this.sources.has(source.name)) {
      throw new Error(
        `Configuration source "${source.name}" is already registered.`,
      );
    }

    this.sources.set(source.name, source);
  }

  /**
   * Registers multiple configuration sources.
   */
  public registerSources(sources: readonly ConfigurationSource[]): void {
    for (const source of sources) {
      this.registerSource(source);
    }
  }

  /**
   * Gets a registered configuration source.
   */
  public getSource(name: string): ConfigurationSource | undefined {
    return this.sources.get(name);
  }

  /**
   * Returns all registered configuration sources.
   */
  public getSources(): readonly ConfigurationSource[] {
    return [...this.sources.values()];
  }

  /**
   * Checks whether a source is registered.
   */
  public hasSource(name: string): boolean {
    return this.sources.has(name);
  }

  /**
   * Removes a registered source.
   */
  public removeSource(name: string): boolean {
    return this.sources.delete(name);
  }

  /**
   * Registers a named configuration section.
   */
  public registerSection(
    options: ConfigurationSectionOptions,
  ): ConfigurationSection {
    const name = options.name.trim();

    if (!name) {
      throw new Error("Configuration section name cannot be empty.");
    }

    if (this.sections.has(name)) {
      throw new Error(`Configuration section "${name}" is already registered.`);
    }

    const path = normalizeConfigurationPath(options.path ?? name);

    if (!path) {
      throw new Error(
        `Configuration path for section "${name}" cannot be empty.`,
      );
    }

    const section: ConfigurationSection = Object.freeze({
      name,
      path,
      description: options.description,
    });

    this.sections.set(name, section);

    return section;
  }

  /**
   * Gets a registered configuration section.
   */
  public getSection(name: string): ConfigurationSection | undefined {
    return this.sections.get(name);
  }

  /**
   * Returns all registered configuration sections.
   */
  public getSections(): readonly ConfigurationSection[] {
    return [...this.sections.values()];
  }

  /**
   * Checks whether a configuration section exists.
   */
  public hasSection(name: string): boolean {
    return this.sections.has(name);
  }

  /**
   * Removes a configuration section.
   */
  public removeSection(name: string): boolean {
    return this.sections.delete(name);
  }

  /**
   * Creates a scoped Configuration instance for
   * a registered section.
   *
   * Example:
   *
   * registry.getConfigurationSection(
   *   configuration,
   *   "database",
   * );
   */
  public getConfigurationSection(
    configuration: Configuration,
    name: string,
  ): Configuration {
    const section = this.sections.get(name);

    if (!section) {
      throw new Error(`Configuration section "${name}" is not registered.`);
    }

    return configuration.scope(section.path);
  }

  /**
   * Clears all registered sources.
   */
  public clearSources(): void {
    this.sources.clear();
  }

  /**
   * Clears all registered sections.
   */
  public clearSections(): void {
    this.sections.clear();
  }

  /**
   * Clears the complete registry.
   */
  public clear(): void {
    this.clearSources();
    this.clearSections();
  }

  /**
   * Returns the number of registered sources.
   */
  public sourceCount(): number {
    return this.sources.size;
  }

  /**
   * Returns the number of registered sections.
   */
  public sectionCount(): number {
    return this.sections.size;
  }
}

/**
 * Creates a new ConfigurationRegistry.
 */
export function createConfigurationRegistry(): ConfigurationRegistry {
  return new ConfigurationRegistry();
}
