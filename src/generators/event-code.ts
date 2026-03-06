import type { ProjectType } from "../types/index.js";

interface CustomEventParams {
  name: string;
  properties: Record<string, string>;
}

interface PaymentEventParams {
  amount: number;
  currency: string;
  transactionId?: string;
  properties?: Record<string, string>;
}

interface SignupEventParams {
  userId: string;
  name?: string;
  email?: string;
}

export type EventCodeParams =
  | { type: "custom"; params: CustomEventParams }
  | { type: "payment"; params: PaymentEventParams }
  | { type: "signup"; params: SignupEventParams };

function formatDartMap(props: Record<string, string>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "{}";
  const inner = entries.map(([k, v]) => `'${k}': '${v}'`).join(", ");
  return `{${inner}}`;
}

function formatJsObject(props: Record<string, string>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "{}";
  const inner = entries.map(([k, v]) => `${k}: '${v}'`).join(", ");
  return `{ ${inner} }`;
}

function formatKotlinMap(props: Record<string, string>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "mapOf()";
  const inner = entries.map(([k, v]) => `"${k}" to "${v}"`).join(", ");
  return `mapOf(${inner})`;
}

function formatSwiftDict(props: Record<string, string>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "[:]";
  const inner = entries.map(([k, v]) => `"${k}": "${v}"`).join(", ");
  return `[${inner}]`;
}

// --- Flutter (Dart) ---

function flutterEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom": {
      const data = formatDartMap(p.params.properties);
      if (Object.keys(p.params.properties).length === 0) {
        return `await LinkRunner().trackEvent(name: '${p.params.name}');`;
      }
      return `await LinkRunner().trackEvent(\n  name: '${p.params.name}',\n  data: ${data},\n);`;
    }
    case "payment": {
      const args = [
        `amount: ${p.params.amount}`,
        `currency: '${p.params.currency}'`,
      ];
      if (p.params.transactionId) {
        args.push(`transactionId: '${p.params.transactionId}'`);
      }
      if (p.params.properties && Object.keys(p.params.properties).length > 0) {
        args.push(`data: ${formatDartMap(p.params.properties)}`);
      }
      return `await LinkRunner().capturePayment(\n  ${args.join(",\n  ")},\n);`;
    }
    case "signup": {
      const fields = [`id: '${p.params.userId}'`];
      if (p.params.name) fields.push(`name: '${p.params.name}'`);
      if (p.params.email) fields.push(`email: '${p.params.email}'`);
      return `await LinkRunner().signup(\n  userData: LRUserData(\n    ${fields.join(",\n    ")},\n  ),\n);`;
    }
  }
}

// --- React Native / Expo (JS) ---

function reactNativeEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom": {
      const data = formatJsObject(p.params.properties);
      if (Object.keys(p.params.properties).length === 0) {
        return `await linkrunner.trackEvent('${p.params.name}');`;
      }
      return `await linkrunner.trackEvent('${p.params.name}', ${data});`;
    }
    case "payment": {
      const fields: string[] = [
        `amount: ${p.params.amount}`,
        `currency: '${p.params.currency}'`,
      ];
      if (p.params.transactionId) {
        fields.push(`transactionId: '${p.params.transactionId}'`);
      }
      if (p.params.properties && Object.keys(p.params.properties).length > 0) {
        fields.push(`data: ${formatJsObject(p.params.properties)}`);
      }
      return `await linkrunner.capturePayment({\n  ${fields.join(",\n  ")},\n});`;
    }
    case "signup": {
      const userFields: string[] = [`id: '${p.params.userId}'`];
      if (p.params.name) userFields.push(`name: '${p.params.name}'`);
      if (p.params.email) userFields.push(`email: '${p.params.email}'`);
      return `await linkrunner.signup({\n  user_data: {\n    ${userFields.join(",\n    ")},\n  },\n});`;
    }
  }
}

// --- Android (Kotlin) ---

function androidEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom": {
      const data = formatKotlinMap(p.params.properties);
      if (Object.keys(p.params.properties).length === 0) {
        return `LinkRunner.getInstance().trackEvent("${p.params.name}")`;
      }
      return `LinkRunner.getInstance().trackEvent("${p.params.name}", ${data})`;
    }
    case "payment": {
      const args = [
        `amount = ${p.params.amount}`,
        `currency = "${p.params.currency}"`,
      ];
      if (p.params.transactionId) {
        args.push(`transactionId = "${p.params.transactionId}"`);
      }
      if (p.params.properties && Object.keys(p.params.properties).length > 0) {
        args.push(`data = ${formatKotlinMap(p.params.properties)}`);
      }
      return `LinkRunner.getInstance().capturePayment(\n  ${args.join(",\n  ")},\n)`;
    }
    case "signup": {
      const fields = [`id = "${p.params.userId}"`];
      if (p.params.name) fields.push(`name = "${p.params.name}"`);
      if (p.params.email) fields.push(`email = "${p.params.email}"`);
      return `LinkRunner.getInstance().signup(\n  userData = UserDataRequest(\n    ${fields.join(",\n    ")},\n  ),\n)`;
    }
  }
}

