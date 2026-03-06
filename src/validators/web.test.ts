import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { validateWeb } from "./web.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: nothing exists, no files
  mockExistsSync.mockReturnValue(false);
  mockReaddirSync.mockReturnValue([]);
});

function setupPackageJson(
  deps: Record<string, string> = {},
  devDeps: Record<string, string> = {}
) {
  mockExistsSync.mockImplementation((path) => {
    return (path as string).endsWith("package.json");
  });
  mockReadFileSync.mockImplementation((path) => {
    if ((path as string).endsWith("package.json")) {
      return JSON.stringify({
        name: "test-web-app",
        dependencies: deps,
        devDependencies: devDeps,
      });
    }
    throw new Error("ENOENT");
  });
}

describe("validateWeb", () => {
  describe("SDK installed check", () => {
    it("returns error when @linkrunner/web-sdk is not in package.json", () => {
      setupPackageJson({ next: "^14.0.0" });

      const results = validateWeb("/fake/web-project");
      const sdkCheck = results.find((r) => r.id === "web-sdk-installed");

      expect(sdkCheck).toBeDefined();
      expect(sdkCheck?.status).toBe("error");
      expect(sdkCheck?.message).toContain("not found");
      expect(sdkCheck?.fix).toContain("npm install @linkrunner/web-sdk");
      expect(sdkCheck?.autoFixable).toBe(true);
    });

    it("returns pass when @linkrunner/web-sdk is in dependencies", () => {
      setupPackageJson({ "@linkrunner/web-sdk": "^1.0.0" });

      const results = validateWeb("/fake/web-project");
      const sdkCheck = results.find((r) => r.id === "web-sdk-installed");

      expect(sdkCheck?.status).toBe("pass");
      expect(sdkCheck?.message).toContain("found");
    });

    it("returns pass when @linkrunner/web-sdk is in devDependencies", () => {
      setupPackageJson({}, { "@linkrunner/web-sdk": "^1.0.0" });

      const results = validateWeb("/fake/web-project");
      const sdkCheck = results.find((r) => r.id === "web-sdk-installed");

      expect(sdkCheck?.status).toBe("pass");
    });
  });

  describe("SDK init call detection", () => {
    it("returns warn when no SDK init call is found in source", () => {
      setupPackageJson({ "@linkrunner/web-sdk": "^1.0.0" });

      const results = validateWeb("/fake/web-project");
      const initCheck = results.find((r) => r.id === "web-sdk-init");

      expect(initCheck).toBeDefined();
      expect(initCheck?.status).toBe("warn");
      expect(initCheck?.message).toContain("Could not find SDK initialization");
    });

    it("returns pass when LinkrunnerSDK.init() is found in source", () => {
      // Setup: package.json exists, src dir exists with a .ts file containing init
      mockExistsSync.mockImplementation((path) => {
        const p = path as string;
        return (
          p.endsWith("package.json") ||
          p.endsWith("/src") ||
          p === "/fake/web-project/src"
        );
      });
      mockReadFileSync.mockImplementation((path) => {
        const p = path as string;
        if (p.endsWith("package.json")) {
          return JSON.stringify({
            name: "app",
            dependencies: { "@linkrunner/web-sdk": "^1.0.0" },
          });
        }
        if (p.endsWith("app.ts")) {
          return `
import LinkrunnerSDK from '@linkrunner/web-sdk';
LinkrunnerSDK.init({
  token: 'my-token',
});
`;
        }
        throw new Error("ENOENT");
      });
      mockReaddirSync.mockImplementation((dir) => {
        if ((dir as string).endsWith("/src")) {
          return ["app.ts"] as unknown as ReturnType<typeof readdirSync>;
        }
        return [] as unknown as ReturnType<typeof readdirSync>;
      });
      mockStatSync.mockImplementation(() => {
        return { isDirectory: () => false, isFile: () => true } as ReturnType<
          typeof statSync
        >;
      });

      const results = validateWeb("/fake/web-project");
      const initCheck = results.find((r) => r.id === "web-sdk-init");

      expect(initCheck?.status).toBe("pass");
      expect(initCheck?.message).toContain("initialization call found");
    });

    it("returns pass when useLinkrunner() hook is found", () => {
      mockExistsSync.mockImplementation((path) => {
        const p = path as string;
        return p.endsWith("package.json") || p.endsWith("/src");
      });
      mockReadFileSync.mockImplementation((path) => {
        const p = path as string;
        if (p.endsWith("package.json")) {
          return JSON.stringify({
            name: "app",
            dependencies: { "@linkrunner/web-sdk": "^1.0.0" },
          });
        }
        if (p.endsWith("App.tsx")) {
          return `
const lr = useLinkrunner({ token: 'abc' });
`;
        }
        throw new Error("ENOENT");
      });
      mockReaddirSync.mockImplementation((dir) => {
        if ((dir as string).endsWith("/src")) {
          return ["App.tsx"] as unknown as ReturnType<typeof readdirSync>;
        }
        return [] as unknown as ReturnType<typeof readdirSync>;
      });
      mockStatSync.mockImplementation(() => {
        return { isDirectory: () => false, isFile: () => true } as ReturnType<
          typeof statSync
        >;
      });

      const results = validateWeb("/fake/web-project");
      const initCheck = results.find((r) => r.id === "web-sdk-init");

      expect(initCheck?.status).toBe("pass");
    });

    it("skips node_modules and dist during scanning", () => {
      mockExistsSync.mockImplementation((path) => {
        const p = path as string;
        return p.endsWith("package.json") || p.endsWith("/src");
      });
      mockReadFileSync.mockImplementation((path) => {
        if ((path as string).endsWith("package.json")) {
          return JSON.stringify({
            name: "app",
            dependencies: { "@linkrunner/web-sdk": "^1.0.0" },
          });
        }
        throw new Error("ENOENT");
      });
      mockReaddirSync.mockImplementation((dir) => {
        if ((dir as string).endsWith("/src")) {
          return [
            "node_modules",
            "dist",
            ".git",
          ] as unknown as ReturnType<typeof readdirSync>;
        }
        return [] as unknown as ReturnType<typeof readdirSync>;
      });

      const results = validateWeb("/fake/web-project");
      const initCheck = results.find((r) => r.id === "web-sdk-init");

      // Should warn because the scanner skips those directories and finds no init
      expect(initCheck?.status).toBe("warn");
      // statSync should not have been called for those skipped dirs
      expect(mockStatSync).not.toHaveBeenCalled();
    });
  });
});
