/**
 * Flutter frontend adapter.
 *
 * @module adapters/frontend/flutter
 */

import { execCommand } from "../../utils/utils.exec.js";
import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName } from "../../utils/utils.name.js";
import type {
  FrontendAdapter,
  FrontendGenerationContext,
  DependencyRequirement,
  ValidationResult,
} from "./frontendAdapter.type.js";

/**
 * Flutter adapter for mobile applications.
 */
export class FlutterAdapter implements FrontendAdapter {
  readonly name = "flutter";
  readonly framework = "flutter";

  async isAvailable(): Promise<boolean> {
    try {
      await execCommand("flutter", ["--version"], ".");
      return true;
    } catch {
      return false;
    }
  }

  async getLatestVersion(): Promise<string> {
    return "3";
  }

  /**
   * Converts a project name to a Flutter package name.
   *
   * `flutter create --project-name` only accepts lower_snake_case (a valid
   * Dart package identifier), while `zudojs create` accepts uppercase and
   * hyphens. Passing the raw name made `flutter create` fail outright, and
   * this adapter has no fallback template, so the whole run was rolled back.
   */
  static toFlutterProjectName(name: string): string {
    const snake = normalizeName(name).replace(/-/g, "_");
    if (snake === "") return "zudojs_app";
    return /^[0-9]/.test(snake) ? `app_${snake}` : snake;
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const { projectPath } = context;
    const org = "com.zudojs";

    await execCommand(
      "flutter",
      [
        "create",
        ".",
        "--org",
        org,
        "--project-name",
        context.project.name,
        "--platforms",
        "android,ios,web",
      ],
      projectPath,
    );
  }

  getDependencies(
    context: FrontendGenerationContext,
  ): readonly DependencyRequirement[] {
    // Flutter uses pub.dev, not npm
    return [];
  }

  async applyZudojsStructure(
    context: FrontendGenerationContext,
  ): Promise<void> {
    const structure = this.getStructure(context);
    await writeFileTree(context.projectPath, structure);
  }

  async generateIntegration(context: FrontendGenerationContext): Promise<void> {
    const integrationFiles = this.getIntegrationFiles(context);
    await writeFileTree(context.projectPath, integrationFiles);
  }

  async validate(
    context: FrontendGenerationContext,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      await execCommand("flutter", ["--version"], ".");
    } catch {
      errors.push(
        "Flutter SDK is not installed. Please install Flutter first.",
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private getStructure(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    return {
      "lib/core/.gitkeep": "",
      "lib/features/.gitkeep": "",
      "lib/models/.gitkeep": "",
      "lib/services/.gitkeep": "",
      "lib/utils/.gitkeep": "",
      "lib/widgets/.gitkeep": "",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.example"] = `API_URL=http://localhost:3000\n`;

      files["lib/services/api_client.dart"] = `import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  final String baseUrl;

  ApiClient({required this.baseUrl});

  Future<Map<String, dynamic>> get(String path) async {
    final response = await http.get(
      Uri.parse('\$baseUrl\$path'),
      headers: {'Content-Type': 'application/json'},
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('\$baseUrl\$path'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) async {
    final response = await http.put(
      Uri.parse('\$baseUrl\$path'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final response = await http.delete(
      Uri.parse('\$baseUrl\$path'),
      headers: {'Content-Type': 'application/json'},
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
`;

      files["lib/config/api_config.dart"] = `class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3000',
  );
}
`;
    }

    return files;
  }
}
