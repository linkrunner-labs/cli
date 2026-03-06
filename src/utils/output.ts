import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { ValidationResult } from "../types/index.js";

let jsonMode = false;
const jsonResults: ValidationResult[] = [];

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function addJsonResult(result: ValidationResult): void {
  jsonResults.push(result);
}

export function getJsonResults(): ValidationResult[] {
  return jsonResults;
}

export function clearJsonResults(): void {
  jsonResults.length = 0;
}

export function flushJsonResults(): void {
  if (jsonMode) {
    console.log(JSON.stringify(jsonResults, null, 2));
    clearJsonResults();
  }
}

export function pass(message: string): void {
  if (jsonMode) return;
  console.log(`  ${chalk.green("PASS")} ${message}`);
}

export function warn(message: string, fix?: string): void {
  if (jsonMode) return;
  console.log(`  ${chalk.yellow("WARN")} ${message}`);
  if (fix) {
    console.log(`       ${chalk.dim(fix)}`);
  }
}

export function error(message: string, fix?: string): void {
  if (jsonMode) return;
  console.log(`  ${chalk.red("FAIL")} ${message}`);
  if (fix) {
    console.log(`       ${chalk.dim(fix)}`);
  }
}

export function info(message: string): void {
  if (jsonMode) return;
  console.log(`  ${chalk.blue("INFO")} ${message}`);
}

export function header(title: string): void {
  if (jsonMode) return;
  console.log();
  console.log(chalk.bold.underline(title));
  console.log();
}

export function summary(results: ValidationResult[]): void {
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log();
  console.log(
    chalk.bold("Summary: ") +
      chalk.green(`${passed} passed`) +
      (warnings > 0 ? chalk.yellow(` ${warnings} warnings`) : "") +
      (errors > 0 ? chalk.red(` ${errors} errors`) : "")
  );
}

export function diff(label: string, before: string, after: string): void {
  if (jsonMode) return;
  console.log();
  console.log(chalk.bold(label));
  console.log(chalk.red(`- ${before}`));
  console.log(chalk.green(`+ ${after}`));
}

export function spinner(text: string): Ora {
  return ora({ text, color: "cyan" }).start();
}
