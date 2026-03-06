import chalk from "chalk";
import inquirer from "inquirer";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { getProjectConfig } from "../config/store.js";
import { detectProjectType } from "../detectors/project-detector.js";
import { header, info, pass, error as logError, warn } from "../utils/output.js";

interface DeeplinkSetupOptions {
  domain?: string;
  skipAndroid?: boolean;
  skipIos?: boolean;
}

function createBackup(filePath: string): string {
  const backupPath = filePath + ".bak";
  copyFileSync(filePath, backupPath);
  return backupPath;
}

function buildIntentFilter(domain: string): string {
  return [
    `            <intent-filter android:autoVerify="true">`,
    `                <action android:name="android.intent.action.VIEW" />`,
    `                <category android:name="android.intent.category.DEFAULT" />`,
    `                <category android:name="android.intent.category.BROWSABLE" />`,
    `                <data android:scheme="https" android:host="${domain}" />`,
    `                <data android:scheme="http" android:host="${domain}" />`,
    `            </intent-filter>`,
  ].join("\n");
}

function hasDeepLinkIntentFilter(manifestContent: string, domain: string): boolean {
  return (
    manifestContent.includes('android:autoVerify="true"') &&
    manifestContent.includes(`android:host="${domain}"`)
  );
}

function insertIntentFilter(manifestContent: string, intentFilter: string): string | null {
  // Find the main activity (the one containing android.intent.action.MAIN)
  // and insert the intent-filter before its closing </activity> tag.
  const mainActionIndex = manifestContent.indexOf("android.intent.action.MAIN");
  if (mainActionIndex === -1) return null;

  // Find the </activity> that closes this main activity
  const closingTag = "</activity>";
  const closingIndex = manifestContent.indexOf(closingTag, mainActionIndex);
  if (closingIndex === -1) return null;

  const before = manifestContent.slice(0, closingIndex);
  const after = manifestContent.slice(closingIndex);

  return before + "\n" + intentFilter + "\n" + after;
}

function generateAssetLinks(packageName: string, fingerprints: string[]): string {
  const assetLinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
  return JSON.stringify(assetLinks, null, 2);
}

function generateAASA(teamId: string, bundleId: string): string {
  const aasa = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId}.${bundleId}`,
          paths: ["*"],
        },
      ],
    },
  };
  return JSON.stringify(aasa, null, 2);
}

async function setupAndroid(
  domain: string,
  manifestPath: string,
  androidConfig: { package_name: string; sha256_cert_fingerprints?: string[] },
): Promise<void> {
  header("Android Configuration");

  // Check AndroidManifest.xml
  if (!existsSync(manifestPath)) {
    logError(`AndroidManifest.xml not found at ${manifestPath}`);
    return;
  }

  const manifestContent = readFileSync(manifestPath, "utf-8");

  if (hasDeepLinkIntentFilter(manifestContent, domain)) {
    pass("Deep link intent filter already present in AndroidManifest.xml");
  } else {
    const intentFilter = buildIntentFilter(domain);

    console.log();
    console.log(chalk.bold("  Intent filter will be added to AndroidManifest.xml:"));
    console.log();
    for (const line of intentFilter.split("\n")) {
      console.log(chalk.green(`  + ${line.trimStart()}`));
    }
    console.log();

    const { apply } = await inquirer.prompt<{ apply: boolean }>([
      {
        type: "confirm",
        name: "apply",
        message: "Apply this change?",
        default: true,
      },
    ]);

    if (apply) {
      const modified = insertIntentFilter(manifestContent, intentFilter);
      if (!modified) {
        logError(
          "Could not find main activity in AndroidManifest.xml",
          "Ensure your manifest has an activity with android.intent.action.MAIN",
        );
        return;
      }

      const backupPath = createBackup(manifestPath);
      info(`Backup: ${backupPath}`);
      writeFileSync(manifestPath, modified, "utf-8");
      pass("Intent filter added to AndroidManifest.xml");
    } else {
      info("Skipped AndroidManifest.xml modification");
    }
  }

  // Generate assetlinks.json
  const fingerprints = androidConfig.sha256_cert_fingerprints ?? [];
  if (fingerprints.length === 0) {
    warn(
      "No SHA-256 certificate fingerprints configured",
      "Add sha256_cert_fingerprints to the android section of .linkrunner.json",
    );
  }

  console.log();
  console.log(chalk.bold("  Digital Asset Links (assetlinks.json):"));
  console.log();
  const assetLinksJson = generateAssetLinks(androidConfig.package_name, fingerprints);
  for (const line of assetLinksJson.split("\n")) {
    console.log(`    ${chalk.white(line)}`);
  }
  console.log();
  info(`Host this at: https://${domain}/.well-known/assetlinks.json`);
}

async function setupIos(
  domain: string,
  iosConfig: { bundle_id: string; team_id?: string; app_prefix?: string },
): Promise<void> {
  header("iOS Configuration");

  // Associated Domains entitlement
  console.log(chalk.bold("  Add this Associated Domain to your Xcode project:"));
  console.log(`    ${chalk.cyan(`applinks:${domain}`)}`);
  console.log();

  // Generate AASA
  const teamId = iosConfig.app_prefix ?? iosConfig.team_id;
  if (!teamId) {
    warn(
      "No team_id or app_prefix configured",
      "Add team_id to the ios section of .linkrunner.json",
    );
    return;
  }

  console.log(chalk.bold("  Apple App Site Association:"));
  console.log();
  const aasaJson = generateAASA(teamId, iosConfig.bundle_id);
  for (const line of aasaJson.split("\n")) {
    console.log(`    ${chalk.white(line)}`);
  }
  console.log();
  info(`Host this at: https://${domain}/.well-known/apple-app-site-association`);
}

export async function deeplinkSetupCommand(options: DeeplinkSetupOptions): Promise<void> {
  const config = getProjectConfig();
  if (!config) {
    logError("No .linkrunner.json found", "Run `lr init` to set up your project first");
    process.exit(1);
  }

  const detected = detectProjectType();

  // Resolve domain
  let domain = options.domain ?? config.deep_link_domain;
  if (!domain) {
    const { inputDomain } = await inquirer.prompt<{ inputDomain: string }>([
      {
        type: "input",
        name: "inputDomain",
        message: "Enter your deep link domain:",
        validate: (input: string) => (input.trim() ? true : "Domain is required"),
      },
    ]);
    domain = inputDomain.trim();
  }

  header("Deep Link Setup");
  info(`Project: ${config.project_name}`);
  info(`Domain: ${domain}`);

  // Android setup
  if (!options.skipAndroid && config.android) {
    const manifestPath = detected?.paths.androidManifest;
    if (manifestPath) {
      await setupAndroid(domain, manifestPath, config.android);
    } else {
      warn("Could not find AndroidManifest.xml", "Ensure your Android project structure is correct");
    }
  }

  // iOS setup
  if (!options.skipIos && config.ios) {
    await setupIos(domain, config.ios);
  }

  // Final summary
  console.log();
  if (!config.android && !config.ios) {
    warn("No android or ios configuration found in .linkrunner.json");
  }
}
