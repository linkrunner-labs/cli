import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import type { ValidationResult } from "../types/index.js";
import { DOC_LINKS } from "../config/constants.js";

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".html", ".vue", ".svelte"]);
const INIT_PATTERNS = [
  /LinkrunnerSDK\.init\s*\(/,
  /useLinkrunner\s*\(/,
  /linkrunner-sdk\.min\.js/,
  /from\s+["']@linkrunner\/web-sdk/,
  /require\s*\(\s*["']@linkrunner\/web-sdk/,
];

function scanSourceFiles(dir: string, maxDepth: number = 5): boolean {
  if (maxDepth <= 0 || !existsSync(dir)) return false;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") {
      continue;
    }

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (scanSourceFiles(fullPath, maxDepth - 1)) return true;
    } else if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(entry))) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        for (const pattern of INIT_PATTERNS) {
          if (pattern.test(content)) return true;
        }
      } catch {
        continue;
      }
    }
  }

  return false;
}

export function validateWeb(projectRoot: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  const packageJsonPath = join(projectRoot, "package.json");
  const pkg = existsSync(packageJsonPath) ? readJsonSafe(packageJsonPath) : null;
  const deps = pkg?.dependencies as Record<string, string> | undefined;
  const devDeps = pkg?.devDependencies as Record<string, string> | undefined;

  // Check 1: @linkrunner/web-sdk in package.json
  const webSdkVersion = deps?.["@linkrunner/web-sdk"] ?? devDeps?.["@linkrunner/web-sdk"];

  if (!webSdkVersion) {
    results.push({
      id: "web-sdk-installed",
      name: "Linkrunner Web SDK installed",
      status: "error",
      severity: "error",
      message: "@linkrunner/web-sdk package not found in package.json",
      fix: "Run: npm install @linkrunner/web-sdk",
      autoFixable: true,
      docsUrl: DOC_LINKS.web,
    });
  } else {
    results.push({
      id: "web-sdk-installed",
      name: "Linkrunner Web SDK installed",
      status: "pass",
      severity: "error",
      message: "@linkrunner/web-sdk package found in package.json",
      autoFixable: false,
    });
  }

  // Check 2: SDK init call found in source
  const srcDir = join(projectRoot, "src");
  const appDir = join(projectRoot, "app");
  const pagesDir = join(projectRoot, "pages");
  const publicDir = join(projectRoot, "public");

  const dirsToScan = [srcDir, appDir, pagesDir, publicDir, projectRoot].filter((d) =>
    existsSync(d)
  );

  let initFound = false;
  for (const dir of dirsToScan) {
    // For projectRoot, only scan top-level files (not recursively into every dir)
    const depth = dir === projectRoot ? 1 : 5;
    if (scanSourceFiles(dir, depth)) {
      initFound = true;
      break;
    }
  }

  if (!initFound) {
    results.push({
      id: "web-sdk-init",
      name: "Linkrunner Web SDK initialized",
      status: "warn",
      severity: "warn",
      message: "Could not find SDK initialization call in source files",
      fix: "Initialize the SDK with LinkrunnerSDK.init() or useLinkrunner(). See docs for setup instructions.",
      autoFixable: false,
      docsUrl: DOC_LINKS.web,
    });
  } else {
    results.push({
      id: "web-sdk-init",
      name: "Linkrunner Web SDK initialized",
      status: "pass",
      severity: "warn",
      message: "SDK initialization call found in source files",
      autoFixable: false,
    });
  }

  return results;
}
