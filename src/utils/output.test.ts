import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setJsonMode,
  isJsonMode,
  addJsonResult,
  getJsonResults,
  clearJsonResults,
  flushJsonResults,
  pass,
  warn,
  error,
  info,
  summary,
} from "./output.js";
import type { ValidationResult } from "../types/index.js";

beforeEach(() => {
  setJsonMode(false);
  clearJsonResults();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JSON mode state management", () => {
  it("defaults to non-JSON mode", () => {
    expect(isJsonMode()).toBe(false);
  });

  it("can enable and disable JSON mode", () => {
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
    setJsonMode(false);
    expect(isJsonMode()).toBe(false);
  });
});

describe("JSON results accumulation", () => {
  const sampleResult: ValidationResult = {
    id: "test-check",
    name: "Test Check",
    status: "pass",
    severity: "error",
    message: "All good",
    autoFixable: false,
  };

  it("accumulates results", () => {
    addJsonResult(sampleResult);
    addJsonResult({ ...sampleResult, id: "test-check-2", status: "error" });

    const results = getJsonResults();
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("test-check");
    expect(results[1]?.status).toBe("error");
  });

  it("clears results", () => {
    addJsonResult(sampleResult);
    expect(getJsonResults()).toHaveLength(1);

    clearJsonResults();
    expect(getJsonResults()).toHaveLength(0);
  });

  it("flushJsonResults outputs JSON and clears when in JSON mode", () => {
    setJsonMode(true);
    addJsonResult(sampleResult);

    flushJsonResults();

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify([sampleResult], null, 2)
    );
    expect(getJsonResults()).toHaveLength(0);
  });

  it("flushJsonResults does nothing when not in JSON mode", () => {
    setJsonMode(false);
    addJsonResult(sampleResult);

    flushJsonResults();

    expect(console.log).not.toHaveBeenCalled();
    expect(getJsonResults()).toHaveLength(1);
  });
});

describe("output functions suppress in JSON mode", () => {
  it("pass() outputs in normal mode", () => {
    pass("SDK installed");
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    ).toContain("SDK installed");
  });

  it("pass() is silent in JSON mode", () => {
    setJsonMode(true);
    pass("SDK installed");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("warn() outputs message and fix in normal mode", () => {
    warn("Old version", "Run: flutter pub upgrade");
    expect(console.log).toHaveBeenCalledTimes(2);
    expect(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    ).toContain("Old version");
    expect(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]
    ).toContain("flutter pub upgrade");
  });

  it("warn() without fix only outputs one line", () => {
    warn("Old version");
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("warn() is silent in JSON mode", () => {
    setJsonMode(true);
    warn("Old version", "fix it");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("error() outputs message and fix in normal mode", () => {
    error("Missing SDK", "Run: npm install sdk");
    expect(console.log).toHaveBeenCalledTimes(2);
    expect(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    ).toContain("Missing SDK");
  });

  it("error() is silent in JSON mode", () => {
    setJsonMode(true);
    error("Missing SDK");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("info() outputs in normal mode", () => {
    info("Checking configuration...");
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(
      (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    ).toContain("Checking configuration...");
  });

  it("info() is silent in JSON mode", () => {
    setJsonMode(true);
    info("Checking configuration...");
    expect(console.log).not.toHaveBeenCalled();
  });
});

describe("summary", () => {
  const makeResult = (status: "pass" | "warn" | "error"): ValidationResult => ({
    id: `check-${status}`,
    name: `Check ${status}`,
    status,
    severity: "error",
    message: `Result: ${status}`,
    autoFixable: false,
  });

  it("outputs counts in normal mode", () => {
    const results = [
      makeResult("pass"),
      makeResult("pass"),
      makeResult("warn"),
      makeResult("error"),
    ];

    summary(results);

    // summary prints a blank line + the summary line
    expect(console.log).toHaveBeenCalledTimes(2);
    const summaryLine = (console.log as ReturnType<typeof vi.fn>).mock
      .calls[1]?.[0] as string;
    expect(summaryLine).toContain("2 passed");
    expect(summaryLine).toContain("1 warnings");
    expect(summaryLine).toContain("1 errors");
  });

  it("omits warning/error counts when zero", () => {
    const results = [makeResult("pass"), makeResult("pass")];

    summary(results);

    const summaryLine = (console.log as ReturnType<typeof vi.fn>).mock
      .calls[1]?.[0] as string;
    expect(summaryLine).toContain("2 passed");
    expect(summaryLine).not.toContain("warnings");
    expect(summaryLine).not.toContain("errors");
  });

  it("outputs JSON in JSON mode", () => {
    setJsonMode(true);
    const results = [makeResult("pass"), makeResult("error")];

    summary(results);

    expect(console.log).toHaveBeenCalledWith(JSON.stringify(results, null, 2));
  });
});
