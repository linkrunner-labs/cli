import { spawnSync, type SpawnSyncOptions } from "child_process";

export interface SpawnResult {
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
}

export function spawn(
  cmd: string[],
  options?: SpawnSyncOptions
): SpawnResult {
  const [command, ...args] = cmd;
  if (!command) {
    return { exitCode: 1, stdout: Buffer.from(""), stderr: Buffer.from("No command provided") };
  }
  
  const result = spawnSync(command, args, {
    ...options,
    encoding: "buffer",
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? Buffer.from(""),
    stderr: result.stderr ?? Buffer.from(""),
  };
}

export function spawnWithInput(
  cmd: string[],
  input: Buffer
): SpawnResult {
  const [command, ...args] = cmd;
  if (!command) {
    return { exitCode: 1, stdout: Buffer.from(""), stderr: Buffer.from("No command provided") };
  }

  const result = spawnSync(command, args, {
    input,
    encoding: "buffer",
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? Buffer.from(""),
    stderr: result.stderr ?? Buffer.from(""),
  };
}
