import { join } from "path";
import type { ValidationResult } from "../types/index.js";
import { DOC_LINKS, MIN_SDK_VERSIONS } from "../config/constants.js";
import { parseYaml } from "../utils/file-parser.js";
import { validateAndroid } from "./android.js";
import { validateIos } from "./ios.js";
import {
  pass,
  warn,
  error,
  fileExists,
  semverGte,
  resolveAndroidPaths,
  resolveIosPaths,
} from "./helpers.js";

export function validateFlutter(projectRoot: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  const pubspecPath = join(projectRoot, "pubspec.yaml");
  const pubspec = fileExists(pubspecPath) ? parseYaml(pubspecPath) : null;

  // Check 1: linkrunner package in pubspec.yaml
  const deps = pubspec?.dependencies as Record<string, unknown> | undefined;
  const devDeps = pubspec?.dev_dependencies as
    | Record<string, unknown>
    | undefined;
  const linkrunnerDep = deps?.linkrunner ?? devDeps?.linkrunner;

  if (!linkrunnerDep) {
    results.push(
      error(
        "flutter-sdk-installed",
        "Linkrunner SDK installed",
        "linkrunner package not found in pubspec.yaml",
        {
          fix: "Run: flutter pub add linkrunner",
          autoFixable: true,
          docsUrl: DOC_LINKS.flutter,
        }
      )
    );
  } else {
    results.push(
      pass(
        "flutter-sdk-installed",
        "Linkrunner SDK installed",
        "linkrunner package found in pubspec.yaml"
      )
    );

    // Check 2: SDK version is recent
    const versionStr = typeof linkrunnerDep === "string" ? linkrunnerDep : null;
    if (versionStr) {
      const cleanVersion = versionStr.replace(/^[\^~>=<\s]+/, "");
      if (!semverGte(cleanVersion, MIN_SDK_VERSIONS.flutter)) {
        results.push(
          warn(
            "flutter-sdk-version",
            "Linkrunner SDK version",
            `linkrunner version ${cleanVersion} is below minimum recommended ${MIN_SDK_VERSIONS.flutter}`,
            {
              fix: "Run: flutter pub upgrade linkrunner",
              autoFixable: true,
              docsUrl: DOC_LINKS.flutter,
            }
          )
        );
      } else {
        results.push(
          pass(
            "flutter-sdk-version",
            "Linkrunner SDK version",
            `linkrunner version ${cleanVersion} is up to date`
          )
        );
      }
    }
  }

  // Inherited: Android checks
  const androidDir = join(projectRoot, "android");
  if (fileExists(androidDir)) {
    const androidPaths = resolveAndroidPaths(androidDir);
    const androidResults = validateAndroid(androidPaths, "flutter");
    results.push(...androidResults);
  }

  // Inherited: iOS checks
  const iosDir = join(projectRoot, "ios");
  if (fileExists(iosDir)) {
    const iosPaths = resolveIosPaths(iosDir);
    const iosResults = validateIos(iosPaths, "flutter");
    results.push(...iosResults);
  }

  return results;
}
