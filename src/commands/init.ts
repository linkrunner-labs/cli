import chalk from "chalk";
import inquirer from "inquirer";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { isAuthenticated } from "../config/store.js";
import { detectProjectType } from "../detectors/project-detector.js";
import { loginCommand } from "./login.js";
import {
  getProjects,
  getProjectToken,
  getSDKCredentials,
  createSDKCredentials,
  preCreateCheck,
  createProject,
  type Project,
  type SDKCredential,
} from "../api/project.js";
import { ApiError } from "../api/client.js";
import { generateCodeSnippets, type CodeSnippets } from "../generators/code.js";
import { generateProjectConfig, saveConfig } from "../generators/config.js";
import { spinner, header, info, pass, error as logError } from "../utils/output.js";
import { PROJECT_TYPES, type ProjectType } from "../types/index.js";

// --- Step 1: Detect project type ---

async function detectAndConfirmProjectType(): Promise<ProjectType> {
  const detected = detectProjectType();

  if (detected) {
    console.log();
    console.log(`  Detected project type: ${chalk.cyan(detected.type)}`);

    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: "confirm",
        name: "confirmed",
        message: `Is this a ${detected.type} project?`,
        default: true,
      },
    ]);

    if (confirmed) {
      return detected.type;
    }
  } else {
    console.log();
    console.log(chalk.yellow("  Could not auto-detect project type."));
  }

  const { projectType } = await inquirer.prompt<{ projectType: ProjectType }>([
    {
      type: "list",
      name: "projectType",
      message: "Select your project type:",
      choices: PROJECT_TYPES.map((t) => ({ name: t, value: t })),
    },
  ]);

  return projectType;
}

// --- Step 2: Authenticate ---

async function ensureAuthenticated(): Promise<void> {
  if (isAuthenticated()) return;

  console.log();
  console.log(chalk.yellow("  You need to log in first."));
  console.log();

  await loginCommand();

  if (!isAuthenticated()) {
    console.log(chalk.red("  Authentication required. Run `lr login` first."));
    process.exit(1);
  }
}

// --- Step 3: Select or create project ---

async function selectOrCreateProject(): Promise<Project> {
  const projectsSpinner = spinner("Fetching your projects...");
  let projects: Project[];

  try {
    const response = await getProjects();
    projects = response.data ?? [];
    projectsSpinner.succeed(`Found ${projects.length} project(s)`);
  } catch (err) {
    projectsSpinner.fail("Failed to fetch projects");
    if (err instanceof ApiError) {
      console.error(`  ${chalk.red(err.message)}`);
    }
    process.exit(1);
  }

  const choices = [
    ...projects.map((p) => ({
      name: `${p.name} (${p.company})`,
      value: String(p.id),
    })),
    { name: chalk.green("+ Create a new project"), value: "__create__" },
  ];

  const { selection } = await inquirer.prompt<{ selection: string }>([
    {
      type: "list",
      name: "selection",
      message: "Select a project:",
      choices,
    },
  ]);

  if (selection === "__create__") {
    return await createNewProject();
  }

  const selected = projects.find((p) => String(p.id) === selection);
  if (!selected) {
    console.error(chalk.red("  Project not found"));
    process.exit(1);
  }

  return selected;
}

