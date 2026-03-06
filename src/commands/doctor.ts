import { readFileSync } from "fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { detectProjectType } from "../detectors/project-detector.js";
import type {
  ValidationResult,
  ProjectType,
  ProjectPaths,
} from "../types/index.js";
import type { AnalysisIssue } from "../llm/types.js";
import { validateAndroid } from "../validators/android.js";
import {
  fixMinSdkVersion,
  fixInternetPermission,
  fixNetworkStatePermission,
  fixBackupRules,
  fixMavenCentral,
} from "../validators/android.js";
import { validateIos } from "../validators/ios.js";
import {
  fixDeploymentTarget,
  fixTrackingDescription,
  fixSkanReportEndpoint,
  fixSkanCopyEndpoint,
} from "../validators/ios.js";
import { validateFlutter } from "../validators/flutter.js";
import { validateReactNative } from "../validators/react-native.js";
import { validateExpo } from "../validators/expo.js";
import { validateCapacitor } from "../validators/capacitor.js";
import { validateWeb } from "../validators/web.js";
import { validateCode } from "../validators/code.js";
import { analyzeProject } from "../llm/analyzer.js";
import { parsePlist, parseGradle } from "../utils/file-parser.js";
import * as output from "../utils/output.js";

// --- Fix registry ---

type FixEntry =
  | { type: "file"; fn: (paths: ProjectPaths) => boolean }
  | { type: "command"; command: string };

const FIX_REGISTRY: Record<string, FixEntry> = {
  // iOS file fixes
  "ios-deployment-target": { type: "file", fn: fixDeploymentTarget },
  "ios-tracking-description": { type: "file", fn: fixTrackingDescription },
  "ios-skan-report-endpoint": { type: "file", fn: fixSkanReportEndpoint },
  "ios-skan-copy-endpoint": { type: "file", fn: fixSkanCopyEndpoint },
  // Android file fixes
  "android-min-sdk": { type: "file", fn: fixMinSdkVersion },
  "android-internet-permission": { type: "file", fn: fixInternetPermission },
  "android-network-state-permission": {
    type: "file",
    fn: fixNetworkStatePermission,
  },
  "android-backup-rules": { type: "file", fn: fixBackupRules },
  "android-maven-central": { type: "file", fn: fixMavenCentral },
  // Shell command fixes
  "flutter-sdk-installed": {
    type: "command",
    command: "flutter pub add linkrunner",
  },
  "flutter-sdk-version": {
    type: "command",
    command: "flutter pub upgrade linkrunner",
  },
  "rn-sdk-installed": { type: "command", command: "npm install rn-linkrunner" },
  "rn-sdk-version": {
    type: "command",
    command: "npm install rn-linkrunner@latest",
  },
  "rn-pods-installed": { type: "command", command: "cd ios && pod install" },
  "expo-rn-sdk-installed": {
    type: "command",
    command: "npm install rn-linkrunner",
  },
  "expo-rn-sdk-version": {
    type: "command",
    command: "npm install rn-linkrunner@latest",
  },
  "expo-plugin-installed": {
    type: "command",
    command: "npx expo install expo-linkrunner",
  },
  "capacitor-sdk-installed": {
    type: "command",
    command: "npm install capacitor-linkrunner",
  },
  "capacitor-sync": { type: "command", command: "npx cap sync" },
  "web-sdk-installed": {
    type: "command",
    command: "npm install @linkrunner/web-sdk",
  },
};

const SKAN_ENDPOINT = "https://linkrunner-skan.com";
const DEFAULT_TRACKING_MESSAGE =
  "This identifier will be used to deliver personalized ads to you.";

