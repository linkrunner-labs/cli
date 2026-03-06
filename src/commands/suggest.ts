import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";
import chalk from "chalk";
import { detectProjectType } from "../detectors/project-detector.js";
import { DOC_LINKS } from "../config/constants.js";
import type { ProjectType } from "../types/index.js";
import type { FeatureSuggestion } from "../llm/types.js";
import { getSuggestions } from "../llm/analyzer.js";
import { isAuthenticated } from "../config/store.js";
import * as output from "../utils/output.js";

// ── Scanning helpers (duplicated from validators/code.ts, not exported) ──

const SKIP_DIRS = new Set([
  "node_modules",
  "build",
  ".dart_tool",
  "Pods",
  ".build",
  "dist",
  ".next",
  ".gradle",
  ".git",
  ".idea",
  ".vscode",
]);

const EXTENSIONS: Record<ProjectType, string[]> = {
  flutter: [".dart"],
  "react-native": [".ts", ".tsx", ".js", ".jsx"],
  expo: [".ts", ".tsx", ".js", ".jsx"],
  capacitor: [".ts", ".tsx", ".js", ".jsx"],
  android: [".kt", ".java"],
  ios: [".swift"],
  web: [".ts", ".tsx", ".js", ".jsx", ".html"],
};

function parseGitignore(rootPath: string): Set<string> {
  const gitignorePath = join(rootPath, ".gitignore");
  const extraDirs = new Set<string>();

  if (!existsSync(gitignorePath)) return extraDirs;

  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const lines = content.split("\n");

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;

      let pattern = line;
      if (pattern.endsWith("/")) pattern = pattern.slice(0, -1);
      if (pattern.startsWith("/")) pattern = pattern.slice(1);

      if (!pattern.includes("*") && !pattern.includes("/")) {
        extraDirs.add(pattern);
      }
    }
  } catch {
    // Ignore read errors
  }

  return extraDirs;
}

function walkFiles(
  dir: string,
  extensions: string[],
  skipSet: Set<string>,
): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (skipSet.has(entry)) continue;

    const fullPath = join(dir, entry);

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...walkFiles(fullPath, extensions, skipSet));
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function hasMatch(files: string[], patterns: RegExp[]): boolean {
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (const line of lines) {
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          return true;
        }
      }
    }
  }

  return false;
}

// ── Feature definitions ──

interface FeatureDef {
  key: string;
  name: string;
  description: string;
  why: string;
  severity: "error" | "warn";
  patterns: Record<ProjectType, RegExp[]>;
  example: Record<ProjectType, string>;
}