// --- iOS (Swift) ---

function iosEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom": {
      const data = formatSwiftDict(p.params.properties);
      if (Object.keys(p.params.properties).length === 0) {
        return `try await LinkrunnerSDK.shared.trackEvent("${p.params.name}")`;
      }
      return `try await LinkrunnerSDK.shared.trackEvent("${p.params.name}", data: ${data})`;
    }
    case "payment": {
      const args = [
        `amount: ${p.params.amount}`,
        `currency: "${p.params.currency}"`,
      ];
      if (p.params.transactionId) {
        args.push(`transactionId: "${p.params.transactionId}"`);
      }
      if (p.params.properties && Object.keys(p.params.properties).length > 0) {
        args.push(`data: ${formatSwiftDict(p.params.properties)}`);
      }
      return `try await LinkrunnerSDK.shared.capturePayment(\n  ${args.join(",\n  ")}\n)`;
    }
    case "signup": {
      const fields = [`id: "${p.params.userId}"`];
      if (p.params.name) fields.push(`name: "${p.params.name}"`);
      if (p.params.email) fields.push(`email: "${p.params.email}"`);
      return `try await LinkrunnerSDK.shared.signup(\n  userData: UserData(\n    ${fields.join(",\n    ")}\n  )\n)`;
    }
  }
}

// --- Web (JS) ---

function webEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom": {
      const data = formatJsObject(p.params.properties);
      if (Object.keys(p.params.properties).length === 0) {
        return `LinkrunnerSDK.trackEvent('${p.params.name}');`;
      }
      return `LinkrunnerSDK.trackEvent('${p.params.name}', ${data});`;
    }
    case "payment": {
      const fields: string[] = [
        `amount: ${p.params.amount}`,
        `currency: '${p.params.currency}'`,
      ];
      if (p.params.transactionId) {
        fields.push(`transactionId: '${p.params.transactionId}'`);
      }
      if (p.params.properties && Object.keys(p.params.properties).length > 0) {
        fields.push(`data: ${formatJsObject(p.params.properties)}`);
      }
      return `LinkrunnerSDK.capturePayment({\n  ${fields.join(",\n  ")},\n});`;
    }
    case "signup": {
      return `// Web SDK does not have a signup method.\n// Use trackEvent for custom events instead.`;
    }
  }
}

// --- Capacitor (JS) ---

function capacitorEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom": {
      const data = formatJsObject(p.params.properties);
      if (Object.keys(p.params.properties).length === 0) {
        return `await linkrunner.trackEvent('${p.params.name}');`;
      }
      return `await linkrunner.trackEvent('${p.params.name}', ${data});`;
    }
    case "payment": {
      const fields: string[] = [
        `amount: ${p.params.amount}`,
        `currency: '${p.params.currency}'`,
      ];
      if (p.params.transactionId) {
        fields.push(`transactionId: '${p.params.transactionId}'`);
      }
      if (p.params.properties && Object.keys(p.params.properties).length > 0) {
        fields.push(`data: ${formatJsObject(p.params.properties)}`);
      }
      return `await linkrunner.capturePayment({\n  ${fields.join(",\n  ")},\n});`;
    }
    case "signup": {
      const userFields: string[] = [`id: '${p.params.userId}'`];
      if (p.params.name) userFields.push(`name: '${p.params.name}'`);
      if (p.params.email) userFields.push(`email: '${p.params.email}'`);
      return `await linkrunner.signup({\n  user_data: {\n    ${userFields.join(",\n    ")},\n  },\n});`;
    }
  }
}

const generators: Record<ProjectType, (p: EventCodeParams) => string> = {
  flutter: flutterEventCode,
  "react-native": reactNativeEventCode,
  expo: reactNativeEventCode,
  android: androidEventCode,
  ios: iosEventCode,
  web: webEventCode,
  capacitor: capacitorEventCode,
};

export function generateEventCode(
  type: ProjectType,
  params: EventCodeParams
): string {
  return generators[type](params);
}

export type { CustomEventParams, PaymentEventParams, SignupEventParams };
