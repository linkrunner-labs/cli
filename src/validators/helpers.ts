import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import type { ValidationResult, ProjectPaths } from "../types/index.js";

// --- ValidationResult constructors ---

export function pass(
  id: string,
  name: string,
  message: string,
  opts?: { docsUrl?: string }
): ValidationResult {
  return {
    id,
    name,
    status: "pass",
    severity: "error",
    message,
    autoFixable: false,
    ...(opts?.docsUrl && { docsUrl: opts.docsUrl }),
  };
}

export function warn(
  id: string,
  name: string,
  message: string,
  opts?: { fix?: string; autoFixable?: boolean; docsUrl?: string }
): ValidationResult {
  return {
    id,
    name,
    status: "warn",
    severity: "warn",
    message,
    autoFixable: opts?.autoFixable ?? false,
    ...(opts?.fix && { fix: opts.fix }),
    ...(opts?.docsUrl && { docsUrl: opts.docsUrl }),
  };
}

export function error(
  id: string,
  name: string,
  message: string,
  opts?: { fix?: string; autoFixable?: boolean; docsUrl?: string }
): ValidationResult {
  return {
    id,
    name,
    status: "error",
    severity: "error",
    message,
    autoFixable: opts?.autoFixable ?? false,
    ...(opts?.fix && { fix: opts.fix }),
    ...(opts?.docsUrl && { docsUrl: opts.docsUrl }),
  };
}

// --- File utilities ---

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function readFileContent(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

export function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// --- Version comparison ---

export function semverGte(version: string, min: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^[\^~>=<\s]+/, "")
      .split(".")
      .map(Number);
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

// --- Path resolution ---

export function resolveAndroidPaths(androidDir: string): ProjectPaths {
  const paths: ProjectPaths = { root: androidDir };

  const manifestCandidates = [
    join(androidDir, "app", "src", "main", "AndroidManifest.xml"),
    join(androidDir, "src", "main", "AndroidManifest.xml"),
  ];
  for (const m of manifestCandidates) {
    if (existsSync(m)) {
      paths.androidManifest = m;
      break;
    }
  }

  const gradleCandidates = [
    join(androidDir, "app", "build.gradle"),
    join(androidDir, "app", "build.gradle.kts"),
    join(androidDir, "build.gradle"),
    join(androidDir, "build.gradle.kts"),
  ];
  for (const g of gradleCandidates) {
    if (existsSync(g)) {
      paths.buildGradle = g;
      break;
    }
  }

  const wrapperPath = join(
    androidDir,
    "gradle",
    "wrapper",
    "gradle-wrapper.properties"
  );
  if (existsSync(wrapperPath)) paths.gradleWrapper = wrapperPath;

  const settingsCandidates = [
    join(androidDir, "settings.gradle"),
    join(androidDir, "settings.gradle.kts"),
  ];
  for (const s of settingsCandidates) {
    if (existsSync(s)) {
      paths.settingsGradle = s;
      break;
    }
  }

  return paths;
}

export function resolveIosPaths(
  iosDir: string,
  extraPlistCandidates?: string[]
): ProjectPaths {
  const paths: ProjectPaths = { root: iosDir };

  const plistCandidates = [
    join(iosDir, "Runner", "Info.plist"),
    ...(extraPlistCandidates ?? []),
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
  } catch {
    /* ignore */
  }
  for (const p of plistCandidates) {
    if (existsSync(p)) {
      paths.infoPlist = p;
      break;
    }
  }

  const podfilePath = join(iosDir, "Podfile");
  if (existsSync(podfilePath)) paths.podfile = podfilePath;

  try {
    const entries = Bun.spawnSync([
      "find",
      iosDir,
      "-name",
      "*.entitlements",
      "-maxdepth",
      "3",
    ])
      .stdout.toString()
      .split("\n")
      .filter(Boolean);
    if (entries.length > 0 && entries[0]) paths.entitlements = entries[0];
  } catch {
    /* ignore */
  }

  return paths;
}