async function createNewProject(): Promise<Project> {
  // Pre-create check for billing
  const checkSpinner = spinner("Checking account...");
  let billingAccounts: Array<{ id: number; name: string }> = [];

  try {
    const checkResponse = await preCreateCheck();
    billingAccounts = checkResponse.data?.billingAccounts ?? [];
    checkSpinner.succeed("Account verified");
  } catch (err) {
    checkSpinner.fail("Failed to check account");
    if (err instanceof ApiError) {
      console.error(`  ${chalk.red(err.message)}`);
    }
    process.exit(1);
  }

  const answers = await inquirer.prompt<{
    name: string;
    company: string;
    app_store_link: string;
    play_store_link: string;
  }>([
    {
      type: "input",
      name: "name",
      message: "Project name:",
      validate: (input: string) => (input.trim() ? true : "Project name is required"),
    },
    {
      type: "input",
      name: "company",
      message: "Company name:",
      validate: (input: string) => (input.trim() ? true : "Company name is required"),
    },
    {
      type: "input",
      name: "app_store_link",
      message: "App Store link (optional):",
    },
    {
      type: "input",
      name: "play_store_link",
      message: "Play Store link (optional):",
    },
  ]);

  if (!answers.app_store_link && !answers.play_store_link) {
    console.error(chalk.red("  At least one store link is required."));
    process.exit(1);
  }

  // Billing account selection
  let billingAccountId: number | undefined;
  let createNewBilling = false;

  if (billingAccounts.length > 0) {
    const { billingChoice } = await inquirer.prompt<{ billingChoice: string }>([
      {
        type: "list",
        name: "billingChoice",
        message: "Select billing account:",
        choices: billingAccounts.map((ba) => ({
          name: ba.name,
          value: String(ba.id),
        })),
      },
    ]);
    billingAccountId = parseInt(billingChoice, 10);
  } else {
    createNewBilling = true;
  }

  const createSpinner = spinner("Creating project...");
  try {
    const response = await createProject({
      name: answers.name.trim(),
      company: answers.company.trim(),
      app_store_link: answers.app_store_link.trim() || undefined,
      play_store_link: answers.play_store_link.trim() || undefined,
      billing_account_id: billingAccountId,
      create_new_billing_account: createNewBilling,
    });
    createSpinner.succeed(`Project "${answers.name.trim()}" created!`);
    return response.data;
  } catch (err) {
    createSpinner.fail("Failed to create project");
    if (err instanceof ApiError) {
      console.error(`  ${chalk.red(err.message)}`);
    }
    process.exit(1);
  }
}

// --- Step 4: Fetch credentials ---

async function fetchCredentials(
  projectId: number,
  projectType: ProjectType,
): Promise<{ projectToken: string; sdkCredentials: SDKCredential[] }> {
  const credSpinner = spinner("Fetching credentials...");

  try {
    const tokenResponse = await getProjectToken(projectId);
    const projectToken = tokenResponse.data?.token;

    if (!projectToken) {
      credSpinner.fail("No project token found");
      process.exit(1);
    }

    let sdkCreds: SDKCredential[] = [];
    try {
      const sdkResponse = await getSDKCredentials(projectId);
      sdkCreds = sdkResponse.data ?? [];
    } catch {
      // SDK credentials are optional
    }

    // Determine which platforms need credentials
    const needsAndroid = ["flutter", "react-native", "expo", "android", "capacitor"].includes(projectType);
    const needsIos = ["flutter", "react-native", "expo", "ios", "capacitor"].includes(projectType);

    const hasAndroid = sdkCreds.some((c) => c.platform === "ANDROID" && c.active);
    const hasIos = sdkCreds.some((c) => c.platform === "IOS" && c.active);

    // Create missing credentials
    if (needsAndroid && !hasAndroid) {
      try {
        const newCred = await createSDKCredentials(projectId, "ANDROID");
        sdkCreds.push(newCred.data);
      } catch {
        // Non-fatal
      }
    }
    if (needsIos && !hasIos) {
      try {
        const newCred = await createSDKCredentials(projectId, "IOS");
        sdkCreds.push(newCred.data);
      } catch {
        // Non-fatal
      }
    }

    credSpinner.succeed("Credentials fetched");
    return { projectToken, sdkCredentials: sdkCreds };
  } catch (err) {
    credSpinner.fail("Failed to fetch credentials");
    if (err instanceof ApiError) {
      console.error(`  ${chalk.red(err.message)}`);
    }
    process.exit(1);
  }
}

// --- Step 5: Install SDK ---

function getInstallCommand(projectType: ProjectType): { cmd: string; description: string } | null {
  switch (projectType) {
    case "flutter":
      return { cmd: "flutter pub add linkrunner", description: "Install Flutter SDK" };
    case "react-native":
      return { cmd: "npm install rn-linkrunner", description: "Install React Native SDK" };
    case "expo":
      return {
        cmd: "npm install rn-linkrunner && npx expo install expo-linkrunner",
        description: "Install Expo SDK",
      };
    case "web":
      return { cmd: "npm install @linkrunner/web-sdk", description: "Install Web SDK" };
    case "capacitor":
      return {
        cmd: "npm install capacitor-linkrunner && npx cap sync",
        description: "Install Capacitor SDK",
      };
    case "android":
    case "ios":
      // Native platforms need manual setup
      return null;
  }
}

