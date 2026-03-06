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

const KNOWN_PLUGIN_KEYS = new Set([
  "userTrackingPermission",
  "debug",
  "disableIdfa",
]);

export function validateExpo(projectRoot: string): ValidationResult[] {
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
        "expo-rn-sdk-installed",
        "rn-linkrunner SDK installed",
        "rn-linkrunner package not found in package.json",
        {
          fix: "Run: npm install rn-linkrunner",
          autoFixable: true,
          docsUrl: DOC_LINKS.expo,
        },
      ),
    );
  } else {
    results.push(
      pass(
        "expo-rn-sdk-installed",
        "rn-linkrunner SDK installed",
        "rn-linkrunner package found in package.json",
      ),
    );

    // SDK version check
    const cleanVersion = rnLinkrunnerVersion.replace(/^[\^~>=<\s]+/, "");
    if (!semverGte(cleanVersion, MIN_SDK_VERSIONS["react-native"])) {
      results.push(
        warn(
          "expo-rn-sdk-version",
          "rn-linkrunner SDK version",
          `rn-linkrunner version ${cleanVersion} is below minimum recommended ${MIN_SDK_VERSIONS["react-native"]}`,
          {
            fix: "Run: npm install rn-linkrunner@latest",
            autoFixable: true,
            docsUrl: DOC_LINKS.expo,
          },
        ),
      );
    } else {
      results.push(
        pass(
          "expo-rn-sdk-version",
          "rn-linkrunner SDK version",
          `rn-linkrunner version ${cleanVersion} is up to date`,
        ),
      );
    }
  }

  // Check 2: expo-linkrunner in package.json
  const expoLinkrunnerVersion =
    deps?.["expo-linkrunner"] ?? devDeps?.["expo-linkrunner"];

  if (!expoLinkrunnerVersion) {
    results.push(
      error(
        "expo-plugin-installed",
        "expo-linkrunner plugin installed",
        "expo-linkrunner package not found in package.json",
        {
          fix: "Run: npx expo install expo-linkrunner",
          autoFixable: true,
          docsUrl: DOC_LINKS.expo,
        },
      ),
    );
  } else {
    results.push(
      pass(
        "expo-plugin-installed",
        "expo-linkrunner plugin installed",
        "expo-linkrunner package found in package.json",
      ),
    );
  }

  // Check 3: expo-linkrunner in app.json plugins
  const appJsonPath = join(projectRoot, "app.json");
  const appJson = fileExists(appJsonPath) ? readJsonSafe(appJsonPath) : null;
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
    results.push(
      error(
        "expo-plugin-configured",
        "expo-linkrunner in app.json plugins",
        "expo-linkrunner not found in expo.plugins array in app.json",
        {
          fix: 'Add ["expo-linkrunner", {}] to the plugins array in app.json',
          docsUrl: DOC_LINKS.expo,
        },
      ),
    );
  } else {
    results.push(
      pass(
        "expo-plugin-configured",
        "expo-linkrunner in app.json plugins",
        "expo-linkrunner found in app.json plugins",
      ),
    );

    // Check 4: Plugin config has recognized keys
    if (Array.isArray(pluginEntry) && pluginEntry.length >= 2) {
      const config = pluginEntry[1] as Record<string, unknown> | undefined;
      if (config && typeof config === "object") {
        const unknownKeys = Object.keys(config).filter(
          (k) => !KNOWN_PLUGIN_KEYS.has(k),
        );
        if (unknownKeys.length > 0) {
          results.push(
            warn(
              "expo-plugin-config",
              "expo-linkrunner plugin config",
              `Unknown plugin config keys: ${unknownKeys.join(", ")}. Known keys: ${[...KNOWN_PLUGIN_KEYS].join(", ")}`,
              {
                fix: "Check expo-linkrunner docs for valid configuration options",
                docsUrl: DOC_LINKS.expo,
              },
            ),
          );
        } else {
          results.push(
            pass(
              "expo-plugin-config",
              "expo-linkrunner plugin config",
              "Plugin configuration keys are valid",
            ),
          );
        }
      }
    }
  }

  // Inherited: Android checks (only if android/ exists, Expo managed may not have it)
  const androidDir = join(projectRoot, "android");
  if (fileExists(androidDir)) {
    const androidPaths = resolveAndroidPaths(androidDir);
    const androidResults = validateAndroid(androidPaths, "expo");
    results.push(...androidResults);
  }

  // Inherited: iOS checks (only if ios/ exists)
  const iosDir = join(projectRoot, "ios");
  if (fileExists(iosDir)) {
    const iosPaths = resolveIosPaths(iosDir);
    const iosResults = validateIos(iosPaths, "expo");
    results.push(...iosResults);
  }

  return results;
}
