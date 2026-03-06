import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, extname } from "path";
import chalk from "chalk";
import { isAuthenticated, getProjectConfig } from "../config/store.js";
import type { ProjectType, ValidationResult } from "../types/index.js";
import { analyzeWithLLM } from "./client.js";
import type {
  AnalyzeRequest,
  AnalysisResult,
  AnalysisIssue,
  InsertionPoint,
  FeatureSuggestion,
} from "./types.js";

// ── File collection config ──

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
  "__tests__",
  "androidTest",
]);

const PLATFORM_CONFIG: Record<
  ProjectType,
  {
    extensions: string[];
    scanDirs: string[];
    skipPatterns: RegExp[];
    entryFiles: string[];
  }
> = {
  flutter: {
    extensions: [".dart"],
    scanDirs: ["lib"],
    skipPatterns: [/\.g\.dart$/, /\.freezed\.dart$/, /\.mocks\.dart$/],
    entryFiles: ["lib/main.dart"],
  },
  "react-native": {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    scanDirs: ["src", "app"],
    skipPatterns: [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/],
    entryFiles: [
      "App.tsx",
      "App.jsx",
      "App.ts",
      "App.js",
      "src/App.tsx",
      "app/_layout.tsx",
      "index.js",
      "index.ts",
    ],
  },
  expo: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    scanDirs: ["src", "app"],
    skipPatterns: [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/],
    entryFiles: [
      "App.tsx",
      "App.jsx",
      "app/_layout.tsx",
      "app/index.tsx",
      "index.js",
      "index.ts",
    ],
  },
  android: {
    extensions: [".kt", ".java"],
    scanDirs: ["app/src/main"],
    skipPatterns: [],
    entryFiles: [],
  },
  ios: {
    extensions: [".swift"],
    scanDirs: ["."],
    skipPatterns: [/Tests?\.swift$/],
    entryFiles: [],
  },
  capacitor: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    scanDirs: ["src", "app"],
    skipPatterns: [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/],
    entryFiles: ["src/App.tsx", "src/main.ts", "src/index.ts"],
  },
  web: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    scanDirs: ["src"],
    skipPatterns: [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/],
    entryFiles: ["src/App.tsx", "src/main.ts", "src/index.ts", "src/index.js"],
  },
};

const MAX_TOTAL_BYTES = 100_000;
const MAX_FILES = 50;
const MAX_LINES_PER_FILE = 500;

// ── File walking ──

function walkFiles(
  dir: string,
  extensions: string[],
  skipPatterns: RegExp[]
): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...walkFiles(fullPath, extensions, skipPatterns));
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (!extensions.includes(ext)) continue;
      if (skipPatterns.some((p) => p.test(entry))) continue;
      results.push(fullPath);
    }
  }

  return results;
}

function readFileTruncated(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    if (lines.length <= MAX_LINES_PER_FILE) return content;
    return lines.slice(0, MAX_LINES_PER_FILE).join("\n") + "\n// ... truncated";
  } catch {
    return null;
  }
}

function collectFiles(
  projectType: ProjectType,
  rootPath: string
): Array<{ path: string; content: string }> {
  const config = PLATFORM_CONFIG[projectType];
  if (!config) return [];

  // Collect all candidate files
  const allFiles: string[] = [];
  for (const scanDir of config.scanDirs) {
    const dir = scanDir === "." ? rootPath : join(rootPath, scanDir);
    if (!existsSync(dir)) continue;
    allFiles.push(...walkFiles(dir, config.extensions, config.skipPatterns));
  }

  // Also check for entry files at the project root
  for (const entry of config.entryFiles) {
    const fullPath = join(rootPath, entry);
    if (existsSync(fullPath) && !allFiles.includes(fullPath)) {
      allFiles.unshift(fullPath);
    }
  }

  // Sort: entry-point files first, then alphabetically
  const entrySet = new Set(config.entryFiles.map((f) => join(rootPath, f)));
  allFiles.sort((a, b) => {
    const aIsEntry = entrySet.has(a) ? 0 : 1;
    const bIsEntry = entrySet.has(b) ? 0 : 1;
    if (aIsEntry !== bIsEntry) return aIsEntry - bIsEntry;
    return a.localeCompare(b);
  });

  // Read files, respecting limits
  const result: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;

  for (const filePath of allFiles) {
    if (result.length >= MAX_FILES) break;
    if (totalBytes >= MAX_TOTAL_BYTES) break;

    const content = readFileTruncated(filePath);
    if (!content) continue;

    const bytes = Buffer.byteLength(content, "utf-8");
    if (totalBytes + bytes > MAX_TOTAL_BYTES && result.length > 0) break;

    result.push({
      path: relative(rootPath, filePath),
      content,
    });
    totalBytes += bytes;
  }

  return result;
}

// ── Response parsing ──

function tryParseJsonBlock(content: string): unknown | null {
  const match = content.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function parseIssues(content: string): AnalysisIssue[] | undefined {
  const json = tryParseJsonBlock(content);
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.issues)) {
      return obj.issues
        .filter(
          (i): i is Record<string, unknown> =>
            typeof i === "object" &&
            i !== null &&
            typeof (i as Record<string, unknown>).message === "string"
        )
        .map((i) => ({
          severity: (["error", "warn", "info"].includes(i.severity as string)
            ? i.severity
            : "warn") as AnalysisIssue["severity"],
          message: i.message as string,
          file: typeof i.file === "string" ? i.file : undefined,
          line: typeof i.line === "number" ? i.line : undefined,
          fix: typeof i.fix === "string" ? i.fix : undefined,
        }));
    }
  }
  return undefined;
}

