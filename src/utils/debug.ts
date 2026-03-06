import chalk from "chalk";

let _debugEnabled = false;

export function isDebugEnabled(): boolean {
  return _debugEnabled;
}

export function setDebug(enabled: boolean): void {
  _debugEnabled = enabled;
}

export function debug(msg: string, ...args: unknown[]): void {
  if (!_debugEnabled) return;
  console.error(chalk.dim("[debug]"), msg, ...args);
}
