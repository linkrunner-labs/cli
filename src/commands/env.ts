import chalk from "chalk";
import { getEnvironment, setEnvironment } from "../config/store.js";
import { API_BASE_URLS } from "../config/constants.js";

const VALID_ENVS = ["production", "staging"] as const;
type Environment = (typeof VALID_ENVS)[number];

export async function envCommand(targetEnv?: string): Promise<void> {
  // No argument: display current environment
  if (!targetEnv) {
    const current = getEnvironment();
    const color = current === "production" ? chalk.green : chalk.yellow;
    console.log(`Current environment: ${color(current)}`);
    console.log(chalk.dim(`  API: ${API_BASE_URLS[current]}`));
    return;
  }

  if (!VALID_ENVS.includes(targetEnv as Environment)) {
    console.error(
      chalk.red(`Invalid environment "${targetEnv}".`),
      `Valid options: ${VALID_ENVS.join(", ")}`
    );
    process.exit(1);
  }

  const env = targetEnv as Environment;
  setEnvironment(env);

  const color = env === "production" ? chalk.green : chalk.yellow;
  console.log(`Switched to ${color(env)} environment.`);
  console.log(chalk.dim(`  API: ${API_BASE_URLS[env]}`));
}