function parseInsertionPoint(content: string): InsertionPoint | undefined {
  const json = tryParseJsonBlock(content);
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (
      typeof obj.file === "string" &&
      typeof obj.line === "number" &&
      typeof obj.code === "string"
    ) {
      return {
        file: obj.file,
        line: obj.line,
        code: obj.code,
        description:
          typeof obj.description === "string" ? obj.description : undefined,
      };
    }
    if (obj.insertionPoint && typeof obj.insertionPoint === "object") {
      const ip = obj.insertionPoint as Record<string, unknown>;
      if (
        typeof ip.file === "string" &&
        typeof ip.line === "number" &&
        typeof ip.code === "string"
      ) {
        return {
          file: ip.file,
          line: ip.line,
          code: ip.code,
          description:
            typeof ip.description === "string" ? ip.description : undefined,
        };
      }
    }
  }

  // Fallback: try to extract from markdown code fences
  const codeMatch = content.match(/```[\w]*\s*\n([\s\S]*?)\n```/);
  const fileMatch = content.match(/(?:file|path)[:\s]+[`"]?([^\s`"]+)[`"]?/i);
  const lineMatch = content.match(/(?:line|at line)[:\s]+(\d+)/i);

  if (codeMatch?.[1] && fileMatch?.[1]) {
    return {
      file: fileMatch[1],
      line: lineMatch?.[1] ? parseInt(lineMatch[1], 10) : 1,
      code: codeMatch[1],
    };
  }

  return undefined;
}

function parseSuggestions(content: string): FeatureSuggestion[] | undefined {
  const json = tryParseJsonBlock(content);
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    const arr = Array.isArray(obj.suggestions)
      ? obj.suggestions
      : Array.isArray(obj)
        ? obj
        : null;
    if (arr) {
      return arr
        .filter(
          (s): s is Record<string, unknown> =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as Record<string, unknown>).feature === "string"
        )
        .map((s) => ({
          feature: s.feature as string,
          reason: typeof s.reason === "string" ? s.reason : "",
          example: typeof s.example === "string" ? s.example : "",
        }));
    }
  }
  return undefined;
}

// ── Auth check helper ──

function checkAuth(): boolean {
  if (isAuthenticated()) return true;
  console.log(
    `  ${chalk.yellow("WARN")} Not authenticated. Run ${chalk.cyan("`lr login`")} to enable AI analysis.`
  );
  return false;
}

// ── Public API ──

export async function analyzeProject(
  projectType: ProjectType,
  rootPath: string,
  validationResults: ValidationResult[],
  sdkVersion?: string
): Promise<AnalysisResult | null> {
  if (!checkAuth()) return null;

  const files = collectFiles(projectType, rootPath);
  if (files.length === 0) return null;

  const projectConfig = getProjectConfig(rootPath);

  const request: AnalyzeRequest = {
    type: "analyze",
    projectType,
    files,
    context: {
      validationResults,
      projectConfig:
        (projectConfig as Record<string, unknown> | undefined) ?? undefined,
      sdkVersion,
      platforms: projectConfig?.platforms,
    },
  };

  const result = await analyzeWithLLM(request);
  if (!result) return null;

  const issues = parseIssues(result.content);
  if (issues) {
    result.structured = { issues };
  }

  return result;
}

export async function getInsertionPoint(
  projectType: ProjectType,
  rootPath: string,
  codeType: "init" | "signup" | "trackEvent" | "capturePayment" | "setUserData"
): Promise<AnalysisResult | null> {
  if (!checkAuth()) return null;

  const files = collectFiles(projectType, rootPath);
  if (files.length === 0) return null;

  const projectConfig = getProjectConfig(rootPath);

  const request: AnalyzeRequest = {
    type: "insert_code",
    projectType,
    files,
    context: {
      projectConfig:
        (projectConfig as Record<string, unknown> | undefined) ?? undefined,
      platforms: projectConfig?.platforms,
    },
    prompt: `Find the best location to insert a ${codeType}() call in this ${projectType} project. Return the file path, line number, and the exact code to insert.`,
  };

  const result = await analyzeWithLLM(request);
  if (!result) return null;

  const insertionPoint = parseInsertionPoint(result.content);
  if (insertionPoint) {
    result.structured = { insertionPoint };
  }

  return result;
}

export async function getSuggestions(
  projectType: ProjectType,
  rootPath: string,
  detectedFeatures: string[]
): Promise<AnalysisResult | null> {
  if (!checkAuth()) return null;

  const files = collectFiles(projectType, rootPath);
  if (files.length === 0) return null;

  const projectConfig = getProjectConfig(rootPath);

  const request: AnalyzeRequest = {
    type: "suggest",
    projectType,
    files,
    context: {
      detectedFeatures,
      projectConfig:
        (projectConfig as Record<string, unknown> | undefined) ?? undefined,
      platforms: projectConfig?.platforms,
    },
  };

  const result = await analyzeWithLLM(request);
  if (!result) return null;

  const suggestions = parseSuggestions(result.content);
  if (suggestions) {
    result.structured = { suggestions };
  }

  return result;
}