function getCurrentValue(
  id: string,
  paths: ProjectPaths
): { before: string; after: string } | null {
  try {
    switch (id) {
      case "ios-deployment-target": {
        if (!paths.podfile) return null;
        const content = readFileSync(paths.podfile, "utf-8");
        const match = content.match(
          /^\s*platform\s+:ios\s*,\s*['"](\d+\.?\d*)['"]$/m
        );
        const commented = content.match(/^\s*#\s*platform\s+:ios/m);
        const before =
          match?.[1] ?? (commented ? "(commented out)" : "(not set)");
        return { before, after: "15.0" };
      }
      case "ios-tracking-description": {
        if (!paths.infoPlist)
          return { before: "(missing)", after: DEFAULT_TRACKING_MESSAGE };
        const data = parsePlist(paths.infoPlist);
        const current = data?.["NSUserTrackingUsageDescription"];
        return {
          before:
            typeof current === "string" && current ? current : "(missing)",
          after: DEFAULT_TRACKING_MESSAGE,
        };
      }
      case "ios-skan-report-endpoint": {
        if (!paths.infoPlist)
          return { before: "(missing)", after: SKAN_ENDPOINT };
        const data = parsePlist(paths.infoPlist);
        const current = data?.["NSAdvertisingAttributionReportEndpoint"];
        return {
          before:
            typeof current === "string" && current ? current : "(missing)",
          after: SKAN_ENDPOINT,
        };
      }
      case "ios-skan-copy-endpoint": {
        if (!paths.infoPlist)
          return { before: "(missing)", after: SKAN_ENDPOINT };
        const data = parsePlist(paths.infoPlist);
        const current = data?.["AttributionCopyEndpoint"];
        return {
          before:
            typeof current === "string" && current ? current : "(missing)",
          after: SKAN_ENDPOINT,
        };
      }
      case "android-min-sdk": {
        if (!paths.buildGradle) return null;
        const gradle = parseGradle(paths.buildGradle);
        if (!gradle || gradle.minSdkVersion === undefined) return null;
        return { before: String(gradle.minSdkVersion), after: "21" };
      }
      case "android-internet-permission":
        return {
          before: "(missing)",
          after:
            '<uses-permission android:name="android.permission.INTERNET" />',
        };
      case "android-network-state-permission":
        return {
          before: "(missing)",
          after:
            '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
        };
      case "android-backup-rules":
        return {
          before: "(not configured)",
          after: "fullBackupContent + dataExtractionRules",
        };
      case "android-maven-central":
        return { before: "(missing)", after: "mavenCentral()" };
      default: {
        // Shell command fixes: show the command that will run
        const entry = FIX_REGISTRY[id];
        if (entry?.type === "command") {
          return { before: "(not installed)", after: `Run: ${entry.command}` };
        }
        return null;
      }
    }
  } catch {
    return null;
  }
}

function runShellCommand(command: string, cwd: string): boolean {
  try {
    const result = Bun.spawnSync(["sh", "-c", command], { cwd });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export interface DoctorOptions {
  json?: boolean;
  fix?: boolean;
  deep?: boolean;
  ci?: boolean;
  failOnWarn?: boolean;
}

function runPlatformValidator(
  type: ProjectType,
  projectRoot: string,
  paths: import("../types/index.js").ProjectPaths
): ValidationResult[] {
  switch (type) {
    case "flutter":
      return validateFlutter(projectRoot);
    case "react-native":
      return validateReactNative(projectRoot);
    case "expo":
      return validateExpo(projectRoot);
    case "capacitor":
      return validateCapacitor(projectRoot);
    case "web":
      return validateWeb(projectRoot);
    case "android":
      return validateAndroid(paths, type);
    case "ios":
      return validateIos(paths, type);
  }
}

function displayResult(result: ValidationResult): void {
  switch (result.status) {
    case "pass":
      output.pass(result.message);
      break;
    case "warn":
      output.warn(result.message, result.fix);
      break;
    case "error":
      output.error(result.message, result.fix);
      break;
  }
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  if (options.json) {
    output.setJsonMode(true);
  }

  if (!options.json) {
    console.log();
    console.log(chalk.bold("Linkrunner Doctor"));
    console.log(chalk.dim("Diagnosing your SDK integration..."));
    console.log();
  }

  // Step 1: Detect project type
  const detected = detectProjectType();

  if (!detected) {
    if (options.json) {
      console.log(
        JSON.stringify({
          error: "Could not detect project type",
          results: [],
        })
      );
    } else {
      output.error(
        "Could not detect project type. Run this command from your project root."
      );
    }
    if (options.ci) {
      process.exit(1);
    }
    return;
  }

  if (!options.json) {
    console.log(
      `  ${chalk.blue("Project:")} ${detected.type}${detected.sdkVersion ? ` (SDK v${detected.sdkVersion})` : ""}`
    );
    console.log(`  ${chalk.blue("Root:")} ${detected.paths.root}`);
    console.log();
  }

  const allResults: ValidationResult[] = [];

  // Step 2: Run platform-specific validator
  if (!options.json) {
    output.header("Platform Configuration");
  }

  const platformResults = runPlatformValidator(
    detected.type,
    detected.paths.root,
    detected.paths
  );
  allResults.push(...platformResults);

  if (!options.json) {
    for (const result of platformResults) {
      displayResult(result);
    }
  }

  // Step 3: Run code scanner
  if (!options.json) {
    output.header("Source Code");
  }

  const codeResults = await validateCode(detected.type, detected.paths.root);
  allResults.push(...codeResults);

  if (!options.json) {
    for (const result of codeResults) {
      displayResult(result);
    }
  }

  // Step 4: Deep analysis (AI-powered)
  let deepAnalysis: AnalysisIssue[] | undefined;

  if (options.deep) {
    if (!options.json) {
      output.header("Deep Analysis (AI-powered)");
    }

    try {
      const result = await analyzeProject(
        detected.type,
        detected.paths.root,
        allResults,
        detected.sdkVersion
      );

      if (result?.structured?.issues && result.structured.issues.length > 0) {
        deepAnalysis = result.structured.issues;

        if (!options.json) {
          for (const issue of result.structured.issues) {
            const location = issue.file
              ? `${issue.file}${issue.line ? `:${issue.line}` : ""}`
              : undefined;

            const prefix = location ? `[${location}] ` : "";

            if (issue.severity === "error") {
              output.error(`${prefix}${issue.message}`, issue.fix);
            } else if (issue.severity === "warn") {
              output.warn(`${prefix}${issue.message}`, issue.fix);
            } else {
              output.info(`${prefix}${issue.message}`);
              if (issue.fix) {
                console.log(`       ${chalk.dim(issue.fix)}`);
              }
            }
          }
        }
      } else if (result) {
        if (!options.json) {
          output.pass("No additional issues found by AI analysis.");
        }
      } else {
        if (!options.json) {
          output.info(
            "Deep analysis unavailable. Run 'lr login' to enable AI-powered features."
          );
        }
      }
    } catch {
      if (!options.json) {
        output.info(
          "Deep analysis could not be completed. Continuing with standard results."
        );
      }
    }
  }

  // Step 5: Auto-fix
  if (options.fix && !options.json) {
    const fixable = allResults.filter(
      (r) => r.autoFixable && r.status !== "pass"
    );

    output.header("Auto-fix");

    if (fixable.length === 0) {
      output.info("No fixable issues found.");
    } else {
      output.info(
        `${fixable.length} fixable issue${fixable.length !== 1 ? "s" : ""} found`
      );
      console.log();

      let applied = 0;
      let skipped = 0;
      let failed = 0;
      let applyAll = options.ci ?? false;

      for (let i = 0; i < fixable.length; i++) {
        const result = fixable[i]!;
        const diffInfo = getCurrentValue(result.id, detected.paths);

        console.log(
          `  ${chalk.bold(`[${i + 1}/${fixable.length}]`)} ${result.name}`
        );
        if (diffInfo) {
          output.diff("", diffInfo.before, diffInfo.after);
        }

        let shouldApply = applyAll;
        if (!shouldApply) {
          const { action } = await inquirer.prompt<{ action: string }>([
            {
              type: "expand",
              name: "action",
              message: "Apply fix?",
              default: "n",
              choices: [
                { key: "y", name: "Yes", value: "y" },
                { key: "n", name: "No", value: "n" },
                { key: "a", name: "All (apply remaining)", value: "a" },
              ],
            },
          ]);

          if (action === "a") {
            applyAll = true;
            shouldApply = true;
          } else {
            shouldApply = action === "y";
          }
        }

        if (shouldApply) {
          const entry = FIX_REGISTRY[result.id];
          let success = false;

          if (entry?.type === "file") {
            success = entry.fn(detected.paths);
          } else if (entry?.type === "command") {
            success = runShellCommand(entry.command, detected.paths.root);
          }

          if (success) {
            output.pass(`Fixed: ${result.name}`);
            applied++;
          } else {
            output.error(`Failed to fix: ${result.name}`);
            failed++;
          }
        } else {
          skipped++;
        }

        console.log();
      }

      const parts = [`Applied ${applied} fix${applied !== 1 ? "es" : ""}`];
      if (skipped > 0) parts.push(`skipped ${skipped}`);
      if (failed > 0) parts.push(`${failed} failed`);
      output.info(parts.join(", "));
    }
  }

  // Step 6: Display summary
  const passed = allResults.filter((r) => r.status === "pass").length;
  const warnings = allResults.filter((r) => r.status === "warn").length;
  const errors = allResults.filter((r) => r.status === "error").length;

  if (options.json) {
    const jsonOutput: Record<string, unknown> = {
      project: {
        type: detected.type,
        sdkVersion: detected.sdkVersion ?? null,
        root: detected.paths.root,
      },
      results: allResults,
      summary: { passed, warnings, errors },
    };
    if (deepAnalysis) {
      jsonOutput.deepAnalysis = deepAnalysis;
    }
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    output.summary(allResults);
  }

  // Step 7: Exit code for CI
  if (options.ci) {
    if (errors > 0) {
      process.exit(1);
    }
    if (options.failOnWarn && warnings > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
}
