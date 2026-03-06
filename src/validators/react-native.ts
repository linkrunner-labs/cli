import { join } from "path";
import type { ValidationResult } from "../types/index.js";
import { DOC_LINKS, MIN_SDK_VERSIONS } from "../config/constants.js";
import { validateAndroid } from "./android.js";
import { validateIos } from "./ios.js";
import {
  pass,
  warn,
  error,
  fileExists,
  readJsonSafe,
  semverGte,
  resolveAndroidPaths,
  resolveIosPaths,
} from "./helpers.js";

export function validateReactNative(projectRoot: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  const packageJsonPath = join(projectRoot, "package.json");
  const pkg = fileExists(packageJsonPath)
    ? readJsonSafe(packageJsonPath)
    : null;
  const deps = pkg?.dependencies as Record<string, string> | undefined;
  const devDeps = pkg?.devDependencies as Record<string, string> | undefined;

  // Check 1: rn-linkrunner in package.json
  const rnLinkrunnerVersion =
    deps?.["rn-linkrunner"] ?? devDeps?.["rn-linkrunner"];

  if (!rnLinkrunnerVersion) {
    results.push(
      error(
        "rn-sdk-installed",
        "Linkrunner SDK installed",
        "rn-linkrunner package not found in package.json",
        {
          fix: "Run: npm install rn-linkrunner",
          autoFixable: true,
          docsUrl: DOC_LINKS["react-native"],
        }
      )
    );
  } else {
    results.push(
      pass(
        "rn-sdk-installed",
        "Linkrunner SDK installed",
        "rn-linkrunner package found in package.json"
      )
    );

    // Check 2: SDK version
    const cleanVersion = rnLinkrunnerVersion.replace(/^[\^~>=<\s]+/, "");
    if (!semverGte(cleanVersion, MIN_SDK_VERSIONS["react-native"])) {
      results.push(
        warn(
          "rn-sdk-version",
          "Linkrunner SDK version",
          `rn-linkrunner version ${cleanVersion} is below minimum recommended ${MIN_SDK_VERSIONS["react-native"]}`,
          {
            fix: "Run: npm install rn-linkrunner@latest",
            autoFixable: true,
            docsUrl: DOC_LINKS["react-native"],
          }
        )
      );
    } else {
      results.push(
        pass(
          "rn-sdk-version",
          "Linkrunner SDK version",
          `rn-linkrunner version ${cleanVersion} is up to date`
        )
      );
    }
  }

  // Check 3: ios/Pods directory exists
  const iosDir = join(projectRoot, "ios");
  if (fileExists(iosDir)) {
    const podsDir = join(iosDir, "Pods");
    if (!fileExists(podsDir)) {
      results.push(
        warn(
          "rn-pods-installed",
          "CocoaPods installed",
          "ios/Pods directory not found. Pod install may not have been run.",
          {
            fix: "Run: cd ios && pod install",
            autoFixable: true,
            docsUrl: DOC_LINKS["react-native"],
          }
        )
      );
    } else {
      results.push(
        pass(
          "rn-pods-installed",
          "CocoaPods installed",
          "ios/Pods directory found"
        )
      );
    }
  }

  // Inherited: Android checks
  const androidDir = join(projectRoot, "android");
  if (fileExists(androidDir)) {
    const androidPaths = resolveAndroidPaths(androidDir);
    const androidResults = validateAndroid(androidPaths, "react-native");
    results.push(...androidResults);
  }

  // Inherited: iOS checks
  if (fileExists(iosDir)) {
    const iosPaths = resolveIosPaths(iosDir);
    const iosResults = validateIos(iosPaths, "react-native");
    results.push(...iosResults);
  }

  return results;
}
