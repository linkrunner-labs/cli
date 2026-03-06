import chalk from "chalk";
import { isAuthenticated, getEmail, clearAuth } from "../config/store.js";

export async function logoutCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log();
    console.log("  Not currently logged in.");
    return;
  }

  if (process.env.LINKRUNNER_TOKEN) {
    console.log();
    console.log(
      chalk.yellow("  Note: LINKRUNNER_TOKEN environment variable is set.")
    );
    console.log(
      "  Unset it to fully log out: " + chalk.dim("unset LINKRUNNER_TOKEN")
    );
  }

  const email = getEmail();
  clearAuth();

  console.log();
  console.log(`  Logged out from ${chalk.cyan(email)}`);
}
