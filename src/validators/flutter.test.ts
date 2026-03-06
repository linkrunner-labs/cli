import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockSpawnSync = vi.fn().mockReturnValue({
  stdout: { toString: () => "" },
});
vi.stubGlobal("Bun", { spawnSync: mockSpawnSync });

// Mock the sub-validators to isolate Flutter-specific logic
vi.mock("./android.js", () => ({
  validateAndroid: vi.fn().mockReturnValue([]),
}));

vi.mock("./ios.js", () => ({
  validateIos: vi.fn().mockReturnValue([]),
}));

import { existsSync, readFileSync } from "fs";
import { validateFlutter } from "./flutter.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockSpawnSync.mockReturnValue({
    stdout: { toString: () => "" },
  });
});

function setupFiles(
  existingPaths: string[],
  fileContents: Record<string, string>
) {
  mockExistsSync.mockImplementation((path) => {
    return existingPaths.some(
      (p) => (path as string).endsWith(p) || path === p
    );
  });
  mockReadFileSync.mockImplementation((path) => {
    for (const [key, val] of Object.entries(fileContents)) {
      if ((path as string).endsWith(key)) return val;
    }
    throw new Error(`ENOENT: ${path}`);
  });
}

describe("validateFlutter", () => {
  it("returns error when linkrunner is not in pubspec.yaml", () => {
    setupFiles(["pubspec.yaml"], {
      "pubspec.yaml": `
name: my_app
dependencies:
  flutter:
    sdk: flutter
  http: ^1.0.0
`,
    });

    const results = validateFlutter("/fake/flutter-app");
    const sdkCheck = results.find((r) => r.id === "flutter-sdk-installed");

    expect(sdkCheck).toBeDefined();
    expect(sdkCheck?.status).toBe("error");
    expect(sdkCheck?.message).toContain("not found");
    expect(sdkCheck?.fix).toContain("flutter pub add linkrunner");
    expect(sdkCheck?.autoFixable).toBe(true);
  });

  it("returns pass when linkrunner is in dependencies", () => {
    setupFiles(["pubspec.yaml"], {
      "pubspec.yaml": `
name: my_app
dependencies:
  flutter:
    sdk: flutter
  linkrunner: ^3.2.0
`,
    });

    const results = validateFlutter("/fake/flutter-app");
    const sdkCheck = results.find((r) => r.id === "flutter-sdk-installed");

    expect(sdkCheck).toBeDefined();
    expect(sdkCheck?.status).toBe("pass");
  });

  it("returns pass when linkrunner is in dev_dependencies", () => {
    setupFiles(["pubspec.yaml"], {
      "pubspec.yaml": `
name: my_app
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  linkrunner: ^3.2.0
`,
    });

    const results = validateFlutter("/fake/flutter-app");
    const sdkCheck = results.find((r) => r.id === "flutter-sdk-installed");
    expect(sdkCheck?.status).toBe("pass");
  });

  it("warns when linkrunner version is below minimum", () => {
    setupFiles(["pubspec.yaml"], {
      "pubspec.yaml": `
name: my_app
dependencies:
  linkrunner: ^2.0.0
`,
    });

    const results = validateFlutter("/fake/flutter-app");
    const versionCheck = results.find((r) => r.id === "flutter-sdk-version");

    expect(versionCheck).toBeDefined();
    expect(versionCheck?.status).toBe("warn");
    expect(versionCheck?.message).toContain("below minimum");
    expect(versionCheck?.fix).toContain("flutter pub upgrade");
  });

  it("passes when linkrunner version meets minimum", () => {
    setupFiles(["pubspec.yaml"], {
      "pubspec.yaml": `
name: my_app
dependencies:
  linkrunner: ^3.2.0
`,
    });

    const results = validateFlutter("/fake/flutter-app");
    const versionCheck = results.find((r) => r.id === "flutter-sdk-version");

    expect(versionCheck).toBeDefined();
    expect(versionCheck?.status).toBe("pass");
    expect(versionCheck?.message).toContain("up to date");
  });

  it("does not produce version check when linkrunner dep is not a string (e.g., path dep)", () => {
    setupFiles(["pubspec.yaml"], {
      "pubspec.yaml": `
name: my_app
dependencies:
  linkrunner:
    path: ../linkrunner
`,
    });

    const results = validateFlutter("/fake/flutter-app");
    const versionCheck = results.find((r) => r.id === "flutter-sdk-version");

    // Path dependency is an object, not a string, so no version check is produced
    expect(versionCheck).toBeUndefined();
  });

  it("handles pubspec.yaml that does not exist", () => {
    setupFiles([], {});

    const results = validateFlutter("/fake/flutter-app");
    const sdkCheck = results.find((r) => r.id === "flutter-sdk-installed");

    expect(sdkCheck).toBeDefined();
    expect(sdkCheck?.status).toBe("error");
  });
});

describe("semverGte (tested via validateFlutter version checks)", () => {
  const testVersionCheck = (version: string) => {
    setupFiles(["pubspec.yaml"], {
      "pubspec.yaml": `
name: app
dependencies:
  linkrunner: ${version}
`,
    });
    const results = validateFlutter("/fake/app");
    return results.find((r) => r.id === "flutter-sdk-version");
  };

  it("version exactly at minimum passes (3.0.0)", () => {
    const check = testVersionCheck("3.0.0");
    expect(check?.status).toBe("pass");
  });

  it("version above minimum passes (4.0.0)", () => {
    const check = testVersionCheck("4.0.0");
    expect(check?.status).toBe("pass");
  });

  it("version below minimum warns (2.9.9)", () => {
    const check = testVersionCheck("2.9.9");
    expect(check?.status).toBe("warn");
  });

  it("version with caret prefix is cleaned (^3.2.0)", () => {
    const check = testVersionCheck("^3.2.0");
    expect(check?.status).toBe("pass");
  });

  it("version with tilde prefix is cleaned (~3.0.0)", () => {
    const check = testVersionCheck("~3.0.0");
    expect(check?.status).toBe("pass");
  });
});
