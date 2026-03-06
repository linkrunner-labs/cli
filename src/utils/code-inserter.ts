import chalk from "chalk";
import inquirer from "inquirer";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { join } from "path";
import { info, pass, error as logError } from "./output.js";
import type { InsertionPoint } from "../llm/types.js";

const CONTEXT_LINES = 3;

function createBackup(filePath: string): string {
  const backupPath = filePath + ".bak";
  copyFileSync(filePath, backupPath);
  return backupPath;
}

export function showDiffPreview(
  filePath: string,
  insertionLine: number,
  codeToInsert: string,
): void {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const insertLines = codeToInsert.split("\n");
  const startContext = Math.max(0, insertionLine - 1 - CONTEXT_LINES);
  const endContext = Math.min(lines.length, insertionLine - 1 + CONTEXT_LINES);

  console.log();
  console.log(`  File: ${chalk.cyan(filePath)}`);
  console.log(`  ${"─".repeat(50)}`);

  // Lines before insertion point
  for (let i = startContext; i < insertionLine - 1; i++) {
    const lineNum = String(i + 1).padStart(4);
    console.log(`  ${chalk.dim(lineNum)} ${chalk.dim("│")} ${lines[i]}`);
  }

  // Inserted lines
  for (let j = 0; j < insertLines.length; j++) {
    const lineNum = String(insertionLine + j).padStart(4);
    console.log(`  ${chalk.green("+" + lineNum)} ${chalk.dim("│")} ${chalk.green(insertLines[j])}`);
  }

  // Lines after insertion point
  for (let i = insertionLine - 1; i < endContext; i++) {
    const lineNum = String(insertionLine + insertLines.length + (i - (insertionLine - 1))).padStart(4);
    console.log(`  ${chalk.dim(lineNum)} ${chalk.dim("│")} ${lines[i]}`);
  }

  console.log(`  ${"─".repeat(50)}`);
}

export function insertCodeAtLine(
  filePath: string,
  line: number,
  codeToInsert: string,
): void {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const insertLines = codeToInsert.split("\n");

  // Insert at the specified line (1-indexed, insert before that line)
  const insertIndex = Math.max(0, Math.min(line - 1, lines.length));
  lines.splice(insertIndex, 0, ...insertLines);

  writeFileSync(filePath, lines.join("\n"), "utf-8");
}

export async function promptAndInsertCode(
  rootPath: string,
  insertionPoint: InsertionPoint,
  snippetLabel: string,
): Promise<boolean> {
  const filePath = join(rootPath, insertionPoint.file);

  if (!existsSync(filePath)) {
    logError(`File not found: ${insertionPoint.file}`);
    return false;
  }

  if (insertionPoint.description) {
    info(insertionPoint.description);
  }

  showDiffPreview(filePath, insertionPoint.line, insertionPoint.code);

  const { apply } = await inquirer.prompt<{ apply: boolean }>([
    {
      type: "confirm",
      name: "apply",
      message: `Apply this change to ${insertionPoint.file}?`,
      default: true,
    },
  ]);

  if (!apply) {
    info(`Skipped auto-insertion for ${snippetLabel}. Copy the snippet above manually.`);
    return false;
  }

  const backupPath = createBackup(filePath);
  info(`Backup: ${backupPath}`);

  try {
    insertCodeAtLine(filePath, insertionPoint.line, insertionPoint.code);
    pass(`${snippetLabel} inserted into ${insertionPoint.file}`);
    return true;
  } catch (err) {
    logError(`Failed to insert ${snippetLabel}`);
    return false;
  }
}
