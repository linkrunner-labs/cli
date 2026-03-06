import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock Bun.spawnSync used for `ls` and `find` in resolveIosPaths
const mockSpawnSync = vi.fn().mockReturnValue({
  stdout: { toString: () => "" },
});

vi.stubGlobal("Bun", { spawnSync: mockSpawnSync });

import { existsSync, readFileSync } from "fs";
import { detectProjectType } from "./project-detector.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockSpawnSync.mockReturnValue({
    stdout: { toString: () => "" },
  });
});

function setupExistsSync(existingPaths: string[]) {
  mockExistsSync.mockImplementation((path) => {
    return existingPaths.some(
      (p) => (path as string).endsWith(p) || path === p
    );
  });
}

function setupReadFileSync(fileContents: Record<string, string>) {
  mockReadFileSync.mockImplementation((path) => {
    const content = fileContents[path as string];
    if (content !== undefined) return content;
    // Also match by ending
    for (const [key, val] of Object.entries(fileContents)) {
      if ((path as string).endsWith(key)) return val;
    }
    throw new Error(`ENOENT: ${path}`);
  });
}

describe("detectProjectType", () => {
  describe("Flutter detection", () => {
    it("detects a Flutter project by pubspec.yaml", () => {
      setupExistsSync(["pubspec.yaml"]);
      setupReadFileSync({
        "pubspec.yaml": `
name: my_app
dependencies:
  flutter:
    sdk: flutter
  linkrunner: ^3.2.0
`,
      });

      const result = detectProjectType("/fake/flutter-app");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("flutter");
      expect(result?.sdkVersion).toBe("3.2.0");
    });

    it("returns undefined sdkVersion when linkrunner is not in pubspec", () => {
      setupExistsSync(["pubspec.yaml"]);
      setupReadFileSync({
        "pubspec.yaml": `
name: my_app
dependencies:
  flutter:
    sdk: flutter
`,
      });

      const result = detectProjectType("/fake/flutter-app");
      expect(result?.type).toBe("flutter");
      expect(result?.sdkVersion).toBeUndefined();
    });
  });

  describe("React Native detection", () => {
    it("detects a React Native project", () => {
      setupExistsSync(["package.json"]);
      setupReadFileSync({
        "package.json": JSON.stringify({
          name: "my-rn-app",
          dependencies: {
            "react-native": "0.73.0",
            "rn-linkrunner": "^2.3.0",
          },
        }),
      });

      const result = detectProjectType("/fake/rn-app");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("react-native");
      expect(result?.sdkVersion).toBe("2.3.0");
    });
  });

  describe("Expo detection", () => {
    it("detects Expo project (expo in deps takes priority over react-native)", () => {
      setupExistsSync(["package.json"]);
      setupReadFileSync({
        "package.json": JSON.stringify({
          name: "my-expo-app",
          dependencies: {
            expo: "~50.0.0",
            "react-native": "0.73.0",
            "rn-linkrunner": "^2.1.0",
          },
        }),
      });

      const result = detectProjectType("/fake/expo-app");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("expo");
      // Expo uses same rn-linkrunner SDK
      expect(result?.sdkVersion).toBe("2.1.0");
    });
  });

  describe("Capacitor detection", () => {
    it("detects a Capacitor project", () => {
      setupExistsSync(["package.json"]);
      setupReadFileSync({
        "package.json": JSON.stringify({
          name: "my-cap-app",
          dependencies: {
            "@capacitor/core": "^5.0.0",
            "linkrunner-web-sdk": "^1.0.0",
          },
        }),
      });

      const result = detectProjectType("/fake/cap-app");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("capacitor");
      expect(result?.sdkVersion).toBe("1.0.0");
    });
  });

  describe("Android native detection", () => {
    it("detects an Android native project by build.gradle", () => {
      setupExistsSync(["build.gradle"]);
      setupReadFileSync({
        "build.gradle": `
dependencies {
    implementation "io.linkrunner:linkrunner:3.1.1"
}
`,
      });

      const result = detectProjectType("/fake/android-app");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("android");
      expect(result?.sdkVersion).toBe("3.1.1");
    });

    it("detects Android project with build.gradle.kts", () => {
      setupExistsSync(["build.gradle.kts"]);
      setupReadFileSync({
        "build.gradle.kts": `
dependencies {
    implementation("io.linkrunner:linkrunner:3.0.0")
}
`,
      });

      const result = detectProjectType("/fake/android-app");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("android");
    });
  });

  describe("iOS native detection", () => {
    it("detects iOS project by .xcodeproj presence", () => {
      // No package.json, no pubspec, no build.gradle
      setupExistsSync([]);
      mockSpawnSync.mockReturnValue({
        stdout: { toString: () => "MyApp.xcodeproj\nMyApp\nPodfile\n" },
      });

      const result = detectProjectType("/fake/ios-app");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("ios");
    });
  });

  describe("Web project detection", () => {
    it("detects a web project as fallback when package.json has no mobile frameworks", () => {
      setupExistsSync(["package.json"]);
      setupReadFileSync({
        "package.json": JSON.stringify({
          name: "my-website",
          dependencies: {
            next: "^14.0.0",
            "linkrunner-web": "^1.0.0",
          },
        }),
      });

      const result = detectProjectType("/fake/web-app");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("web");
      expect(result?.sdkVersion).toBe("1.0.0");
    });

    it("detects web project with linkrunner-web-sdk", () => {
      setupExistsSync(["package.json"]);
      setupReadFileSync({
        "package.json": JSON.stringify({
          name: "my-website",
          dependencies: {
            "linkrunner-web-sdk": "~1.2.0",
          },
        }),
      });

      const result = detectProjectType("/fake/web-app");
      expect(result?.type).toBe("web");
      expect(result?.sdkVersion).toBe("1.2.0");
    });
  });

  describe("no project detected", () => {
    it("returns null when no project markers are found", () => {
      setupExistsSync([]);
      mockSpawnSync.mockReturnValue({
        stdout: { toString: () => "README.md\nrandom.txt\n" },
      });

      const result = detectProjectType("/fake/empty-dir");
      expect(result).toBeNull();
    });
  });

  describe("SDK version extraction edge cases", () => {
    it("strips ^ prefix from semver in package.json", () => {
      setupExistsSync(["package.json"]);
      setupReadFileSync({
        "package.json": JSON.stringify({
          name: "rn-app",
          dependencies: {
            "react-native": "0.73.0",
            "rn-linkrunner": "^2.3.0",
          },
        }),
      });

      const result = detectProjectType("/fake/rn-app");
      expect(result?.sdkVersion).toBe("2.3.0");
    });

    it("strips ~ prefix from semver in package.json", () => {
      setupExistsSync(["package.json"]);
      setupReadFileSync({
        "package.json": JSON.stringify({
          name: "rn-app",
          dependencies: {
            "react-native": "0.73.0",
            "rn-linkrunner": "~2.1.5",
          },
        }),
      });

      const result = detectProjectType("/fake/rn-app");
      expect(result?.sdkVersion).toBe("2.1.5");
    });

    it("extracts version from Flutter pubspec with ^ prefix", () => {
      setupExistsSync(["pubspec.yaml"]);
      setupReadFileSync({
        "pubspec.yaml": `
name: app
dependencies:
  linkrunner: ^3.2.1
`,
      });

      const result = detectProjectType("/fake/flutter-app");
      expect(result?.sdkVersion).toBe("3.2.1");
    });
  });
});