async function installSDK(projectType: ProjectType): Promise<void> {
  const installCmd = getInstallCommand(projectType);

  if (!installCmd) {
    info(`Native ${projectType} SDK must be added manually. See the code snippets below.`);
    return;
  }

  console.log();
  console.log(`  Install command: ${chalk.cyan(installCmd.cmd)}`);

  const { shouldInstall } = await inquirer.prompt<{ shouldInstall: boolean }>([
    {
      type: "confirm",
      name: "shouldInstall",
      message: `Run "${installCmd.cmd}"?`,
      default: true,
    },
  ]);

  if (!shouldInstall) {
    info(`Skipped. Run manually: ${installCmd.cmd}`);
    return;
  }

  const installSpinner = spinner(installCmd.description);
  try {
    // Handle compound commands separated by &&
    const commands = installCmd.cmd.split("&&").map((c) => c.trim());
    let allSucceeded = true;

    for (const cmd of commands) {
      const args = cmd.split(" ").filter(Boolean);
      const result = Bun.spawnSync(args, {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        allSucceeded = false;
        break;
      }
    }

    if (allSucceeded) {
      installSpinner.succeed(`${installCmd.description} complete`);
    } else {
      installSpinner.warn(`Install may have issues. Run manually: ${installCmd.cmd}`);
    }
  } catch {
    installSpinner.warn(`Could not run install. Run manually: ${installCmd.cmd}`);
  }
}

// --- Step 6: Platform config modifications ---

function createBackup(filePath: string): string {
  const backupPath = filePath + ".bak";
  copyFileSync(filePath, backupPath);
  return backupPath;
}

interface FileModification {
  filePath: string;
  description: string;
  contentToAdd: string;
  check: () => boolean; // Returns true if modification is already present
}

function getConfigModifications(projectType: ProjectType): FileModification[] {
  const modifications: FileModification[] = [];
  const cwd = process.cwd();

  if (["flutter", "react-native", "expo", "capacitor"].includes(projectType)) {
    // Android: AndroidManifest.xml permissions
    const manifestPaths = [
      join(cwd, "android", "app", "src", "main", "AndroidManifest.xml"),
      join(cwd, "android", "src", "main", "AndroidManifest.xml"),
    ];

    for (const manifestPath of manifestPaths) {
      if (existsSync(manifestPath)) {
        modifications.push({
          filePath: manifestPath,
          description: "Add INTERNET and ACCESS_NETWORK_STATE permissions",
          contentToAdd: [
            '<uses-permission android:name="android.permission.INTERNET" />',
            '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
          ].join("\n"),
          check: () => {
            const content = readFileSync(manifestPath, "utf-8");
            return content.includes("android.permission.INTERNET");
          },
        });
        break;
      }
    }

    // iOS: Info.plist NSUserTrackingUsageDescription
    const iosDirs = [join(cwd, "ios")];
    for (const iosDir of iosDirs) {
      if (!existsSync(iosDir)) continue;

      // Find Info.plist
      const plistCandidates = [
        join(iosDir, "Runner", "Info.plist"),
      ];
      try {
        const entries = Bun.spawnSync(["ls", iosDir]).stdout.toString().split("\n");
        for (const entry of entries) {
          const name = entry.trim();
          if (name.endsWith(".xcodeproj")) {
            const appName = name.replace(".xcodeproj", "");
            plistCandidates.unshift(join(iosDir, appName, "Info.plist"));
          }
        }
      } catch {
        // ignore
      }

      for (const plistPath of plistCandidates) {
        if (existsSync(plistPath)) {
          modifications.push({
            filePath: plistPath,
            description: "Add NSUserTrackingUsageDescription for App Tracking Transparency",
            contentToAdd: [
              "<key>NSUserTrackingUsageDescription</key>",
              "<string>This identifier will be used to deliver personalized ads and improve your app experience.</string>",
            ].join("\n"),
            check: () => {
              const content = readFileSync(plistPath, "utf-8");
              return content.includes("NSUserTrackingUsageDescription");
            },
          });
          break;
        }
      }
    }
  }

  if (projectType === "expo") {
    // app.json: add expo-linkrunner plugin
    const appJsonPath = join(cwd, "app.json");
    if (existsSync(appJsonPath)) {
      modifications.push({
        filePath: appJsonPath,
        description: "Add expo-linkrunner plugin to app.json",
        contentToAdd: `["expo-linkrunner", { "userTrackingPermission": "This identifier will be used to deliver personalized ads." }]`,
        check: () => {
          const content = readFileSync(appJsonPath, "utf-8");
          return content.includes("expo-linkrunner");
        },
      });
    }
  }

  return modifications;
}

async function applyConfigModifications(projectType: ProjectType): Promise<void> {
  const modifications = getConfigModifications(projectType);

  if (modifications.length === 0) {
    return;
  }

  header("Platform Configuration");

  for (const mod of modifications) {
    if (mod.check()) {
      pass(`${mod.description} (already present)`);
      continue;
    }

    console.log();
    console.log(`  ${chalk.bold(mod.description)}`);
    console.log(`  File: ${chalk.dim(mod.filePath)}`);
    console.log();
    console.log(chalk.green("  + " + mod.contentToAdd.split("\n").join("\n  + ")));
    console.log();

    const { apply } = await inquirer.prompt<{ apply: boolean }>([
      {
        type: "confirm",
        name: "apply",
        message: "Apply this change?",
        default: true,
      },
    ]);

    if (!apply) {
      info(`Skipped: ${mod.description}`);
      continue;
    }

    // Create backup
    const backupPath = createBackup(mod.filePath);
    info(`Backup: ${backupPath}`);

    // Apply modification
    try {
      applyModification(mod);
      pass(mod.description);
    } catch (err) {
      logError(`Failed to apply: ${mod.description}`);
    }
  }
}

function applyModification(mod: FileModification): void {
  const content = readFileSync(mod.filePath, "utf-8");

  if (mod.filePath.endsWith("AndroidManifest.xml")) {
    // Add permissions before <application or after <manifest
    const lines = mod.contentToAdd.split("\n").map((l) => `    ${l}`).join("\n");
    const modified = content.replace(
      /(<manifest[^>]*>)/,
      `$1\n\n${lines}`,
    );
    writeFileSync(mod.filePath, modified, "utf-8");
    return;
  }

  if (mod.filePath.endsWith("Info.plist")) {
    // Add before closing </dict>
    const lines = mod.contentToAdd.split("\n").map((l) => `\t${l}`).join("\n");
    const modified = content.replace(
      /([\t ]*<\/dict>\s*<\/plist>)/,
      `${lines}\n$1`,
    );
    writeFileSync(mod.filePath, modified, "utf-8");
    return;
  }

  if (mod.filePath.endsWith("app.json")) {
    try {
      const appJson = JSON.parse(content);
      if (!appJson.expo) appJson.expo = {};
      if (!appJson.expo.plugins) appJson.expo.plugins = [];

      // Check if already present
      const hasPlugin = appJson.expo.plugins.some(
        (p: unknown) =>
          (typeof p === "string" && p === "expo-linkrunner") ||
          (Array.isArray(p) && p[0] === "expo-linkrunner"),
      );

      if (!hasPlugin) {
        appJson.expo.plugins.push([
          "expo-linkrunner",
          {
            userTrackingPermission:
              "This identifier will be used to deliver personalized ads.",
          },
        ]);
      }

      writeFileSync(mod.filePath, JSON.stringify(appJson, null, 2) + "\n", "utf-8");
    } catch {
      throw new Error("Failed to parse app.json");
    }
    return;
  }
}

// --- Step 7: Show code snippets (with optional LLM auto-insertion) ---

function displaySnippet(label: string, description: string, code: string): void {
  console.log(chalk.bold(`  ${label}`));
  console.log(chalk.dim(`  ${description}`));
  console.log();
  console.log(
    code
      .split("\n")
      .map((l) => `    ${chalk.white(l)}`)
      .join("\n"),
  );
  console.log();
}

async function tryAutoInsert(
  projectType: ProjectType,
  codeType: "init" | "signup" | "setUserData",
  snippetLabel: string,
): Promise<boolean> {
  const { autoInsert } = await inquirer.prompt<{ autoInsert: boolean }>([
    {
      type: "confirm",
      name: "autoInsert",
      message: "Would you like me to automatically insert this code?",
      default: true,
    },
  ]);

  if (!autoInsert) return false;

  try {
    const { getInsertionPoint } = await import("../llm/analyzer.js");
    const { promptAndInsertCode } = await import("../utils/code-inserter.js");

    const result = await getInsertionPoint(projectType, process.cwd(), codeType);
    const insertionPoint = result?.structured?.insertionPoint;

    if (!insertionPoint) {
      info("Could not determine where to insert the code. Copy the snippet above manually.");
      return false;
    }

    return await promptAndInsertCode(process.cwd(), insertionPoint, snippetLabel);
  } catch {
    info("Auto-insertion unavailable. Copy the snippet above manually.");
    return false;
  }
}

async function showAndInsertCodeSnippets(
  snippets: CodeSnippets,
  projectType: ProjectType,
): Promise<void> {
  header("Code Snippets");

  // 1. Initialization
  displaySnippet("1. Initialization", "Add this to your app startup:", snippets.init);
  await tryAutoInsert(projectType, "init", "init()");

  // 2. Signup
  displaySnippet("2. User Registration (Signup)", "Call once after user completes onboarding:", snippets.signup);
  await tryAutoInsert(projectType, "signup", "signup()");

  // 3. Set User Data
  displaySnippet("3. Set User Data", "Call each time the app opens with a logged-in user:", snippets.setUserData);
  await tryAutoInsert(projectType, "setUserData", "setUserData()");
}

// --- Step 9: Run doctor ---

async function runDoctor(): Promise<void> {
  const { shouldRunDoctor } = await inquirer.prompt<{ shouldRunDoctor: boolean }>([
    {
      type: "confirm",
      name: "shouldRunDoctor",
      message: "Run `lr doctor` to verify the setup?",
      default: true,
    },
  ]);

  if (!shouldRunDoctor) return;

  try {
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand({});
  } catch {
    info("Run `lr doctor` manually to verify your setup.");
  }
}

// --- Main init command ---

export async function initCommand(): Promise<void> {
  header("Linkrunner SDK Setup");

  // Step 1: Detect project type
  const projectType = await detectAndConfirmProjectType();

  // Step 2: Authenticate
  await ensureAuthenticated();

  // Step 3: Select or create project
  const project = await selectOrCreateProject();

  // Step 4: Fetch credentials
  const { projectToken, sdkCredentials } = await fetchCredentials(project.id, projectType);

  // Step 5: Install SDK
  await installSDK(projectType);

  // Step 6: Platform config modifications
  await applyConfigModifications(projectType);

  // Step 7: Generate and show code snippets
  const androidCred = sdkCredentials.find((c) => c.platform === "ANDROID" && c.active);
  const iosCred = sdkCredentials.find((c) => c.platform === "IOS" && c.active);

  // Pick the most relevant credential for code snippets
  const primaryCred = ["ios"].includes(projectType) ? iosCred : androidCred ?? iosCred;

  const snippets = generateCodeSnippets(projectType, {
    projectToken,
    secretKey: primaryCred?.secret_key,
    keyId: primaryCred?.key_id,
  });
  await showAndInsertCodeSnippets(snippets, projectType);

  // Step 8: Save .linkrunner.json
  const config = generateProjectConfig({
    project,
    projectToken,
    projectType,
    sdkCredentials,
  });
  const configPath = saveConfig(config);
  pass(`.linkrunner.json saved at ${configPath}`);

  // Step 9: Run doctor
  await runDoctor();

  // Done
  console.log();
  console.log(chalk.green.bold("  Setup complete!"));
  console.log();
  console.log(`  Project: ${chalk.cyan(project.name)}`);
  console.log(`  Platform: ${chalk.cyan(projectType)}`);
  console.log(`  Config: ${chalk.dim(configPath)}`);
  console.log();
  console.log(chalk.dim("  Run `lr doctor` anytime to verify your integration."));
  console.log();
}
