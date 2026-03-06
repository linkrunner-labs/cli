import chalk from "chalk";
import open from "open";
import inquirer from "inquirer";
import {
  isAuthenticated,
  getEmail,
  setCliToken,
  hasLegacyAuth,
} from "../config/store.js";
import {
  initiateDeviceAuth,
  pollDeviceToken,
  verifyCliToken,
} from "../api/auth.js";
import { ApiError } from "../api/client.js";
import { spinner } from "../utils/output.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginCommand(options?: {
  token?: string;
}): Promise<void> {
  // Support --token flag for non-interactive auth
  if (options?.token) {
    const verifySpinner = spinner("Verifying token...");
    try {
      const response = await verifyCliToken(options.token);
      const user = response.data?.user;
      setCliToken(options.token, user?.email ?? "");
      verifySpinner.succeed("Authenticated successfully!");
      console.log();
      console.log(`  Welcome, ${chalk.cyan(user?.email ?? "user")}!`);
    } catch (err) {
      verifySpinner.fail("Token verification failed");
      if (err instanceof Error) {
        console.error(`  ${chalk.red(err.message)}`);
      }
      process.exit(1);
    }
    return;
  }

  // Show deprecation warning for legacy auth
  if (hasLegacyAuth()) {
    console.log();
    console.log(
      chalk.yellow(
        "  Note: You are using legacy authentication. Please re-authenticate with `lr login` for improved security."
      )
    );
    console.log();
  }

  // Check if already authenticated
  if (isAuthenticated()) {
    const email = getEmail();
    console.log();
    console.log(`  Currently logged in as ${chalk.cyan(email)}`);
    console.log();

    const { reLogin } = await inquirer.prompt<{ reLogin: boolean }>([
      {
        type: "confirm",
        name: "reLogin",
        message: "Login with a different account?",
        default: false,
      },
    ]);

    if (!reLogin) {
      return;
    }
  }

  // Initiate device auth flow
  const initSpinner = spinner("Initiating authentication...");
  let deviceCode: string;
  let userCode: string;
  let verificationUrl: string;

  try {
    const response = await initiateDeviceAuth();
    deviceCode = response.data.device_code;
    userCode = response.data.user_code;
    verificationUrl = response.data.verification_url;
    initSpinner.succeed("Authentication initiated");
  } catch (err) {
    initSpinner.fail("Failed to initiate authentication");
    if (err instanceof ApiError) {
      console.error(`  ${chalk.red(err.message)}`);
    }
    process.exit(1);
  }

  // Display instructions
  console.log();
  console.log(`  Open ${chalk.cyan(verificationUrl)} and enter code:`);
  console.log();
  console.log(`    ${chalk.bold.yellow(userCode)}`);
  console.log();

  // Try to auto-open browser
  try {
    await open(verificationUrl);
    console.log(chalk.dim("  Browser opened automatically."));
  } catch {
    console.log(chalk.dim("  Open the URL above in your browser to continue."));
  }

  console.log();
  console.log(chalk.dim("  Waiting for authorization..."));
  console.log();

  // Poll for token
  const pollSpinner = spinner("Waiting for authorization...");
  const maxAttempts = 180; // 15 minutes / 5 seconds = 180

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(5000);

    try {
      const result = await pollDeviceToken(deviceCode);

      if (result.status === 202) {
        // Still pending, continue polling
        continue;
      }

      if (result.status === 200 && result.data?.token) {
        const token = result.data.token;
        const email = result.data.user?.email ?? "";
        setCliToken(token, email);
        pollSpinner.succeed("Logged in successfully!");
        console.log();
        console.log(`  Welcome, ${chalk.cyan(email || "user")}!`);
        return;
      }

      // Error states
      pollSpinner.fail(result.msg || "Authorization failed");
      process.exit(1);
    } catch {
      // Network errors during polling are non-fatal, keep retrying
      continue;
    }
  }

  pollSpinner.fail("Authorization timed out");
  console.log(
    chalk.dim("  The code has expired. Run `lr login` to try again.")
  );
  process.exit(1);
}
