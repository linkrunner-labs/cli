import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, extname } from "path";
import type { ProjectType, ValidationResult } from "../types/index.js";
import { DOC_LINKS } from "../config/constants.js";

// Directories to always skip when scanning
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

// File extensions to scan per project type
const EXTENSIONS: Record<ProjectType, string[]> = {
  flutter: [".dart"],
  "react-native": [".ts", ".tsx", ".js", ".jsx"],
  expo: [".ts", ".tsx", ".js", ".jsx"],
  capacitor: [".ts", ".tsx", ".js", ".jsx"],
  android: [".kt", ".java"],
  ios: [".swift"],
  web: [".ts", ".tsx", ".js", ".jsx", ".html"],
};

interface SDKPatterns {
  init: RegExp[];
  signup: RegExp[];
  setUserData: RegExp[];
  trackEvent: RegExp[];
}

// Regex patterns for SDK method calls per project type
const PATTERNS: Record<ProjectType, SDKPatterns> = {
  flutter: {
    init: [/LinkRunner\(\)\.init\s*\(/],
    signup: [/LinkRunner\(\)\.signup\s*\(/],
    setUserData: [/LinkRunner\(\)\.setUserData\s*\(/],
    trackEvent: [/LinkRunner\(\)\.trackEvent\s*\(/],
  },
  "react-native": {
    init: [/linkrunner\.init\s*\(/],
    signup: [/linkrunner\.signup\s*\(/],
    setUserData: [/linkrunner\.setUserData\s*\(/],
    trackEvent: [/linkrunner\.trackEvent\s*\(/],
  },
  expo: {
    init: [/linkrunner\.init\s*\(/],
    signup: [/linkrunner\.signup\s*\(/],
    setUserData: [/linkrunner\.setUserData\s*\(/],
    trackEvent: [/linkrunner\.trackEvent\s*\(/],
  },
  capacitor: {
    init: [/linkrunner\.init\s*\(/, /LinkrunnerSDK\.init\s*\(/, /useLinkrunner\s*\(/],
    signup: [/linkrunner\.signup\s*\(/, /LinkrunnerSDK\.signup\s*\(/],
    setUserData: [/linkrunner\.setUserData\s*\(/, /LinkrunnerSDK\.setUserData\s*\(/],
    trackEvent: [/linkrunner\.trackEvent\s*\(/, /LinkrunnerSDK\.trackEvent\s*\(/],
  },
  android: {
    init: [/LinkRunner\.getInstance\(\)\.init\s*\(/, /LinkRunner\.init\s*\(/],
    signup: [/LinkRunner\.getInstance\(\)\.signup\s*\(/, /LinkRunner\.signup\s*\(/],
    setUserData: [/LinkRunner\.getInstance\(\)\.setUserData\s*\(/, /LinkRunner\.setUserData\s*\(/],
    trackEvent: [/LinkRunner\.getInstance\(\)\.trackEvent\s*\(/, /LinkRunner\.trackEvent\s*\(/],
  },
  ios: {
    init: [/LinkrunnerSDK\.shared\.initialize\s*\(/],
    signup: [/LinkrunnerSDK\.shared\.signup\s*\(/],
    setUserData: [/LinkrunnerSDK\.shared\.setUserData\s*\(/],
    trackEvent: [/LinkrunnerSDK\.shared\.trackEvent\s*\(/],
  },
  web: {
    init: [/LinkrunnerSDK\.init\s*\(/, /useLinkrunner\s*\(/],
    signup: [/LinkrunnerSDK\.signup\s*\(/],
    setUserData: [/LinkrunnerSDK\.setUserData\s*\(/],
    trackEvent: [/LinkrunnerSDK\.trackEvent\s*\(/],
  },
};

// Detect amount passed as string literal in trackEvent calls
// Matches patterns like: amount: "...", amount: '...', amount: `...`
const AMOUNT_STRING_PATTERN =
  /trackEvent\s*\([^)]*amount\s*[:=]\s*(['"`])/;

interface FileMatch {
  file: string;
  line: number;
  content: string;
}

/**
 * Parse a .gitignore file and return an array of ignore patterns.
 * Returns directory names that should be skipped.
 */
function parseGitignore(rootPath: string): Set<string> {
  const gitignorePath = join(rootPath, ".gitignore");
  const extraDirs = new Set<string>();

  if (!existsSync(gitignorePath)) return extraDirs;

  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const lines = content.split("\n");

    for (const raw of lines) {
      const line = raw.trim();
      // Skip comments and empty lines
      if (!line || line.startsWith("#")) continue;

      // Simple directory patterns: strip trailing slash and leading slash
      let pattern = line;
      if (pattern.endsWith("/")) pattern = pattern.slice(0, -1);
      if (pattern.startsWith("/")) pattern = pattern.slice(1);

      // Only use simple directory names (no wildcards, no paths with separators)
      if (!pattern.includes("*") && !pattern.includes("/")) {
        extraDirs.add(pattern);
      }
    }
  } catch {
    // Ignore read errors
  }

  return extraDirs;
}

/**
 * Recursively walk the directory tree collecting source files matching
 * the given extensions, skipping known build/dependency directories.
 */
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

/**
 * Search for regex matches across all source files, returning file + line info.
 */
function findMatches(
  files: string[],
  patterns: RegExp[],
): FileMatch[] {
  const matches: FileMatch[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          matches.push({
            file,
            line: i + 1,
            content: line.trim(),
          });
          break; // Only count one match per line
        }
      }
    }
  }

  return matches;
}

/**
 * Detect trackEvent calls where `amount` is passed as a string literal.
 */
function findAmountStringWarnings(
  files: string[],
  rootPath: string,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (AMOUNT_STRING_PATTERN.test(line)) {
        const relPath = relative(rootPath, file);
        results.push({
          id: `code-amount-string-${relPath}:${i + 1}`,
          name: "trackEvent amount type",
          status: "warn",
          severity: "warn",
          message: `amount is passed as a string literal at ${relPath}:${i + 1} — use a number instead`,
          fix: "Pass amount as a numeric value, not a string",
          autoFixable: false,
        });
      }
    }
  }

  return results;
}

/**
 * Format the location of a match for display.
 */
function formatLocation(match: FileMatch, rootPath: string): string {
  const relPath = relative(rootPath, match.file);
  return `${relPath}:${match.line}`;
}

/**
 * Validate source code for correct SDK method usage.
 */
export async function validateCode(
  projectType: ProjectType,
  rootPath: string,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const docsUrl = DOC_LINKS[projectType];
  const patterns = PATTERNS[projectType];
  const extensions = EXTENSIONS[projectType];

  if (!patterns || !extensions) {
    return results;
  }

  // Build skip set from hardcoded dirs + .gitignore
  const skipSet = new Set(SKIP_DIRS);
  const gitignoreDirs = parseGitignore(rootPath);
  for (const dir of gitignoreDirs) {
    skipSet.add(dir);
  }

  // Collect all source files
  const files = walkFiles(rootPath, extensions, skipSet);

  if (files.length === 0) {
    results.push({
      id: "code-no-source-files",
      name: "Source files found",
      status: "warn",
      severity: "warn",
      message: `No source files (${extensions.join(", ")}) found in project`,
      autoFixable: false,
      docsUrl,
    });
    return results;
  }

  // 1. Check init() call
  const initMatches = findMatches(files, patterns.init);
  if (initMatches.length > 0) {
    const locations = initMatches
      .map((m) => formatLocation(m, rootPath))
      .join(", ");
    results.push({
      id: "code-init-call",
      name: "SDK init() call",
      status: "pass",
      severity: "error",
      message: `init() call found at ${locations}`,
      autoFixable: false,
      docsUrl,
    });
  } else {
    results.push({
      id: "code-init-call",
      name: "SDK init() call",
      status: "error",
      severity: "error",
      message: "No init() call found — the SDK will not start without it",
      fix: "Add an init() call in your app startup code",
      autoFixable: false,
      docsUrl,
    });
  }

  // 2. Check signup() call
  const signupMatches = findMatches(files, patterns.signup);
  if (signupMatches.length > 0) {
    const locations = signupMatches
      .map((m) => formatLocation(m, rootPath))
      .join(", ");
    results.push({
      id: "code-signup-call",
      name: "SDK signup() call",
      status: "pass",
      severity: "warn",
      message: `signup() call found at ${locations}`,
      autoFixable: false,
      docsUrl,
    });
  } else {
    results.push({
      id: "code-signup-call",
      name: "SDK signup() call",
      status: "warn",
      severity: "warn",
      message: "No signup() call found — user attribution will be limited without it",
      fix: "Add a signup() call after user registration or login",
      autoFixable: false,
      docsUrl,
    });
  }

  // 3. Check setUserData() call
  const setUserDataMatches = findMatches(files, patterns.setUserData);
  if (setUserDataMatches.length > 0) {
    const locations = setUserDataMatches
      .map((m) => formatLocation(m, rootPath))
      .join(", ");
    results.push({
      id: "code-setuserdata-call",
      name: "SDK setUserData() call",
      status: "pass",
      severity: "warn",
      message: `setUserData() call found at ${locations}`,
      autoFixable: false,
      docsUrl,
    });
  } else {
    results.push({
      id: "code-setuserdata-call",
      name: "SDK setUserData() call",
      status: "warn",
      severity: "warn",
      message: "No setUserData() call found — user data enrichment is recommended",
      fix: "Add a setUserData() call to pass user properties to Linkrunner",
      autoFixable: false,
      docsUrl,
    });
  }

  // 4. Check for amount passed as string in trackEvent calls
  const amountWarnings = findAmountStringWarnings(files, rootPath);
  if (amountWarnings.length > 0) {
    results.push(...amountWarnings);
  }

  return results;
}
