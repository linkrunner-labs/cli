import chalk from "chalk";
import { isAuthenticated, getEmail, clearAuth } from "../config/store.js";

export async function logoutCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log();
    console.log("  Not currently logged in.");
    return;
  }

  const email = getEmail();
  clearAuth();

  console.log();
  console.log(`  Logged out from ${chalk.cyan(email)}`);
}
