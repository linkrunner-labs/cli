import { existsSync, readFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import type { DetectedProject, ProjectPaths, ProjectType } from "../types/index.js";

const MAX_SEARCH_DEPTH = 10;

function findFileUpward(startDir: string, filename: string): string | null {
  let current = resolve(startDir);
  for (let i = 0; i < MAX_SEARCH_DEPTH; i++) {
    const candidate = join(current, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function findProjectRoot(startDir: string): string {
  const markers = [
    "package.json",
    "pubspec.yaml",
    "build.gradle",
    "build.gradle.kts",
  ];
  for (const marker of markers) {
    const found = findFileUpward(startDir, marker);
    if (found) {
      return dirname(found);
    }
  }
  return resolve(startDir);
}

function resolveAndroidPaths(root: string): Partial<ProjectPaths> {
  const androidDir = existsSync(join(root, "android")) ? join(root, "android") : root;
  const paths: Partial<ProjectPaths> = {};

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

  const wrapperCandidates = [
    join(androidDir, "gradle", "wrapper", "gradle-wrapper.properties"),
  ];
  for (const w of wrapperCandidates) {
    if (existsSync(w)) {
      paths.gradleWrapper = w;
      break;
    }
  }

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

function resolveIosPaths(root: string): Partial<ProjectPaths> {
  const iosDir = existsSync(join(root, "ios")) ? join(root, "ios") : root;
  const paths: Partial<ProjectPaths> = {};

  // Find Info.plist - could be in various subdirs
  const plistCandidates = [
    join(iosDir, "Runner", "Info.plist"),
    join(iosDir, "Info.plist"),
  ];
  // Also search for *.xcodeproj dirs to find the app name
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
    // ignore
  }
  for (const p of plistCandidates) {
    if (existsSync(p)) {
      paths.infoPlist = p;
      break;
    }
  }

  const podfilePath = join(iosDir, "Podfile");
  if (existsSync(podfilePath)) {
    paths.podfile = podfilePath;
  }

  // Find entitlements
  try {
    const entries = Bun.spawnSync(["find", iosDir, "-name", "*.entitlements", "-maxdepth", "3"])
      .stdout.toString()
      .split("\n")
      .filter(Boolean);
    if (entries.length > 0 && entries[0]) {
      paths.entitlements = entries[0];
    }
  } catch {
    // ignore
  }

  return paths;
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function getSdkVersion(type: ProjectType, paths: ProjectPaths): string | undefined {
  switch (type) {
    case "flutter": {
      if (!paths.pubspec) return undefined;
      const content = readFileSafe(paths.pubspec);
      if (!content) return undefined;
      const match = content.match(/linkrunner:\s*\^?([^\s\n]+)/);
      return match?.[1];
    }
    case "react-native":
    case "expo": {
      if (!paths.packageJson) return undefined;
      const pkg = readJsonSafe(paths.packageJson);
      if (!pkg) return undefined;
      const deps = pkg.dependencies as Record<string, string> | undefined;
      const version = deps?.["rn-linkrunner"];
      return version?.replace(/^[\^~]/, "");
    }
    case "ios": {
      if (!paths.podfile) return undefined;
      const content = readFileSafe(paths.podfile);
      if (!content) return undefined;
      const match = content.match(/pod\s+['"]linkrunner-ios['"],\s*['"]~>\s*([^'"]+)['"]/i);
      return match?.[1];
    }
    case "android": {
      if (!paths.buildGradle) return undefined;
      const content = readFileSafe(paths.buildGradle);
      if (!content) return undefined;
      const match = content.match(/io\.linkrunner:linkrunner:([^\s'"]+)/);
      return match?.[1];
    }
    case "capacitor":
    case "web": {
      if (!paths.packageJson) return undefined;
      const pkg = readJsonSafe(paths.packageJson);
      if (!pkg) return undefined;
      const deps = pkg.dependencies as Record<string, string> | undefined;
      const version = deps?.["linkrunner-web"] ?? deps?.["linkrunner-web-sdk"];
      return version?.replace(/^[\^~]/, "");
    }
  }
}

function detectType(root: string): { type: ProjectType; paths: ProjectPaths } | null {
  const packageJsonPath = join(root, "package.json");
  const pubspecPath = join(root, "pubspec.yaml");
  const hasPackageJson = existsSync(packageJsonPath);
  const hasPubspec = existsSync(pubspecPath);

  const basePaths: ProjectPaths = { root };

  // Check for Expo (has expo in dependencies or app.json/app.config.js)
  if (hasPackageJson) {
    basePaths.packageJson = packageJsonPath;
    const pkg = readJsonSafe(packageJsonPath);

    if (pkg) {
      const deps = pkg.dependencies as Record<string, string> | undefined;
      const devDeps = pkg.devDependencies as Record<string, string> | undefined;

      // Check for app.json or app.config.js (Expo markers)
      const appJsonPath = join(root, "app.json");
      const appConfigPath = join(root, "app.config.js");
      const appConfigTsPath = join(root, "app.config.ts");

      if (existsSync(appJsonPath)) basePaths.appJson = appJsonPath;
      if (existsSync(appConfigPath)) basePaths.appConfig = appConfigPath;
      else if (existsSync(appConfigTsPath)) basePaths.appConfig = appConfigTsPath;

      const hasExpo = !!(deps?.expo || devDeps?.expo);
      if (hasExpo) {
        const iosPaths = resolveIosPaths(root);
        const androidPaths = resolveAndroidPaths(root);
        return {
          type: "expo",
          paths: { ...basePaths, ...iosPaths, ...androidPaths },
        };
      }

      // Check for React Native
      const hasReactNative = !!(deps?.["react-native"] || devDeps?.["react-native"]);
      if (hasReactNative) {
        const iosPaths = resolveIosPaths(root);
        const androidPaths = resolveAndroidPaths(root);
        return {
          type: "react-native",
          paths: { ...basePaths, ...iosPaths, ...androidPaths },
        };
      }

      // Check for Capacitor
      const hasCapacitor = !!(
        deps?.["@capacitor/core"] || devDeps?.["@capacitor/core"]
      );
      if (hasCapacitor) {
        const iosPaths = resolveIosPaths(root);
        const androidPaths = resolveAndroidPaths(root);
        return {
          type: "capacitor",
          paths: { ...basePaths, ...iosPaths, ...androidPaths },
        };
      }
    }
  }

  // Check for Flutter
  if (hasPubspec) {
    basePaths.pubspec = pubspecPath;
    const iosPaths = resolveIosPaths(root);
    const androidPaths = resolveAndroidPaths(root);
    return {
      type: "flutter",
      paths: { ...basePaths, ...iosPaths, ...androidPaths },
    };
  }

  // Check for iOS native project
  try {
    const entries = Bun.spawnSync(["ls", root]).stdout.toString().split("\n");
    const hasXcodeproj = entries.some((e) => e.trim().endsWith(".xcodeproj"));
    const hasXcworkspace = entries.some((e) => e.trim().endsWith(".xcworkspace"));
    if (hasXcodeproj || hasXcworkspace) {
      const iosPaths = resolveIosPaths(root);
      return {
        type: "ios",
        paths: { ...basePaths, ...iosPaths },
      };
    }
  } catch {
    // ignore
  }

  // Check for Android native project
  const buildGradlePath = join(root, "build.gradle");
  const buildGradleKtsPath = join(root, "build.gradle.kts");
  if (existsSync(buildGradlePath) || existsSync(buildGradleKtsPath)) {
    const androidPaths = resolveAndroidPaths(root);
    return {
      type: "android",
      paths: { ...basePaths, ...androidPaths },
    };
  }

  // Check for web project (has package.json but none of the above)
  if (hasPackageJson) {
    return {
      type: "web",
      paths: basePaths,
    };
  }

  return null;
}

export function detectProjectType(cwd?: string): DetectedProject | null {
  const startDir = cwd ?? process.cwd();
  const root = findProjectRoot(startDir);
  const result = detectType(root);

  if (!result) return null;

  const sdkVersion = getSdkVersion(result.type, result.paths);

  return {
    type: result.type,
    paths: result.paths,
    sdkVersion,
  };
}
