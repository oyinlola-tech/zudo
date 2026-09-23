/**
 * Plugin dependency declaration.
 */
export interface PluginDependency {
  readonly name: string;

  readonly version?: string;

  /**
   * When `true`, a missing plugin of this name is skipped instead of
   * failing `start()`; when it is registered, the declaring plugin still
   * starts after it. Equivalent to listing it in `optionalDependencies`.
   */
  readonly optional?: boolean;
}
