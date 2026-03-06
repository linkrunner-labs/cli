import { doctorCommand } from "./doctor.js";

export interface AnalyzeOptions {
  json?: boolean;
  ci?: boolean;
  failOnWarn?: boolean;
}

export async function analyzeCommand(options: AnalyzeOptions): Promise<void> {
  await doctorCommand({ ...options, deep: true });
}
