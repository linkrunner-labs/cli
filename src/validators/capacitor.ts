import { join } from "path";
import type { ValidationResult } from "../types/index.js";
import { DOC_LINKS } from "../config/constants.js";
import { validateAndroid } from "./android.js";
import { validateIos } from "./ios.js";
import {
  pass,
  warn,
  error,
  fileExists,
  readJsonSafe,
  resolveAndroidPaths,
  resolveIosPaths,
} from "./helpers.js";

export function validateCapacitor(projectRoot: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  const packageJsonPath = join(projectRoot, "package.json");
  const pkg = fileExists(packageJsonPath)
    ? readJsonSafe(packageJsonPath)
    : null;
  const deps = pkg?.dependencies as Record<string, string> | undefined;
  const devDeps = pkg?.devDependencies as Record<string, string> | undefined;

  // Check 1: capacitor-linkrunner in package.json
  const capLinkrunnerVersion =
    deps?.["capacitor-linkrunner"] ?? devDeps?.["capacitor-linkrunner"];

  if (!capLinkrunnerVersion) {
    results.push(
      error(
        "capacitor-sdk-installed",
        "Capacitor Linkrunner SDK installed",
        "capacitor-linkrunner package not found in package.json",
        {
          fix: "Run: npm install capacitor-linkrunner",
          autoFixable: true,
          docsUrl: DOC_LINKS.capacitor,
        }
      )
    );
  } else {
    results.push(
      pass(
        "capacitor-sdk-installed",
        "Capacitor Linkrunner SDK installed",
        "capacitor-linkrunner package found in package.json"
      )
    );
  }

  // Check 2: Capacitor sync check (android/ and ios/ dirs exist)
  const androidDir = join(projectRoot, "android");
  const iosDir = join(projectRoot, "ios");
  const hasAndroid = fileExists(androidDir);
  const hasIos = fileExists(iosDir);

  if (!hasAndroid && !hasIos) {
    results.push(
      warn(
        "capacitor-sync",
        "Capacitor native projects synced",
        "Neither android/ nor ios/ directory found. Capacitor sync may not have been run.",
        {
          fix: "Run: npx cap sync",
          autoFixable: true,
          docsUrl: DOC_LINKS.capacitor,
        }
      )
    );
  } else {
    results.push(
      pass(
        "capacitor-sync",
        "Capacitor native projects synced",
        `Native project directories found: ${[hasAndroid && "android", hasIos && "ios"].filter(Boolean).join(", ")}`
      )
    );
  }

  // Inherited: Android checks
  if (hasAndroid) {
    const androidPaths = resolveAndroidPaths(androidDir);
    const androidResults = validateAndroid(androidPaths, "capacitor");
    results.push(...androidResults);
  }

  // Inherited: iOS checks
  if (hasIos) {
    const iosPaths = resolveIosPaths(iosDir, [
      join(iosDir, "App", "Info.plist"),
    ]);
    const iosResults = validateIos(iosPaths, "capacitor");
    results.push(...iosResults);
  }

  return results;
}
