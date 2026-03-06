import chalk from "chalk";
import { getAuthToken, getEnvironment } from "../config/store.js";
import { API_BASE_URLS } from "../config/constants.js";
import { spinner } from "../utils/output.js";
import type { AnalyzeRequest, AnalysisResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 60_000;

interface SSEChunk {
  type: "chunk" | "done" | "error";
  content?: string;
  message?: string;
}

function getBaseUrl(): string {
  const env = getEnvironment();
  return API_BASE_URLS[env];
}

function parseSSELine(line: string): SSEChunk | null {
  if (!line.startsWith("data: ")) return null;
  const json = line.slice(6).trim();
  if (!json) return null;

  try {
    return JSON.parse(json) as SSEChunk;
  } catch {
    return null;
  }
}

export async function analyzeWithLLM(
  request: AnalyzeRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<AnalysisResult | null> {
  const token = getAuthToken();
  if (!token) {
    console.log(
      `  ${chalk.yellow("WARN")} Not authenticated. Run ${chalk.cyan("`lr login`")} to enable AI analysis.`,
    );
    return null;
  }

  const url = `${getBaseUrl()}/api/v1/cli/analyze`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const spin = spinner("Analyzing with AI...");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
        Origin: "https://dashboard.linkrunner.io",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (res.status === 401) {
      spin.fail("Session expired");
      console.log(
        `  ${chalk.dim("Run")} ${chalk.cyan("`lr login`")} ${chalk.dim("to re-authenticate.")}`,
      );
      return null;
    }

    if (res.status === 429) {
      spin.fail("Rate limit reached");
      const retryAfter = res.headers.get("Retry-After");
      if (retryAfter) {
        console.log(
          `  ${chalk.dim(`Try again in ${retryAfter} seconds.`)}`,
        );
      } else {
        console.log(
          `  ${chalk.dim("Please wait a moment and try again.")}`,
        );
      }
      return null;
    }

    if (!res.ok) {
      spin.fail("Analysis failed");
      try {
        const body = (await res.json()) as { msg?: string };
        if (body.msg) {
          console.log(`  ${chalk.dim(body.msg)}`);
        }
      } catch {
        console.log(
          `  ${chalk.dim(`Server returned status ${res.status}`)}`,
        );
      }
      return null;
    }

    // Parse SSE stream
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      return await readSSEStream(res, spin);
    }

    // Fallback: non-streaming JSON response
    spin.succeed("Analysis complete");
    const body = (await res.json()) as { data?: { content?: string } };
    return {
      content: body.data?.content ?? "",
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      spin.fail("Analysis timed out");
      console.log(
        `  ${chalk.dim("The request took too long. Try again or reduce project size.")}`,
      );
      return null;
    }

    spin.fail("Could not connect to Linkrunner API");
    console.log(
      `  ${chalk.dim("Check your network connection and try again.")}`,
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readSSEStream(
  res: Response,
  spin: ReturnType<typeof spinner>,
): Promise<AnalysisResult | null> {
  const body = res.body;
  if (!body) {
    spin.fail("Empty response from server");
    return null;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const chunk = parseSSELine(trimmed);
        if (!chunk) continue;

        if (chunk.type === "error") {
          spin.fail("Analysis failed");
          if (chunk.message) {
            console.log(`  ${chalk.dim(chunk.message)}`);
          }
          return null;
        }

        if (chunk.type === "chunk" && chunk.content) {
          accumulated += chunk.content;
        }

        if (chunk.type === "done") {
          if (chunk.content) {
            accumulated = chunk.content;
          }
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!accumulated) {
    spin.fail("Empty analysis result");
    return null;
  }

  spin.succeed("Analysis complete");
  return { content: accumulated };
}
