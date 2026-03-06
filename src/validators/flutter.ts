import { existsSync } from "fs";
import { basename, join } from "path";
import type { ValidationResult, ProjectPaths } from "../types/index.js";
import { DOC_LINKS, MIN_SDK_VERSIONS } from "../config/constants.js";
import { parseYaml } from "../utils/file-parser.js";
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

export function validateFlutter(projectRoot: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  const pubspecPath = join(projectRoot, "pubspec.yaml");
  const pubspec = existsSync(pubspecPath) ? parseYaml(pubspecPath) : null;

  // Check 1: linkrunner package in pubspec.yaml
  const deps = pubspec?.dependencies as Record<string, unknown> | undefined;
  const devDeps = pubspec?.dev_dependencies as Record<string, unknown> | undefined;
  const linkrunnerDep = deps?.linkrunner ?? devDeps?.linkrunner;

  if (!linkrunnerDep) {
    results.push({
      id: "flutter-sdk-installed",
      name: "Linkrunner SDK installed",
      status: "error",
      severity: "error",
      message: "linkrunner package not found in pubspec.yaml",
      fix: "Run: flutter pub add linkrunner",
      autoFixable: true,
      docsUrl: DOC_LINKS.flutter,
    });
  } else {
    results.push({
      id: "flutter-sdk-installed",
      name: "Linkrunner SDK installed",
      status: "pass",
      severity: "error",
      message: "linkrunner package found in pubspec.yaml",
      autoFixable: false,
    });

    // Check 2: SDK version is recent
    const versionStr = typeof linkrunnerDep === "string" ? linkrunnerDep : null;
    if (versionStr) {
      const cleanVersion = versionStr.replace(/^[\^~>=<\s]+/, "");
      if (!semverGte(cleanVersion, MIN_SDK_VERSIONS.flutter)) {
        results.push({
          id: "flutter-sdk-version",
          name: "Linkrunner SDK version",
          status: "warn",
          severity: "warn",
          message: `linkrunner version ${cleanVersion} is below minimum recommended ${MIN_SDK_VERSIONS.flutter}`,
          fix: "Run: flutter pub upgrade linkrunner",
          autoFixable: true,
          docsUrl: DOC_LINKS.flutter,
        });
      } else {
        results.push({
          id: "flutter-sdk-version",
          name: "Linkrunner SDK version",
          status: "pass",
          severity: "warn",
          message: `linkrunner version ${cleanVersion} is up to date`,
          autoFixable: false,
        });
      }
    }
  }

  // Inherited: Android checks
  const androidDir = join(projectRoot, "android");
  if (existsSync(androidDir)) {
    const androidPaths = resolveAndroidPaths(androidDir);
    const androidResults = validateAndroid(androidPaths, "flutter");
    results.push(...androidResults);
  }

  // Inherited: iOS checks
  const iosDir = join(projectRoot, "ios");
  if (existsSync(iosDir)) {
    const iosPaths = resolveIosPaths(iosDir);
    const iosResults = validateIos(iosPaths, "flutter");
    results.push(...iosResults);
  }

  return results;
}