const FEATURES: FeatureDef[] = [
  {
    key: "init",
    name: "init()",
    description: "SDK initialization",
    why: "Required — SDK won't work without it",
    severity: "error",
    patterns: {
      flutter: [/LinkRunner\(\)\.init\s*\(/],
      "react-native": [/linkrunner\.init\s*\(/],
      expo: [/linkrunner\.init\s*\(/],
      capacitor: [/linkrunner\.init\s*\(/, /LinkrunnerSDK\.init\s*\(/, /useLinkrunner\s*\(/],
      android: [/LinkRunner\.getInstance\(\)\.init\s*\(/, /LinkRunner\.init\s*\(/],
      ios: [/LinkrunnerSDK\.shared\.initialize\s*\(/],
      web: [/LinkrunnerSDK\.init\s*\(/, /useLinkrunner\s*\(/],
    },
    example: {
      flutter: "await LinkRunner().init(config: LRConfig(token: 'YOUR_TOKEN'));",
      "react-native": "await linkrunner.init({ token: 'YOUR_TOKEN' });",
      expo: "await linkrunner.init({ token: 'YOUR_TOKEN' });",
      capacitor: "await linkrunner.init({ token: 'YOUR_TOKEN' });",
      android: "LinkRunner.getInstance().init(context, \"YOUR_TOKEN\")",
      ios: "try await LinkrunnerSDK.shared.initialize(token: \"YOUR_TOKEN\")",
      web: "LinkrunnerSDK.init({ token: 'YOUR_TOKEN' });",
    },
  },
  {
    key: "signup",
    name: "signup()",
    description: "User registration tracking",
    why: "Links installs to user identity for attribution",
    severity: "warn",
    patterns: {
      flutter: [/LinkRunner\(\)\.signup\s*\(/],
      "react-native": [/linkrunner\.signup\s*\(/],
      expo: [/linkrunner\.signup\s*\(/],
      capacitor: [/linkrunner\.signup\s*\(/, /LinkrunnerSDK\.signup\s*\(/],
      android: [/LinkRunner\.getInstance\(\)\.signup\s*\(/, /LinkRunner\.signup\s*\(/],
      ios: [/LinkrunnerSDK\.shared\.signup\s*\(/],
      web: [/LinkrunnerSDK\.signup\s*\(/],
    },
    example: {
      flutter: "await LinkRunner().signup(userId: 'USER_ID');",
      "react-native": "await linkrunner.signup({ userId: 'USER_ID' });",
      expo: "await linkrunner.signup({ userId: 'USER_ID' });",
      capacitor: "await linkrunner.signup({ userId: 'USER_ID' });",
      android: "LinkRunner.getInstance().signup(\"USER_ID\")",
      ios: "try await LinkrunnerSDK.shared.signup(userId: \"USER_ID\")",
      web: "LinkrunnerSDK.signup({ userId: 'USER_ID' });",
    },
  },
  {
    key: "setUserData",
    name: "setUserData()",
    description: "User data enrichment",
    why: "Enables user-level analytics and segmentation",
    severity: "warn",
    patterns: {
      flutter: [/LinkRunner\(\)\.setUserData\s*\(/],
      "react-native": [/linkrunner\.setUserData\s*\(/],
      expo: [/linkrunner\.setUserData\s*\(/],
      capacitor: [/linkrunner\.setUserData\s*\(/, /LinkrunnerSDK\.setUserData\s*\(/],
      android: [/LinkRunner\.getInstance\(\)\.setUserData\s*\(/, /LinkRunner\.setUserData\s*\(/],
      ios: [/LinkrunnerSDK\.shared\.setUserData\s*\(/],
      web: [/LinkrunnerSDK\.setUserData\s*\(/],
    },
    example: {
      flutter: "await LinkRunner().setUserData(userData: LRUserData(id: 'USER_ID'));",
      "react-native": "await linkrunner.setUserData({ id: 'USER_ID' });",
      expo: "await linkrunner.setUserData({ id: 'USER_ID' });",
      capacitor: "await linkrunner.setUserData({ id: 'USER_ID' });",
      android: "LinkRunner.getInstance().setUserData(userData)",
      ios: "try await LinkrunnerSDK.shared.setUserData(userData)",
      web: "LinkrunnerSDK.setUserData({ id: 'USER_ID' });",
    },
  },
  {
    key: "trackEvent",
    name: "trackEvent()",
    description: "Custom event tracking",
    why: "Track in-app events for campaign optimization",
    severity: "warn",
    patterns: {
      flutter: [/LinkRunner\(\)\.trackEvent\s*\(/],
      "react-native": [/linkrunner\.trackEvent\s*\(/],
      expo: [/linkrunner\.trackEvent\s*\(/],
      capacitor: [/linkrunner\.trackEvent\s*\(/, /LinkrunnerSDK\.trackEvent\s*\(/],
      android: [/LinkRunner\.getInstance\(\)\.trackEvent\s*\(/, /LinkRunner\.trackEvent\s*\(/],
      ios: [/LinkrunnerSDK\.shared\.trackEvent\s*\(/],
      web: [/LinkrunnerSDK\.trackEvent\s*\(/],
    },
    example: {
      flutter: "await LinkRunner().trackEvent(name: 'event_name', data: {});",
      "react-native": "await linkrunner.trackEvent({ name: 'event_name', data: {} });",
      expo: "await linkrunner.trackEvent({ name: 'event_name', data: {} });",
      capacitor: "await linkrunner.trackEvent({ name: 'event_name', data: {} });",
      android: "LinkRunner.getInstance().trackEvent(\"event_name\", data)",
      ios: "try await LinkrunnerSDK.shared.trackEvent(name: \"event_name\", data: [:])",
      web: "LinkrunnerSDK.trackEvent({ name: 'event_name', data: {} });",
    },
  },
  {
    key: "capturePayment",
    name: "capturePayment()",
    description: "Revenue tracking",
    why: "Measure ROI and optimize for paying users",
    severity: "warn",
    patterns: {
      flutter: [/LinkRunner\(\)\.capturePayment\s*\(/],
      "react-native": [/linkrunner\.capturePayment\s*\(/],
      expo: [/linkrunner\.capturePayment\s*\(/],
      capacitor: [/linkrunner\.capturePayment\s*\(/, /LinkrunnerSDK\.capturePayment\s*\(/],
      android: [/LinkRunner\.getInstance\(\)\.capturePayment\s*\(/, /LinkRunner\.capturePayment\s*\(/],
      ios: [/LinkrunnerSDK\.shared\.capturePayment\s*\(/],
      web: [/LinkrunnerSDK\.capturePayment\s*\(/],
    },
    example: {
      flutter: "await LinkRunner().capturePayment(amount: 9.99, currency: 'USD');",
      "react-native": "await linkrunner.capturePayment({ amount: 9.99, currency: 'USD' });",
      expo: "await linkrunner.capturePayment({ amount: 9.99, currency: 'USD' });",
      capacitor: "await linkrunner.capturePayment({ amount: 9.99, currency: 'USD' });",
      android: "LinkRunner.getInstance().capturePayment(9.99, \"USD\")",
      ios: "try await LinkrunnerSDK.shared.capturePayment(amount: 9.99, currency: \"USD\")",
      web: "LinkrunnerSDK.capturePayment({ amount: 9.99, currency: 'USD' });",
    },
  },
  {
    key: "deepLink",
    name: "Deep links",
    description: "Deep link handling",
    why: "Enable deferred deep links and attribution",
    severity: "warn",
    patterns: {
      flutter: [/LinkRunner\(\)\.getInitData\s*\(/, /onDeepLink/, /getInitialLink/],
      "react-native": [/linkrunner\.getInitData\s*\(/, /Linking\.addEventListener/, /getInitialURL/],
      expo: [/linkrunner\.getInitData\s*\(/, /Linking\.addEventListener/],
      capacitor: [/linkrunner\.getInitData\s*\(/],
      android: [/LinkRunner\.getInstance\(\)\.getInitData\s*\(/, /intent\.data/],
      ios: [/LinkrunnerSDK\.shared\.getInitData\s*\(/, /userActivity\.webpageURL/],
      web: [/LinkrunnerSDK\.getInitData\s*\(/],
    },
    example: {
      flutter: "final initData = await LinkRunner().getInitData();",
      "react-native": "const initData = await linkrunner.getInitData();",
      expo: "const initData = await linkrunner.getInitData();",
      capacitor: "const initData = await linkrunner.getInitData();",
      android: "val initData = LinkRunner.getInstance().getInitData()",
      ios: "let initData = try await LinkrunnerSDK.shared.getInitData()",
      web: "const initData = await LinkrunnerSDK.getInitData();",
    },
  },
];

// ── JSON output type ──

interface SuggestJsonResult {
  platform: ProjectType;
  sdkVersion: string | null;
  root: string;
  features: {
    key: string;
    name: string;
    description: string;
    found: boolean;
    example: string;
    docsUrl: string;
  }[];
  score: { integrated: number; total: number };
  aiSuggestions?: FeatureSuggestion[];
}

// ── Command ──

export interface SuggestOptions {
  json?: boolean;
  ai?: boolean;
}

export async function suggestCommand(options: SuggestOptions): Promise<void> {
  if (options.json) {
    output.setJsonMode(true);
  }

  // Step 1: Detect project type
  const detected = detectProjectType();

  if (!detected) {
    if (options.json) {
      console.log(
        JSON.stringify({
          error: "Could not detect project type",
          features: [],
        }),
      );
    } else {
      output.error(
        "Could not detect project type. Run this command from your project root.",
      );
    }
    return;
  }

  const projectType = detected.type;
  const rootPath = detected.paths.root;
  const docsUrl = DOC_LINKS[projectType];
  const extensions = EXTENSIONS[projectType];

  if (!extensions) {
    if (options.json) {
      console.log(
        JSON.stringify({
          error: `Unsupported project type: ${projectType}`,
          features: [],
        }),
      );
    } else {
      output.error(`Unsupported project type: ${projectType}`);
    }
    return;
  }

  if (!options.json) {
    output.header("SDK Feature Suggestions");
    output.info(`Platform: ${projectType}`);
    output.info("Scanning source files...");
  }

  // Step 2: Build skip set and collect files
  const skipSet = new Set(SKIP_DIRS);
  const gitignoreDirs = parseGitignore(rootPath);
  for (const dir of gitignoreDirs) {
    skipSet.add(dir);
  }

  const files = walkFiles(rootPath, extensions, skipSet);

  if (files.length === 0) {
    if (options.json) {
      console.log(
        JSON.stringify({
          error: `No source files (${extensions.join(", ")}) found in project`,
          features: [],
        }),
      );
    } else {
      output.warn(`No source files (${extensions.join(", ")}) found in project`);
    }
    return;
  }

  // Step 3: Check each feature
  if (!options.json) {
    output.header("Feature Integration Status");
  }

  let integrated = 0;
  const jsonFeatures: SuggestJsonResult["features"] = [];

  for (const feature of FEATURES) {
    const patterns = feature.patterns[projectType];
    if (!patterns) continue;

    const found = hasMatch(files, patterns);

    if (found) {
      integrated++;
    }

    jsonFeatures.push({
      key: feature.key,
      name: feature.name,
      description: feature.description,
      found,
      example: feature.example[projectType] ?? "",
      docsUrl: docsUrl ?? "",
    });

    if (options.json) continue;

    if (found) {
      output.pass(`${feature.name} — ${feature.description}`);
    } else {
      if (feature.severity === "error") {
        output.error(`${feature.name} — ${feature.description}`);
      } else {
        output.warn(`${feature.name} — ${feature.description}`);
      }
      console.log(`       ${chalk.dim(feature.why)}`);
      console.log(`       ${chalk.dim("Example:")}`);
      console.log(`         ${chalk.cyan(feature.example[projectType] ?? "")}`);
      console.log(`       ${chalk.dim("Docs:")} ${chalk.underline(docsUrl)}`);
    }
  }

  const total = FEATURES.length;
  const detectedFeatureKeys = jsonFeatures
    .filter((f) => f.found)
    .map((f) => f.key);

  // Step 4: AI recommendations
  let aiSuggestions: FeatureSuggestion[] | undefined;

  if (options.ai !== false && isAuthenticated()) {
    try {
      const result = await getSuggestions(
        projectType,
        rootPath,
        detectedFeatureKeys,
      );

      if (result?.structured?.suggestions && result.structured.suggestions.length > 0) {
        aiSuggestions = result.structured.suggestions;

        if (!options.json) {
          output.header("AI Recommendations");

          for (const suggestion of result.structured.suggestions) {
            console.log(`  ${chalk.cyan("*")} ${chalk.bold(suggestion.feature)}`);
            console.log(`    ${chalk.dim(suggestion.reason)}`);
            if (suggestion.example) {
              console.log(`    ${chalk.dim("Example:")}`);
              console.log(`      ${chalk.cyan(suggestion.example)}`);
            }
            console.log();
          }
        }
      }
    } catch {
      // Graceful degradation: skip AI suggestions on failure
    }
  }

  // Step 5: Output
  if (options.json) {
    const result: SuggestJsonResult = {
      platform: projectType,
      sdkVersion: detected.sdkVersion ?? null,
      root: rootPath,
      features: jsonFeatures,
      score: { integrated, total },
    };
    if (aiSuggestions) {
      result.aiSuggestions = aiSuggestions;
    }
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log();
    console.log(
      chalk.bold(`Score: ${integrated}/${total} features integrated`),
    );

    if (integrated < total) {
      console.log();
      output.info(
        "Add the missing features above to get the most out of Linkrunner.",
      );
    } else {
      console.log();
      output.info("All SDK features are integrated. Great job!");
    }
  }
}
