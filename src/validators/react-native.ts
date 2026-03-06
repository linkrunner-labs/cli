import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import type { ValidationResult, ProjectPaths } from "../types/index.js";
import { DOC_LINKS, MIN_SDK_VERSIONS } from "../config/constants.js";
import { validateAndroid } from "./android.js";
import { validateIos } from "./ios.js";

function semverGte(version: string, min: string): boolean {
  const parse = (v: string) => v.replace(/^[\^~>=<\s]+/, "").split(".").map(Number);
  const a = parse(version);
  const b = parse(min);
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveAndroidPaths(androidDir: string): ProjectPaths {
  const paths: ProjectPaths = { root: androidDir };

  const manifestCandidates = [
    join(androidDir, "app", "src", "main", "AndroidManifest.xml"),
    join(androidDir, "src", "main", "AndroidManifest.xml"),
  ];
  for (const m of manifestCandidates) {
    if (existsSync(m)) { paths.androidManifest = m; break; }
  }

  const gradleCandidates = [
    join(androidDir, "app", "build.gradle"),
    join(androidDir, "app", "build.gradle.kts"),
    join(androidDir, "build.gradle"),
    join(androidDir, "build.gradle.kts"),
  ];
  for (const g of gradleCandidates) {
    if (existsSync(g)) { paths.buildGradle = g; break; }
  }

  const wrapperPath = join(androidDir, "gradle", "wrapper", "gradle-wrapper.properties");
  if (existsSync(wrapperPath)) paths.gradleWrapper = wrapperPath;

  const settingsCandidates = [
    join(androidDir, "settings.gradle"),
    join(androidDir, "settings.gradle.kts"),
  ];
  for (const s of settingsCandidates) {
    if (existsSync(s)) { paths.settingsGradle = s; break; }
  }

  return paths;
}

function resolveIosPaths(iosDir: string): ProjectPaths {
  const paths: ProjectPaths = { root: iosDir };

  const plistCandidates = [
    join(iosDir, "Runner", "Info.plist"),
    join(iosDir, "Info.plist"),
  ];
  try {
    const entries = Bun.spawnSync(["ls", iosDir]).stdout.toString().split("\n");
    for (const entry of entries) {
      const name = entry.trim();
      if (name.endsWith(".xcodeproj")) {
        const appName = basename(name, ".xcodeproj");
        plistCandidates.unshift(join(iosDir, appName, "Info.plist"));
      }
    }
  } catch { /* ignore */ }
  for (const p of plistCandidates) {
    if (existsSync(p)) { paths.infoPlist = p; break; }
  }

  const podfilePath = join(iosDir, "Podfile");
  if (existsSync(podfilePath)) paths.podfile = podfilePath;

  try {
    const entries = Bun.spawnSync(["find", iosDir, "-name", "*.entitlements", "-maxdepth", "3"])
      .stdout.toString().split("\n").filter(Boolean);
    if (entries.length > 0 && entries[0]) paths.entitlements = entries[0];
  } catch { /* ignore */ }

  return paths;
}

export function validateReactNative(projectRoot: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  const packageJsonPath = join(projectRoot, "package.json");
  const pkg = existsSync(packageJsonPath) ? readJsonSafe(packageJsonPath) : null;
  const deps = pkg?.dependencies as Record<string, string> | undefined;
  const devDeps = pkg?.devDependencies as Record<string, string> | undefined;

  // Check 1: rn-linkrunner in package.json
  const rnLinkrunnerVersion = deps?.["rn-linkrunner"] ?? devDeps?.["rn-linkrunner"];

  if (!rnLinkrunnerVersion) {
    results.push({
      id: "rn-sdk-installed",
      name: "Linkrunner SDK installed",
      status: "error",
      severity: "error",
      message: "rn-linkrunner package not found in package.json",
      fix: "Run: npm install rn-linkrunner",
      autoFixable: true,
      docsUrl: DOC_LINKS["react-native"],
    });
  } else {
    results.push({
      id: "rn-sdk-installed",
      name: "Linkrunner SDK installed",
      status: "pass",
      severity: "error",
      message: "rn-linkrunner package found in package.json",
      autoFixable: false,
    });

    // Check 2: SDK version
    const cleanVersion = rnLinkrunnerVersion.replace(/^[\^~>=<\s]+/, "");
    if (!semverGte(cleanVersion, MIN_SDK_VERSIONS["react-native"])) {
      results.push({
        id: "rn-sdk-version",
        name: "Linkrunner SDK version",
        status: "warn",
        severity: "warn",
        message: `rn-linkrunner version ${cleanVersion} is below minimum recommended ${MIN_SDK_VERSIONS["react-native"]}`,
        fix: "Run: npm install rn-linkrunner@latest",
        autoFixable: true,
        docsUrl: DOC_LINKS["react-native"],
      });
    } else {
      results.push({
        id: "rn-sdk-version",
        name: "Linkrunner SDK version",
        status: "pass",
        severity: "warn",
        message: `rn-linkrunner version ${cleanVersion} is up to date`,
        autoFixable: false,
      });
    }
  }

  // Check 3: ios/Pods directory exists
  const iosDir = join(projectRoot, "ios");
  if (existsSync(iosDir)) {
    const podsDir = join(iosDir, "Pods");
    if (!existsSync(podsDir)) {
      results.push({
        id: "rn-pods-installed",
        name: "CocoaPods installed",
        status: "warn",
        severity: "warn",
        message: "ios/Pods directory not found. Pod install may not have been run.",
        fix: "Run: cd ios && pod install",
        autoFixable: true,
        docsUrl: DOC_LINKS["react-native"],
      });
    } else {
      results.push({
        id: "rn-pods-installed",
        name: "CocoaPods installed",
        status: "pass",
        severity: "warn",
        message: "ios/Pods directory found",
        autoFixable: false,
      });
    }
  }

  // Inherited: Android checks
  const androidDir = join(projectRoot, "android");
  if (existsSync(androidDir)) {
    const androidPaths = resolveAndroidPaths(androidDir);
    const androidResults = validateAndroid(androidPaths, "react-native");
    results.push(...androidResults);
  }

  // Inherited: iOS checks
  if (existsSync(iosDir)) {
    const iosPaths = resolveIosPaths(iosDir);
    const iosResults = validateIos(iosPaths, "react-native");
    results.push(...iosResults);
  }

  return results;
}
