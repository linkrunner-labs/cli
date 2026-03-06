import { readFileSync, writeFileSync } from "fs";
import plist from "plist";
import { parsePlist } from "../utils/file-parser.js";
import type {
  ValidationResult,
  ProjectPaths,
  ProjectType,
} from "../types/index.js";

const DOCS_URL = "https://docs.linkrunner.io/sdks/ios/getting-started";
const SKAN_DOCS_URL =
  "https://docs.linkrunner.io/features/skadnetwork-integration";
const SKAN_ENDPOINT = "https://linkrunner-skan.com";
const DEFAULT_TRACKING_MESSAGE =
  "This identifier will be used to deliver personalized ads to you.";

function checkDeploymentTarget(paths: ProjectPaths): ValidationResult {
  const id = "ios-deployment-target";
  const name = "iOS deployment target";

  if (!paths.podfile) {
    return {
      id,
      name,
      status: "error",
      severity: "error",
      message: "Could not find Podfile",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  let content: string;
  try {
    content = readFileSync(paths.podfile, "utf-8");
  } catch {
    return {
      id,
      name,
      status: "error",
      severity: "error",
      message: "Could not read Podfile",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  // Match: platform :ios, '15.0' or platform :ios, "15.0"
  const match = content.match(
    /^\s*platform\s+:ios\s*,\s*['"](\d+\.?\d*)['"]$/m
  );
  if (!match) {
    // Check for commented-out platform line
    const commentedMatch = content.match(/^\s*#\s*platform\s+:ios/m);
    if (commentedMatch) {
      return {
        id,
        name,
        status: "error",
        severity: "error",
        message: "iOS platform line is commented out in Podfile",
        fix: "Uncomment and set: platform :ios, '15.0'",
        autoFixable: true,
        docsUrl: DOCS_URL,
      };
    }

    // Check for variable reference (e.g. min_ios_version_supported)
    const varMatch = content.match(/^\s*platform\s+:ios\s*,\s*(\w+)/m);
    if (varMatch) {
      return {
        id,
        name,
        status: "pass",
        severity: "error",
        message: `iOS deployment target is set via variable (${varMatch[1]}) — unable to validate exact value`,
        autoFixable: false,
        docsUrl: DOCS_URL,
      };
    }

    return {
      id,
      name,
      status: "error",
      severity: "error",
      message: "Could not find platform :ios declaration in Podfile",
      fix: "Add platform :ios, '15.0' to your Podfile",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  const version = parseFloat(match[1]!);
  if (version >= 15.0) {
    return {
      id,
      name,
      status: "pass",
      severity: "error",
      message: `iOS deployment target is ${match[1]} (>= 15.0)`,
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  return {
    id,
    name,
    status: "error",
    severity: "error",
    message: `iOS deployment target is ${match[1]}, but must be >= 15.0`,
    fix: "Set platform :ios, '15.0' in Podfile",
    autoFixable: true,
    docsUrl: DOCS_URL,
  };
}

function checkPlistKey(
  paths: ProjectPaths,
  key: string,
  expectedValue: string | null,
  id: string,
  label: string,
  docsUrl: string
): ValidationResult {
  if (!paths.infoPlist) {
    return {
      id,
      name: label,
      status: "warn",
      severity: "warn",
      message: "Could not find Info.plist",
      autoFixable: false,
      docsUrl,
    };
  }

  const plistData = parsePlist(paths.infoPlist);
  if (!plistData) {
    return {
      id,
      name: label,
      status: "warn",
      severity: "warn",
      message: "Could not parse Info.plist",
      autoFixable: false,
      docsUrl,
    };
  }

  const value = plistData[key];

  // Just check presence (no expected value)
  if (expectedValue === null) {
    if (value !== undefined && value !== "") {
      return {
        id,
        name: label,
        status: "pass",
        severity: "warn",
        message: `${key} is present in Info.plist`,
        autoFixable: false,
        docsUrl,
      };
    }
    return {
      id,
      name: label,
      status: "warn",
      severity: "warn",
      message: `${key} is missing from Info.plist`,
      fix: `Add ${key} to Info.plist`,
      autoFixable: true,
      docsUrl,
    };
  }

  // Check specific value
  if (value === expectedValue) {
    return {
      id,
      name: label,
      status: "pass",
      severity: "warn",
      message: `${key} is correctly set to ${expectedValue}`,
      autoFixable: false,
      docsUrl,
    };
  }

  if (value !== undefined && value !== "") {
    return {
      id,
      name: label,
      status: "warn",
      severity: "warn",
      message: `${key} is set to "${value}" but should be "${expectedValue}"`,
      fix: `Set ${key} to ${expectedValue} in Info.plist`,
      autoFixable: true,
      docsUrl,
    };
  }

  return {
    id,
    name: label,
    status: "warn",
    severity: "warn",
    message: `${key} is missing from Info.plist`,
    fix: `Add ${key} with value ${expectedValue} to Info.plist`,
    autoFixable: true,
    docsUrl,
  };
}

// --- Fix functions ---

export function fixDeploymentTarget(paths: ProjectPaths): boolean {
  if (!paths.podfile) return false;
  try {
    const content = readFileSync(paths.podfile, "utf-8");

    // Replace existing platform line (quoted version)
    const replaced = content.replace(
      /^(\s*)platform\s+:ios\s*,\s*['"][\d.]+['"]/m,
      "$1platform :ios, '15.0'"
    );
    if (replaced !== content) {
      writeFileSync(paths.podfile, replaced, "utf-8");
      return true;
    }

    // Uncomment commented-out platform line
    const uncommented = content.replace(
      /^(\s*)#\s*platform\s+:ios\s*,\s*['"][\d.]+['"]/m,
      "$1platform :ios, '15.0'"
    );
    if (uncommented !== content) {
      writeFileSync(paths.podfile, uncommented, "utf-8");
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function setPlistValue(
  paths: ProjectPaths,
  key: string,
  value: string
): boolean {
  if (!paths.infoPlist) return false;
  try {
    const content = readFileSync(paths.infoPlist, "utf-8");
    const data = plist.parse(content);
    if (typeof data !== "object" || data === null) return false;

    const dict = data as Record<string, unknown>;
    dict[key] = value;

    const output = plist.build(dict as plist.PlistObject);
    writeFileSync(paths.infoPlist, output, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function fixTrackingDescription(paths: ProjectPaths): boolean {
  return setPlistValue(
    paths,
    "NSUserTrackingUsageDescription",
    DEFAULT_TRACKING_MESSAGE
  );
}

export function fixSkanReportEndpoint(paths: ProjectPaths): boolean {
  return setPlistValue(
    paths,
    "NSAdvertisingAttributionReportEndpoint",
    SKAN_ENDPOINT
  );
}

export function fixSkanCopyEndpoint(paths: ProjectPaths): boolean {
  return setPlistValue(paths, "AttributionCopyEndpoint", SKAN_ENDPOINT);
}

// --- Main export ---

export function validateIos(
  _paths: ProjectPaths,
  _projectType: ProjectType
): ValidationResult[] {
  const results: ValidationResult[] = [];

  results.push(checkDeploymentTarget(_paths));
  results.push(
    checkPlistKey(
      _paths,
      "NSUserTrackingUsageDescription",
      null,
      "ios-tracking-description",
      "App Tracking Transparency description",
      DOCS_URL
    )
  );
  results.push(
    checkPlistKey(
      _paths,
      "NSAdvertisingAttributionReportEndpoint",
      SKAN_ENDPOINT,
      "ios-skan-report-endpoint",
      "SKAdNetwork report endpoint",
      SKAN_DOCS_URL
    )
  );
  results.push(
    checkPlistKey(
      _paths,
      "AttributionCopyEndpoint",
      SKAN_ENDPOINT,
      "ios-skan-copy-endpoint",
      "SKAdNetwork copy endpoint",
      SKAN_DOCS_URL
    )
  );

  return results;
}
