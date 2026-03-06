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

const KNOWN_PLUGIN_KEYS = new Set(["userTrackingPermission", "debug", "disableIdfa"]);

export function validateExpo(projectRoot: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  const packageJsonPath = join(projectRoot, "package.json");
  const pkg = existsSync(packageJsonPath) ? readJsonSafe(packageJsonPath) : null;
  const deps = pkg?.dependencies as Record<string, string> | undefined;
  const devDeps = pkg?.devDependencies as Record<string, string> | undefined;

  // Check 1: rn-linkrunner in package.json
  const rnLinkrunnerVersion = deps?.["rn-linkrunner"] ?? devDeps?.["rn-linkrunner"];

  if (!rnLinkrunnerVersion) {
    results.push({
      id: "expo-rn-sdk-installed",
      name: "rn-linkrunner SDK installed",
      status: "error",
      severity: "error",
      message: "rn-linkrunner package not found in package.json",
      fix: "Run: npm install rn-linkrunner",
      autoFixable: true,
      docsUrl: DOC_LINKS.expo,
    });
  } else {
    results.push({
      id: "expo-rn-sdk-installed",
      name: "rn-linkrunner SDK installed",
      status: "pass",
      severity: "error",
      message: "rn-linkrunner package found in package.json",
      autoFixable: false,
    });

    // SDK version check
    const cleanVersion = rnLinkrunnerVersion.replace(/^[\^~>=<\s]+/, "");
    if (!semverGte(cleanVersion, MIN_SDK_VERSIONS["react-native"])) {
      results.push({
        id: "expo-rn-sdk-version",
        name: "rn-linkrunner SDK version",
        status: "warn",
        severity: "warn",
        message: `rn-linkrunner version ${cleanVersion} is below minimum recommended ${MIN_SDK_VERSIONS["react-native"]}`,
        fix: "Run: npm install rn-linkrunner@latest",
        autoFixable: true,
        docsUrl: DOC_LINKS.expo,
      });
    } else {
      results.push({
        id: "expo-rn-sdk-version",
        name: "rn-linkrunner SDK version",
        status: "pass",
        severity: "warn",
        message: `rn-linkrunner version ${cleanVersion} is up to date`,
        autoFixable: false,
      });
    }
  }

  // Check 2: expo-linkrunner in package.json
  const expoLinkrunnerVersion = deps?.["expo-linkrunner"] ?? devDeps?.["expo-linkrunner"];

  if (!expoLinkrunnerVersion) {
    results.push({
      id: "expo-plugin-installed",
      name: "expo-linkrunner plugin installed",
      status: "error",
      severity: "error",
      message: "expo-linkrunner package not found in package.json",
      fix: "Run: npx expo install expo-linkrunner",
      autoFixable: true,
      docsUrl: DOC_LINKS.expo,
    });
  } else {
    results.push({
      id: "expo-plugin-installed",
      name: "expo-linkrunner plugin installed",
      status: "pass",
      severity: "error",
      message: "expo-linkrunner package found in package.json",
      autoFixable: false,
    });
  }

  // Check 3: expo-linkrunner in app.json plugins
  const appJsonPath = join(projectRoot, "app.json");
  const appJson = existsSync(appJsonPath) ? readJsonSafe(appJsonPath) : null;
  const expoConfig = appJson?.expo as Record<string, unknown> | undefined;
  const plugins = expoConfig?.plugins as unknown[] | undefined;

  let pluginEntry: unknown = null;
  if (plugins && Array.isArray(plugins)) {
    pluginEntry = plugins.find((p) => {
      if (typeof p === "string") return p === "expo-linkrunner";
      if (Array.isArray(p) && p.length > 0) return p[0] === "expo-linkrunner";
      return false;
    });
  }

  if (!pluginEntry) {
    results.push({
      id: "expo-plugin-configured",
      name: "expo-linkrunner in app.json plugins",
      status: "error",
      severity: "error",
      message: "expo-linkrunner not found in expo.plugins array in app.json",
      fix: 'Add ["expo-linkrunner", {}] to the plugins array in app.json',
      autoFixable: false,
      docsUrl: DOC_LINKS.expo,
    });
  } else {
    results.push({
      id: "expo-plugin-configured",
      name: "expo-linkrunner in app.json plugins",
      status: "pass",
      severity: "error",
      message: "expo-linkrunner found in app.json plugins",
      autoFixable: false,
    });

    // Check 4: Plugin config has recognized keys
    if (Array.isArray(pluginEntry) && pluginEntry.length >= 2) {
      const config = pluginEntry[1] as Record<string, unknown> | undefined;
      if (config && typeof config === "object") {
        const unknownKeys = Object.keys(config).filter((k) => !KNOWN_PLUGIN_KEYS.has(k));
        if (unknownKeys.length > 0) {
          results.push({
            id: "expo-plugin-config",
            name: "expo-linkrunner plugin config",
            status: "warn",
            severity: "warn",
            message: `Unknown plugin config keys: ${unknownKeys.join(", ")}. Known keys: ${[...KNOWN_PLUGIN_KEYS].join(", ")}`,
            fix: "Check expo-linkrunner docs for valid configuration options",
            autoFixable: false,
            docsUrl: DOC_LINKS.expo,
          });
        } else {
          results.push({
            id: "expo-plugin-config",
            name: "expo-linkrunner plugin config",
            status: "pass",
            severity: "warn",
            message: "Plugin configuration keys are valid",
            autoFixable: false,
          });
        }
      }
    }
  }

  // Inherited: Android checks (only if android/ exists, Expo managed may not have it)
  const androidDir = join(projectRoot, "android");
  if (existsSync(androidDir)) {
    const androidPaths = resolveAndroidPaths(androidDir);
    const androidResults = validateAndroid(androidPaths, "expo");
    results.push(...androidResults);
  }

  // Inherited: iOS checks (only if ios/ exists)
  const iosDir = join(projectRoot, "ios");
  if (existsSync(iosDir)) {
    const iosPaths = resolveIosPaths(iosDir);
    const iosResults = validateIos(iosPaths, "expo");
    results.push(...iosResults);
  }

  return results;
}
