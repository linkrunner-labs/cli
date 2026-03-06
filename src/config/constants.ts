import type { ProjectType } from "../types/index.js";

export const CLI_VERSION = "0.1.0";

export const API_BASE_URLS = {
  production: "https://api.linkrunner.io",
  staging: "https://staging-api.linkrunner.io",
} as const;

export const DOC_LINKS: Record<ProjectType, string> = {
  flutter: "https://docs.linkrunner.io/sdks/flutter/getting-started",
  "react-native": "https://docs.linkrunner.io/sdks/react-native/getting-started",
  expo: "https://docs.linkrunner.io/sdks/expo/getting-started",
  ios: "https://docs.linkrunner.io/sdks/ios/getting-started",
  android: "https://docs.linkrunner.io/sdks/android/getting-started",
  capacitor: "https://docs.linkrunner.io/sdks/capacitor/getting-started",
  web: "https://docs.linkrunner.io/sdks/web/getting-started",
};

export const MIN_SDK_VERSIONS: Record<ProjectType, string> = {
  flutter: "3.0.0",
  "react-native": "2.0.0",
  expo: "3.0.0",
  ios: "3.0.0",
  android: "3.0.0",
  capacitor: "1.0.0",
  web: "1.0.0",
};
