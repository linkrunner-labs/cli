import { XMLParser } from "fast-xml-parser";
import plist from "plist";
import YAML from "yaml";
import { readFileSync } from "fs";

export function parseXml(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      allowBooleanAttributes: true,
    });
    return parser.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parsePlist(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const result = plist.parse(content);
    if (typeof result === "object" && result !== null) {
      return result as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseYaml(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const result = YAML.parse(content);
    if (typeof result === "object" && result !== null) {
      return result as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export interface GradleInfo {
  minSdkVersion?: number;
  compileSdkVersion?: number;
  targetSdkVersion?: number;
  dependencies: string[];
  repositories: string[];
}

export function parseGradle(filePath: string): GradleInfo | null {
  try {
    const content = readFileSync(filePath, "utf-8");

    const minSdkMatch = content.match(/minSdk(?:Version)?\s*[=:]\s*(\d+)/);
    const compileSdkMatch = content.match(
      /compileSdk(?:Version)?\s*[=:]\s*(\d+)/
    );
    const targetSdkMatch = content.match(
      /targetSdk(?:Version)?\s*[=:]\s*(\d+)/
    );

    const dependencies: string[] = [];
    const depRegex =
      /(?:implementation|api|compileOnly)\s*[("']([^"')]+)['")\s]/g;
    let depMatch;
    while ((depMatch = depRegex.exec(content)) !== null) {
      if (depMatch[1]) {
        dependencies.push(depMatch[1]);
      }
    }

    const repositories: string[] = [];
    const repoRegex =
      /(?:maven\s*\{[^}]*url\s*[=:]?\s*(?:uri\()?["']([^"']+)["']|mavenCentral\(\)|google\(\)|jcenter\(\))/g;
    let repoMatch;
    while ((repoMatch = repoRegex.exec(content)) !== null) {
      repositories.push(repoMatch[1] ?? repoMatch[0]);
    }

    return {
      minSdkVersion: minSdkMatch?.[1]
        ? parseInt(minSdkMatch[1], 10)
        : undefined,
      compileSdkVersion: compileSdkMatch?.[1]
        ? parseInt(compileSdkMatch[1], 10)
        : undefined,
      targetSdkVersion: targetSdkMatch?.[1]
        ? parseInt(targetSdkMatch[1], 10)
        : undefined,
      dependencies,
      repositories,
    };
  } catch {
    return null;
  }
}
