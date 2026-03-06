import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGet, mockSet, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("conf", () => {
  return {
    default: class MockConf {
      get = mockGet;
      set = mockSet;
      delete = mockDelete;
    },
  };
});

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { existsSync, readFileSync } from "fs";
import {
  getAuthToken,
  isAuthenticated,
  hasLegacyAuth,
  getProjectConfig,
} from "./store.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.LINKRUNNER_TOKEN;
});

afterEach(() => {
  process.env = originalEnv;
});

describe("getAuthToken", () => {
  it("returns env var LINKRUNNER_TOKEN with highest precedence", () => {
    process.env.LINKRUNNER_TOKEN = "env-token";
    mockGet.mockReturnValue("stored-cli-token");

    const token = getAuthToken();
    expect(token).toBe("env-token");
  });

  it("returns cliToken when no env var is set", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "cliToken") return "cli-token-value";
      if (key === "authToken") return "auth-token-value";
      return undefined;
    });

    const token = getAuthToken();
    expect(token).toBe("cli-token-value");
  });

  it("falls back to legacy authToken when cliToken is not set", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "cliToken") return undefined;
      if (key === "authToken") return "legacy-auth-token";
      return undefined;
    });

    const token = getAuthToken();
    expect(token).toBe("legacy-auth-token");
  });

  it("returns undefined when no token is available", () => {
    mockGet.mockReturnValue(undefined);

    const token = getAuthToken();
    expect(token).toBeUndefined();
  });
});

describe("isAuthenticated", () => {
  it("returns true when LINKRUNNER_TOKEN env var is set", () => {
    process.env.LINKRUNNER_TOKEN = "some-token";
    mockGet.mockReturnValue(undefined);

    expect(isAuthenticated()).toBe(true);
  });

  it("returns true when cliToken is stored", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "cliToken") return "stored-token";
      return undefined;
    });

    expect(isAuthenticated()).toBe(true);
  });

  it("returns true when legacy authToken is stored", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "authToken") return "legacy-token";
      return undefined;
    });

    expect(isAuthenticated()).toBe(true);
  });

  it("returns false when no authentication exists", () => {
    mockGet.mockReturnValue(undefined);

    expect(isAuthenticated()).toBe(false);
  });
});

describe("hasLegacyAuth", () => {
  it("returns true when only authToken is stored (no cliToken)", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "cliToken") return undefined;
      if (key === "authToken") return "old-token";
      return undefined;
    });

    expect(hasLegacyAuth()).toBe(true);
  });

  it("returns false when cliToken is stored", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "cliToken") return "new-token";
      if (key === "authToken") return "old-token";
      return undefined;
    });

    expect(hasLegacyAuth()).toBe(false);
  });

  it("returns false when neither token is stored", () => {
    mockGet.mockReturnValue(undefined);

    expect(hasLegacyAuth()).toBe(false);
  });
});

describe("getProjectConfig", () => {
  it("parses a valid .linkrunner.json config", () => {
    const validConfig = {
      project_token: "tok_abc123",
      project_id: "proj_456",
      project_name: "My App",
      platforms: ["android", "ios"],
      deep_link_domain: "myapp.linkrunner.io",
      android: {
        package_name: "com.example.myapp",
      },
      ios: {
        bundle_id: "com.example.myapp",
        team_id: "ABCD1234",
      },
    };

    mockExistsSync.mockImplementation((path) => {
      return (path as string).endsWith(".linkrunner.json");
    });
    mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

    const config = getProjectConfig("/fake/project");
    expect(config).not.toBeNull();
    expect(config?.project_token).toBe("tok_abc123");
    expect(config?.project_name).toBe("My App");
    expect(config?.platforms).toEqual(["android", "ios"]);
    expect(config?.android?.package_name).toBe("com.example.myapp");
    expect(config?.ios?.bundle_id).toBe("com.example.myapp");
  });

  it("returns null when .linkrunner.json is not found", () => {
    mockExistsSync.mockReturnValue(false);

    const config = getProjectConfig("/fake/project");
    expect(config).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    mockExistsSync.mockImplementation((path) => {
      return (path as string).endsWith(".linkrunner.json");
    });
    mockReadFileSync.mockReturnValue("not valid json{{{");

    const config = getProjectConfig("/fake/project");
    expect(config).toBeNull();
  });

  it("returns null when schema validation fails (missing required fields)", () => {
    const invalidConfig = {
      project_token: "tok_abc123",
      // Missing project_id, project_name, platforms, deep_link_domain
    };

    mockExistsSync.mockImplementation((path) => {
      return (path as string).endsWith(".linkrunner.json");
    });
    mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

    const config = getProjectConfig("/fake/project");
    expect(config).toBeNull();
  });
});
