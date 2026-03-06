import { readFileSync, writeFileSync } from "fs";
import { parseXml, parseGradle } from "../utils/file-parser.js";
import type { ValidationResult, ProjectPaths, ProjectType } from "../types/index.js";

const DOCS_URL = "https://docs.linkrunner.io/sdks/android/getting-started";

function checkMinSdkVersion(paths: ProjectPaths): ValidationResult {
  const id = "android-min-sdk";
  const name = "Minimum SDK version";

  if (!paths.buildGradle) {
    return {
      id,
      name,
      status: "error",
      severity: "error",
      message: "Could not find build.gradle file",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  const gradle = parseGradle(paths.buildGradle);
  if (!gradle) {
    return {
      id,
      name,
      status: "error",
      severity: "error",
      message: "Could not parse build.gradle file",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  if (gradle.minSdkVersion === undefined) {
    // Variable reference (e.g. flutter.minSdkVersion) - can't validate
    return {
      id,
      name,
      status: "pass",
      severity: "error",
      message: "minSdkVersion is set via variable reference (unable to validate exact value)",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  if (gradle.minSdkVersion >= 21) {
    return {
      id,
      name,
      status: "pass",
      severity: "error",
      message: `minSdkVersion is ${gradle.minSdkVersion} (>= 21)`,
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  return {
    id,
    name,
    status: "error",
    severity: "error",
    message: `minSdkVersion is ${gradle.minSdkVersion}, but must be >= 21`,
    fix: "Set minSdkVersion to 21 or higher in build.gradle",
    autoFixable: true,
    docsUrl: DOCS_URL,
  };
}

function checkPermission(
  paths: ProjectPaths,
  permission: string,
  id: string,
  label: string,
): ValidationResult {
  if (!paths.androidManifest) {
    return {
      id,
      name: `${label} permission`,
      status: "error",
      severity: "error",
      message: "Could not find AndroidManifest.xml",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  let content: string;
  try {
    content = readFileSync(paths.androidManifest, "utf-8");
  } catch {
    return {
      id,
      name: `${label} permission`,
      status: "error",
      severity: "error",
      message: "Could not read AndroidManifest.xml",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  if (content.includes(permission)) {
    return {
      id,
      name: `${label} permission`,
      status: "pass",
      severity: "error",
      message: `${label} permission is declared`,
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  return {
    id,
    name: `${label} permission`,
    status: "error",
    severity: "error",
    message: `${label} permission is missing from AndroidManifest.xml`,
    fix: `Add <uses-permission android:name="${permission}" /> to AndroidManifest.xml`,
    autoFixable: true,
    docsUrl: DOCS_URL,
  };
}

function checkBackupRules(paths: ProjectPaths): ValidationResult {
  const id = "android-backup-rules";
  const name = "Backup rules configuration";

  if (!paths.androidManifest) {
    return {
      id,
      name,
      status: "warn",
      severity: "warn",
      message: "Could not find AndroidManifest.xml to check backup rules",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  const xml = parseXml(paths.androidManifest);
  if (!xml) {
    return {
      id,
      name,
      status: "warn",
      severity: "warn",
      message: "Could not parse AndroidManifest.xml",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  const manifest = xml.manifest as Record<string, unknown> | undefined;
  const application = manifest?.application as Record<string, unknown> | undefined;

  const hasFullBackup = !!application?.["@_android:fullBackupContent"];
  const hasDataExtraction = !!application?.["@_android:dataExtractionRules"];

  if (hasFullBackup || hasDataExtraction) {
    return {
      id,
      name,
      status: "pass",
      severity: "warn",
      message: "Backup rules are configured",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  return {
    id,
    name,
    status: "warn",
    severity: "warn",
    message: "Backup rules are not configured — Linkrunner install ID may persist across reinstalls",
    fix: 'Add android:fullBackupContent="@xml/linkrunner_backup_descriptor" and android:dataExtractionRules="@xml/linkrunner_backup_rules" to <application> in AndroidManifest.xml',
    autoFixable: true,
    docsUrl: DOCS_URL,
  };
}

function checkGradleVersion(paths: ProjectPaths): ValidationResult {
  const id = "android-gradle-version";
  const name = "Gradle version";

  if (!paths.gradleWrapper) {
    return {
      id,
      name,
      status: "warn",
      severity: "warn",
      message: "Could not find gradle-wrapper.properties",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  let content: string;
  try {
    content = readFileSync(paths.gradleWrapper, "utf-8");
  } catch {
    return {
      id,
      name,
      status: "warn",
      severity: "warn",
      message: "Could not read gradle-wrapper.properties",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  const match = content.match(/gradle-(\d+)\.(\d+)/);
  if (!match || !match[1]) {
    return {
      id,
      name,
      status: "warn",
      severity: "warn",
      message: "Could not determine Gradle version from gradle-wrapper.properties",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  const major = parseInt(match[1], 10);
  if (major >= 8) {
    return {
      id,
      name,
      status: "pass",
      severity: "warn",
      message: `Gradle version is ${match[1]}.${match[2]} (>= 8.0)`,
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  return {
    id,
    name,
    status: "warn",
    severity: "warn",
    message: `Gradle version is ${match[1]}.${match[2]}, recommended 8.0+`,
    fix: "Update distributionUrl in gradle-wrapper.properties to Gradle 8.0 or higher",
    autoFixable: false,
    docsUrl: DOCS_URL,
  };
}

function checkMavenCentral(paths: ProjectPaths, projectType: ProjectType): ValidationResult {
  const id = "android-maven-central";
  const name = "Maven Central repository";

  // Only an error for native Android projects
  if (projectType !== "android") {
    return {
      id,
      name,
      status: "pass",
      severity: "error",
      message: "Maven Central check skipped (managed by framework)",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  if (!paths.settingsGradle) {
    return {
      id,
      name,
      status: "error",
      severity: "error",
      message: "Could not find settings.gradle file",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  let content: string;
  try {
    content = readFileSync(paths.settingsGradle, "utf-8");
  } catch {
    return {
      id,
      name,
      status: "error",
      severity: "error",
      message: "Could not read settings.gradle file",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  if (content.includes("mavenCentral()")) {
    return {
      id,
      name,
      status: "pass",
      severity: "error",
      message: "mavenCentral() is configured in repositories",
      autoFixable: false,
      docsUrl: DOCS_URL,
    };
  }

  return {
    id,
    name,
    status: "error",
    severity: "error",
    message: "mavenCentral() is missing from settings.gradle repositories",
    fix: "Add mavenCentral() to the repositories block in settings.gradle",
    autoFixable: true,
    docsUrl: DOCS_URL,
  };
}

// --- Fix functions ---

export function fixMinSdkVersion(paths: ProjectPaths): boolean {
  if (!paths.buildGradle) return false;
  try {
    let content = readFileSync(paths.buildGradle, "utf-8");
    const replaced = content.replace(
      /(minSdk(?:Version)?\s*[=:]\s*)\d+/,
      "$121",
    );
    if (replaced === content) return false;
    writeFileSync(paths.buildGradle, replaced, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function fixInternetPermission(paths: ProjectPaths): boolean {
  return addPermission(paths, "android.permission.INTERNET");
}

export function fixNetworkStatePermission(paths: ProjectPaths): boolean {
  return addPermission(paths, "android.permission.ACCESS_NETWORK_STATE");
}

function addPermission(paths: ProjectPaths, permission: string): boolean {
  if (!paths.androidManifest) return false;
  try {
    let content = readFileSync(paths.androidManifest, "utf-8");
    if (content.includes(permission)) return true;

    const permissionLine = `    <uses-permission android:name="${permission}" />\n`;

    // Insert before <application
    const appIndex = content.indexOf("<application");
    if (appIndex !== -1) {
      content = content.slice(0, appIndex) + permissionLine + "\n" + content.slice(appIndex);
    } else {
      // Insert before closing </manifest>
      const closeIndex = content.lastIndexOf("</manifest>");
      if (closeIndex === -1) return false;
      content = content.slice(0, closeIndex) + permissionLine + "\n" + content.slice(closeIndex);
    }

    writeFileSync(paths.androidManifest, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function fixBackupRules(paths: ProjectPaths): boolean {
  if (!paths.androidManifest) return false;
  try {
    let content = readFileSync(paths.androidManifest, "utf-8");

    const appTagMatch = content.match(/<application\b[^>]*/);
    if (!appTagMatch) return false;

    let appTag = appTagMatch[0];
    let modified = false;

    if (!appTag.includes("android:fullBackupContent")) {
      appTag += `\n        android:fullBackupContent="@xml/linkrunner_backup_descriptor"`;
      modified = true;
    }
    if (!appTag.includes("android:dataExtractionRules")) {
      appTag += `\n        android:dataExtractionRules="@xml/linkrunner_backup_rules"`;
      modified = true;
    }

    if (!modified) return true;

    content = content.replace(appTagMatch[0], appTag);
    writeFileSync(paths.androidManifest, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function fixMavenCentral(paths: ProjectPaths): boolean {
  if (!paths.settingsGradle) return false;
  try {
    let content = readFileSync(paths.settingsGradle, "utf-8");
    if (content.includes("mavenCentral()")) return true;

    // Try to add inside dependencyResolutionManagement { repositories { ... } }
    const repoBlockMatch = content.match(/(repositories\s*\{[^}]*)(})/);
    if (repoBlockMatch && repoBlockMatch.index !== undefined) {
      const insertPos = repoBlockMatch.index + repoBlockMatch[1].length;
      content =
        content.slice(0, insertPos) +
        "\n        mavenCentral()\n    " +
        content.slice(insertPos);
      writeFileSync(paths.settingsGradle, content, "utf-8");
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// --- Main export ---

export function validateAndroid(paths: ProjectPaths, projectType: ProjectType): ValidationResult[] {
  const results: ValidationResult[] = [];

  results.push(checkMinSdkVersion(paths));
  results.push(checkPermission(paths, "android.permission.INTERNET", "android-internet-permission", "INTERNET"));
  results.push(checkPermission(paths, "android.permission.ACCESS_NETWORK_STATE", "android-network-state-permission", "ACCESS_NETWORK_STATE"));
  results.push(checkBackupRules(paths));
  results.push(checkGradleVersion(paths));
  results.push(checkMavenCentral(paths, projectType));

  return results;
}
