import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import type { ValidationResult, ProjectPaths } from "../types/index.js";
import { DOC_LINKS } from "../config/constants.js";
import { validateAndroid } from "./android.js";
import { validateIos } from "./ios.js";

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
    join(iosDir, "App", "Info.plist"),
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

export function validateCapacitor(projectRoot: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  const packageJsonPath = join(projectRoot, "package.json");
  const pkg = existsSync(packageJsonPath) ? readJsonSafe(packageJsonPath) : null;
  const deps = pkg?.dependencies as Record<string, string> | undefined;
  const devDeps = pkg?.devDependencies as Record<string, string> | undefined;

  // Check 1: capacitor-linkrunner in package.json
  const capLinkrunnerVersion = deps?.["capacitor-linkrunner"] ?? devDeps?.["capacitor-linkrunner"];

  if (!capLinkrunnerVersion) {
    results.push({
      id: "capacitor-sdk-installed",
      name: "Capacitor Linkrunner SDK installed",
      status: "error",
      severity: "error",
      message: "capacitor-linkrunner package not found in package.json",
      fix: "Run: npm install capacitor-linkrunner",
      autoFixable: true,
      docsUrl: DOC_LINKS.capacitor,
    });
  } else {
    results.push({
      id: "capacitor-sdk-installed",
      name: "Capacitor Linkrunner SDK installed",
      status: "pass",
      severity: "error",
      message: "capacitor-linkrunner package found in package.json",
      autoFixable: false,
    });
  }

  // Check 2: Capacitor sync check (android/ and ios/ dirs exist)
  const androidDir = join(projectRoot, "android");
  const iosDir = join(projectRoot, "ios");
  const hasAndroid = existsSync(androidDir);
  const hasIos = existsSync(iosDir);

  if (!hasAndroid && !hasIos) {
    results.push({
      id: "capacitor-sync",
      name: "Capacitor native projects synced",
      status: "warn",
      severity: "warn",
      message: "Neither android/ nor ios/ directory found. Capacitor sync may not have been run.",
      fix: "Run: npx cap sync",
      autoFixable: true,
      docsUrl: DOC_LINKS.capacitor,
    });
  } else {
    results.push({
      id: "capacitor-sync",
      name: "Capacitor native projects synced",
      status: "pass",
      severity: "warn",
      message: `Native project directories found: ${[hasAndroid && "android", hasIos && "ios"].filter(Boolean).join(", ")}`,
      autoFixable: false,
    });
  }

  // Inherited: Android checks
  if (hasAndroid) {
    const androidPaths = resolveAndroidPaths(androidDir);
    const androidResults = validateAndroid(androidPaths, "capacitor");
    results.push(...androidResults);
  }

  // Inherited: iOS checks
  if (hasIos) {
    const iosPaths = resolveIosPaths(iosDir);
    const iosResults = validateIos(iosPaths, "capacitor");
    results.push(...iosResults);
  }

  return results;
}
