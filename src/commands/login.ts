import chalk from "chalk";
import inquirer from "inquirer";
import { isAuthenticated, getEmail, setAuthToken } from "../config/store.js";
import { sendMagicLink, verifyMagicLink } from "../api/auth.js";
import { ApiError } from "../api/client.js";
import { spinner } from "../utils/output.js";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractToken(input: string): string {
  // Accept full URL or raw token
  try {
    const url = new URL(input);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // Not a URL, treat as raw token
  }
  return input.trim();
}

export async function loginCommand(): Promise<void> {
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

  // Prompt for email
  const { email } = await inquirer.prompt<{ email: string }>([
    {
      type: "input",
      name: "email",
      message: "Enter your email:",
      validate: (input: string) => {
        if (!input.trim()) return "Email is required";
        if (!isValidEmail(input.trim())) return "Please enter a valid email address";
        return true;
      },
    },
  ]);

  const trimmedEmail = email.trim().toLowerCase();

  // Send magic link
  const sendSpinner = spinner("Sending magic link...");
  try {
    await sendMagicLink(trimmedEmail);
    sendSpinner.succeed("Magic link sent!");
  } catch (err) {
    sendSpinner.fail("Failed to send magic link");
    if (err instanceof ApiError) {
      console.error(`  ${chalk.red(err.message)}`);
    }
    process.exit(1);
  }

  console.log();
  console.log(`  Check your inbox at ${chalk.cyan(trimmedEmail)}`);
  console.log(`  The link expires in ${chalk.yellow("15 minutes")}`);
  console.log();

  // Offer to open browser or paste token
  const { method } = await inquirer.prompt<{ method: string }>([
    {
      type: "list",
      name: "method",
      message: "How would you like to verify?",
      choices: [
        { name: "Paste the token or URL from the email", value: "paste" },
        { name: "I'll open the link in my email myself", value: "wait" },
      ],
    },
  ]);

  if (method === "paste") {
    console.log();
    console.log(
      chalk.dim("  Tip: Copy the full URL from the email, or just the token parameter"),
    );
  }

  // Get token from user
  const { tokenInput } = await inquirer.prompt<{ tokenInput: string }>([
    {
      type: "input",
      name: "tokenInput",
      message: "Paste your token or magic link URL:",
      validate: (input: string) => {
        if (!input.trim()) return "Token is required";
        return true;
      },
    },
  ]);

  const token = extractToken(tokenInput);

  // Verify token
  const verifySpinner = spinner("Verifying...");
  try {
    const response = await verifyMagicLink(token);
    const jwt = response.data?.token;
    const userEmail = response.data?.user?.email ?? trimmedEmail;

    if (jwt) {
      setAuthToken(jwt, userEmail);
      verifySpinner.succeed("Logged in successfully!");
      console.log();
      console.log(`  Welcome, ${chalk.cyan(userEmail)}!`);
    } else {
      // New user account created — the response may not include a token in data
      // Re-verify or prompt user to try again
      setAuthToken(token, trimmedEmail);
      verifySpinner.succeed("Account created and logged in!");
      console.log();
      console.log(`  Welcome, ${chalk.cyan(trimmedEmail)}!`);
    }
  } catch (err) {
    verifySpinner.fail("Verification failed");
    if (err instanceof ApiError) {
      console.error(`  ${chalk.red(err.message)}`);
      if (err.statusCode === 401) {
        console.log(chalk.dim("  The link may have expired. Run `lr login` to try again."));
      }
    }
    process.exit(1);
  }
}
