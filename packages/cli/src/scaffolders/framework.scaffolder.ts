/**
 * zudojs-cli — Framework Scaffolders
 *
 * Invokes official framework scaffolders to create projects.
 */

import { execCommand } from "../utils/utils.exec.js";

export interface ScaffolderResult {
  readonly success: boolean;
  readonly path: string;
  readonly error?: string;
}

export abstract class FrameworkScaffolder {
  abstract readonly name: string;
  abstract readonly command: string;
  abstract readonly args: string[];

  async scaffold(targetPath: string): Promise<ScaffolderResult> {
    try {
      await execCommand(this.command, this.args, targetPath, {
        // Suppress interactive prompts from create-* tools.
        env: { ...process.env, CI: "1" },
      });
      return { success: true, path: targetPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, path: targetPath, error: message };
    }
  }
}

export class ViteReactScaffolder extends FrameworkScaffolder {
  readonly name = "react-vite";
  readonly command = "npm";
  readonly args = ["create", "vite@latest", ".", "--", "--template", "react-ts"];
}

export class ViteVueScaffolder extends FrameworkScaffolder {
  readonly name = "vue-vite";
  readonly command = "npm";
  readonly args = ["create", "vite@latest", ".", "--", "--template", "vue-ts"];
}

export class NextScaffolder extends FrameworkScaffolder {
  readonly name = "next";
  readonly command = "npx";
  readonly args = [
    "create-next-app@latest",
    ".",
    "--typescript",
    "--no-eslint",
    "--no-tailwind",
    "--no-src-dir",
    "--no-app",
  ];
}

export class NuxtScaffolder extends FrameworkScaffolder {
  readonly name = "nuxt";
  readonly command = "npx";
  readonly args = ["nuxi@latest", "init", "."];
}

export class AngularScaffolder extends FrameworkScaffolder {
  readonly name = "angular";
  readonly command = "npx";
  readonly args = [
    "@angular/cli@latest",
    "new",
    ".",
    "--skip-git",
    "--skip-install",
    "--routing",
    "--style",
    "css",
  ];
}

export class AstroScaffolder extends FrameworkScaffolder {
  readonly name = "astro";
  readonly command = "npm";
  readonly args = ["create", "astro@latest", ".", "--", "--template", "minimal"];
}

export class SvelteScaffolder extends FrameworkScaffolder {
  readonly name = "svelte";
  readonly command = "npm";
  readonly args = ["create", "vite@latest", ".", "--", "--template", "svelte-ts"];
}

export class SvelteKitScaffolder extends FrameworkScaffolder {
  readonly name = "sveltekit";
  readonly command = "npm";
  readonly args = ["create", "svelte@latest", "."];
}

export class VanillaScaffolder extends FrameworkScaffolder {
  readonly name = "vanilla";
  readonly command = "npm";
  readonly args = ["create", "vite@latest", ".", "--", "--template", "vanilla-ts"];
}

export class FlutterScaffolder extends FrameworkScaffolder {
  readonly name = "flutter";
  readonly command = "flutter";
  readonly args = ["create", ".", "--platforms", "ios,android,web"];
}

export class ReactNativeScaffolder extends FrameworkScaffolder {
  readonly name = "react-native";
  readonly command = "npx";
  readonly args = ["react-native@latest", "init", "."];
}
