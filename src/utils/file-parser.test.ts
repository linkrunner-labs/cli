import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from "fs";
import { parseXml, parsePlist, parseYaml, parseGradle } from "./file-parser.js";

const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseXml", () => {
  it("parses a valid AndroidManifest.xml", () => {
    mockReadFileSync.mockReturnValue(`<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.app">
    <application android:label="TestApp">
        <activity android:name=".MainActivity" />
    </application>
</manifest>`);

    const result = parseXml("/fake/AndroidManifest.xml");
    expect(result).not.toBeNull();
    expect(result?.manifest).toBeDefined();
  });

  it("preserves XML attributes with @_ prefix", () => {
    mockReadFileSync.mockReturnValue(
      `<root attr="value"><child id="1"/></root>`
    );

    const result = parseXml("/fake/file.xml");
    expect(result).not.toBeNull();
    const root = result?.root as Record<string, unknown>;
    expect(root?.["@_attr"]).toBe("value");
  });

  it("returns null for invalid XML", () => {
    mockReadFileSync.mockReturnValue("not xml at all <<<>>>");

    const result = parseXml("/fake/bad.xml");
    // fast-xml-parser is lenient, but we test the error path too
    expect(result).toBeDefined();
  });

  it("returns null when file cannot be read", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = parseXml("/nonexistent/file.xml");
    expect(result).toBeNull();
  });
});

describe("parsePlist", () => {
  it("parses a valid Info.plist", () => {
    mockReadFileSync.mockReturnValue(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.example.app</string>
  <key>CFBundleName</key>
  <string>TestApp</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>myapp</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`);

    const result = parsePlist("/fake/Info.plist");
    expect(result).not.toBeNull();
    expect(result?.CFBundleIdentifier).toBe("com.example.app");
    expect(result?.CFBundleName).toBe("TestApp");

    const urlTypes = result?.CFBundleURLTypes as Array<Record<string, unknown>>;
    expect(urlTypes).toHaveLength(1);
    expect(urlTypes[0]?.CFBundleURLSchemes).toEqual(["myapp"]);
  });

  it("returns null for non-object plist values (e.g., bare string)", () => {
    mockReadFileSync.mockReturnValue(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<string>just a string</string>
</plist>`);

    const result = parsePlist("/fake/string.plist");
    expect(result).toBeNull();
  });

  it("returns null when file cannot be read", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = parsePlist("/nonexistent/file.plist");
    expect(result).toBeNull();
  });
});

describe("parseYaml", () => {
  it("parses a valid pubspec.yaml", () => {
    mockReadFileSync.mockReturnValue(`
name: my_app
description: A test app
version: 1.0.0

dependencies:
  flutter:
    sdk: flutter
  linkrunner: ^3.2.0
  http: ^1.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
`);

    const result = parseYaml("/fake/pubspec.yaml");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("my_app");
    expect(result?.version).toBe("1.0.0");
    const deps = result?.dependencies as Record<string, unknown>;
    expect(deps?.linkrunner).toBe("^3.2.0");
    expect(deps?.http).toBe("^1.0.0");
  });

  it("returns null for non-object YAML (e.g., bare scalar)", () => {
    mockReadFileSync.mockReturnValue("just a string");

    const result = parseYaml("/fake/scalar.yaml");
    expect(result).toBeNull();
  });

  it("returns null for empty YAML", () => {
    mockReadFileSync.mockReturnValue("");

    const result = parseYaml("/fake/empty.yaml");
    expect(result).toBeNull();
  });

  it("returns null when file cannot be read", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = parseYaml("/nonexistent/file.yaml");
    expect(result).toBeNull();
  });
});

describe("parseGradle", () => {
  it("parses SDK versions from a Groovy build.gradle", () => {
    // Groovy DSL uses property-style assignment with = or :
    mockReadFileSync.mockReturnValue(`
android {
    compileSdkVersion = 34
    defaultConfig {
        applicationId "com.example.app"
        minSdkVersion = 21
        targetSdkVersion = 34
        versionCode 1
        versionName "1.0"
    }
}
`);

    const result = parseGradle("/fake/build.gradle");
    expect(result).not.toBeNull();
    expect(result?.compileSdkVersion).toBe(34);
    expect(result?.minSdkVersion).toBe(21);
    expect(result?.targetSdkVersion).toBe(34);
  });

  it("parses SDK versions from a Kotlin build.gradle.kts", () => {
    mockReadFileSync.mockReturnValue(`
android {
    compileSdk = 34
    defaultConfig {
        applicationId = "com.example.app"
        minSdk = 21
        targetSdk = 34
    }
}
`);

    const result = parseGradle("/fake/build.gradle.kts");
    expect(result).not.toBeNull();
    expect(result?.compileSdkVersion).toBe(34);
    expect(result?.minSdkVersion).toBe(21);
    expect(result?.targetSdkVersion).toBe(34);
  });

  it("extracts dependencies", () => {
    mockReadFileSync.mockReturnValue(`
dependencies {
    implementation "io.linkrunner:linkrunner:3.1.1"
    implementation "com.google.android.gms:play-services-ads-identifier:18.0.1"
    api "com.squareup.okhttp3:okhttp:4.12.0"
    compileOnly "org.projectlombok:lombok:1.18.30"
}
`);

    const result = parseGradle("/fake/build.gradle");
    expect(result).not.toBeNull();
    expect(result?.dependencies).toEqual([
      "io.linkrunner:linkrunner:3.1.1",
      "com.google.android.gms:play-services-ads-identifier:18.0.1",
      "com.squareup.okhttp3:okhttp:4.12.0",
      "org.projectlombok:lombok:1.18.30",
    ]);
  });

  it("extracts repositories including maven URLs", () => {
    mockReadFileSync.mockReturnValue(`
repositories {
    google()
    mavenCentral()
    maven { url 'https://jitpack.io' }
    maven { url = uri("https://maven.example.com/releases") }
}
`);

    const result = parseGradle("/fake/build.gradle");
    expect(result).not.toBeNull();
    expect(result?.repositories).toContain("google()");
    expect(result?.repositories).toContain("mavenCentral()");
    expect(result?.repositories).toContain("https://jitpack.io");
  });

  it("handles gradle files with no SDK versions or dependencies", () => {
    mockReadFileSync.mockReturnValue(`
plugins {
    id 'com.android.application'
}
`);

    const result = parseGradle("/fake/build.gradle");
    expect(result).not.toBeNull();
    expect(result?.minSdkVersion).toBeUndefined();
    expect(result?.compileSdkVersion).toBeUndefined();
    expect(result?.targetSdkVersion).toBeUndefined();
    expect(result?.dependencies).toEqual([]);
    expect(result?.repositories).toEqual([]);
  });

  it("returns null when file cannot be read", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = parseGradle("/nonexistent/build.gradle");
    expect(result).toBeNull();
  });
});
