import type { ProjectType } from "../types/index.js";
import type { EventParams, EventValue } from "../utils/event-value.js";

// Generated calls follow the SDK docs (docs.linkrunner.io/sdk/<platform>):
// trackEvent takes the event name plus eventData, and capturePayment takes
// amount, userId, paymentId, type, status and eventData. The Web SDK uses
// lr.track(name, data) for events, payments ("purchase") and signups.

export const PAYMENT_TYPES = [
  "FIRST_PAYMENT",
  "WALLET_TOPUP",
  "FUNDS_WITHDRAWAL",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_RENEWED",
  "ONE_TIME",
  "RECURRING",
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_STATUSES = [
  "PAYMENT_INITIATED",
  "PAYMENT_COMPLETED",
  "PAYMENT_FAILED",
  "PAYMENT_CANCELLED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

interface CustomEventParams {
  name: string;
  properties: EventParams;
}

interface PaymentEventParams {
  amount: number;
  userId?: string;
  paymentId?: string;
  // Left out means the SDK default (DEFAULT).
  type?: PaymentType;
  // Left out means the SDK default (PAYMENT_COMPLETED).
  status?: PaymentStatus;
  // Sent as eventData.
  properties?: EventParams;
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

const USER_ID_PLACEHOLDER = "USER_ID";
const PAYMENT_ID_PLACEHOLDER = "PAYMENT_ID";

const IOS_PAYMENT_TYPES: Record<PaymentType, string> = {
  FIRST_PAYMENT: ".firstPayment",
  WALLET_TOPUP: ".walletTopup",
  FUNDS_WITHDRAWAL: ".fundsWithdrawal",
  SUBSCRIPTION_CREATED: ".subscriptionCreated",
  SUBSCRIPTION_RENEWED: ".subscriptionRenewed",
  ONE_TIME: ".oneTime",
  RECURRING: ".recurring",
};

const IOS_PAYMENT_STATUSES: Record<PaymentStatus, string> = {
  PAYMENT_INITIATED: ".initiated",
  PAYMENT_COMPLETED: ".completed",
  PAYMENT_FAILED: ".failed",
  PAYMENT_CANCELLED: ".cancelled",
};

// --- String literals per language ---

function jsString(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function dartString(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$/g, "\\$")}'`;
}

function kotlinString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
}

function swiftString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function jsKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : jsString(key);
}

// Numbers and booleans are written the same way in Dart, JS, Kotlin and Swift.
function literal(value: EventValue, quote: (s: string) => string): string {
  return typeof value === "string" ? quote(value) : String(value);
}

function hasParams(props: EventParams | undefined): props is EventParams {
  return !!props && Object.keys(props).length > 0;
}

// --- Collections per language ---

function formatDartMap(props: EventParams): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "{}";
  const inner = entries
    .map(([k, v]) => `${dartString(k)}: ${literal(v, dartString)}`)
    .join(", ");
  return `{${inner}}`;
}

function formatJsObject(props: EventParams): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "{}";
  const inner = entries
    .map(([k, v]) => `${jsKey(k)}: ${literal(v, jsString)}`)
    .join(", ");
  return `{ ${inner} }`;
}

function formatKotlinMap(props: EventParams): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "mapOf()";
  const inner = entries
    .map(([k, v]) => `${kotlinString(k)} to ${literal(v, kotlinString)}`)
    .join(", ");
  return `mapOf(${inner})`;
}

function formatSwiftDict(props: EventParams): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "[:]";
  const inner = entries
    .map(([k, v]) => `${swiftString(k)}: ${literal(v, swiftString)}`)
    .join(", ");
  return `[${inner}]`;
}

// Kotlin does not turn an Int literal into a Double, so amounts need a
// decimal point there.
function kotlinDouble(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

// --- Flutter (Dart) ---

function flutterEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom": {
      const name = dartString(p.params.name);
      if (!hasParams(p.params.properties)) {
        return `await LinkRunner().trackEvent(eventName: ${name});`;
      }
      return `await LinkRunner().trackEvent(\n  eventName: ${name},\n  eventData: ${formatDartMap(p.params.properties)},\n);`;
    }
    case "payment": {
      const args = [
        `amount: ${p.params.amount}`,
        `userId: ${dartString(p.params.userId ?? USER_ID_PLACEHOLDER)}`,
        `paymentId: ${dartString(p.params.paymentId ?? PAYMENT_ID_PLACEHOLDER)}`,
      ];
      if (p.params.type) args.push(`type: PaymentType.${p.params.type}`);
      if (p.params.status) {
        args.push(`status: PaymentStatus.${p.params.status}`);
      }
      if (hasParams(p.params.properties)) {
        args.push(`eventData: ${formatDartMap(p.params.properties)}`);
      }
      return `await LinkRunner().capturePayment(\n  capturePayment: LRCapturePayment(\n    ${args.join(",\n    ")},\n  ),\n);`;
    }
    case "signup": {
      const fields = [`id: '${p.params.userId}'`];
      if (p.params.name) fields.push(`name: '${p.params.name}'`);
      if (p.params.email) fields.push(`email: '${p.params.email}'`);
      return `await LinkRunner().signup(\n  userData: LRUserData(\n    ${fields.join(",\n    ")},\n  ),\n);`;
    }
  }
}

// --- React Native / Expo / Capacitor (JS) ---

function jsTrackEvent(p: CustomEventParams): string {
  const name = jsString(p.name);
  if (!hasParams(p.properties)) {
    return `await linkrunner.trackEvent(${name});`;
  }
  return `await linkrunner.trackEvent(${name}, ${formatJsObject(p.properties)});`;
}

function jsPaymentFields(p: PaymentEventParams): string[] {
  const fields = [
    `amount: ${p.amount}`,
    `userId: ${jsString(p.userId ?? USER_ID_PLACEHOLDER)}`,
    `paymentId: ${jsString(p.paymentId ?? PAYMENT_ID_PLACEHOLDER)}`,
  ];
  if (p.type) fields.push(`type: ${jsString(p.type)}`);
  if (p.status) fields.push(`status: ${jsString(p.status)}`);
  return fields;
}

function jsSignup(p: SignupEventParams): string {
  const userFields: string[] = [`id: '${p.userId}'`];
  if (p.name) userFields.push(`name: '${p.name}'`);
  if (p.email) userFields.push(`email: '${p.email}'`);
  return `await linkrunner.signup({\n  user_data: {\n    ${userFields.join(",\n    ")},\n  },\n});`;
}

function reactNativeEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom":
      return jsTrackEvent(p.params);
    case "payment": {
      const fields = jsPaymentFields(p.params);
      if (hasParams(p.params.properties)) {
        fields.push(`eventData: ${formatJsObject(p.params.properties)}`);
      }
      return `await linkrunner.capturePayment({\n  ${fields.join(",\n  ")},\n});`;
    }
    case "signup":
      return jsSignup(p.params);
  }
}

function capacitorEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom":
      return jsTrackEvent(p.params);
    case "payment": {
      // The Capacitor SDK's capturePayment has no eventData field.
      const code = `await linkrunner.capturePayment({\n  ${jsPaymentFields(p.params).join(",\n  ")},\n});`;
      if (!hasParams(p.params.properties)) return code;
      const keys = Object.keys(p.params.properties).join(", ");
      return `// capturePayment on Capacitor does not accept eventData, so these parameters were left out: ${keys}\n${code}`;
    }
    case "signup":
      return jsSignup(p.params);
  }
}

// --- Android (Kotlin) ---

function androidEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom": {
      const name = kotlinString(p.params.name);
      if (!hasParams(p.params.properties)) {
        return `LinkRunner.getInstance().trackEvent(eventName = ${name})`;
      }
      return `LinkRunner.getInstance().trackEvent(\n  eventName = ${name},\n  eventData = ${formatKotlinMap(p.params.properties)},\n)`;
    }
    case "payment": {
      const args = [
        `paymentId = ${kotlinString(p.params.paymentId ?? PAYMENT_ID_PLACEHOLDER)}`,
        `userId = ${kotlinString(p.params.userId ?? USER_ID_PLACEHOLDER)}`,
        `amount = ${kotlinDouble(p.params.amount)}`,
      ];
      if (p.params.type) args.push(`type = PaymentType.${p.params.type}`);
      if (p.params.status) {
        args.push(`status = PaymentStatus.${p.params.status}`);
      }
      if (hasParams(p.params.properties)) {
        args.push(`eventData = ${formatKotlinMap(p.params.properties)}`);
      }
      return `val paymentData = CapturePaymentRequest(\n  ${args.join(",\n  ")},\n)\nLinkRunner.getInstance().capturePayment(paymentData)`;
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
      const name = swiftString(p.params.name);
      if (!hasParams(p.params.properties)) {
        return `await LinkrunnerSDK.shared.trackEvent(eventName: ${name})`;
      }
      return `await LinkrunnerSDK.shared.trackEvent(\n  eventName: ${name},\n  eventData: ${formatSwiftDict(p.params.properties)}\n)`;
    }
    case "payment": {
      const args = [
        `amount: ${p.params.amount}`,
        `userId: ${swiftString(p.params.userId ?? USER_ID_PLACEHOLDER)}`,
        `paymentId: ${swiftString(p.params.paymentId ?? PAYMENT_ID_PLACEHOLDER)}`,
      ];
      if (p.params.type) args.push(`type: ${IOS_PAYMENT_TYPES[p.params.type]}`);
      if (p.params.status) {
        args.push(`status: ${IOS_PAYMENT_STATUSES[p.params.status]}`);
      }
      if (hasParams(p.params.properties)) {
        args.push(`eventData: ${formatSwiftDict(p.params.properties)}`);
      }
      return `await LinkrunnerSDK.shared.capturePayment(\n  ${args.join(",\n  ")}\n)`;
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

function webTrack(name: string, props: EventParams): string {
  if (!hasParams(props)) return `lr.track(${jsString(name)});`;
  return `lr.track(${jsString(name)}, ${formatJsObject(props)});`;
}

function webEventCode(p: EventCodeParams): string {
  switch (p.type) {
    case "custom":
      return webTrack(p.params.name, p.params.properties);
    case "payment": {
      const rest = Object.fromEntries(
        Object.entries(p.params.properties ?? {}).filter(
          ([k]) => k !== "amount"
        )
      );
      return webTrack("purchase", { amount: p.params.amount, ...rest });
    }
    case "signup": {
      const details: EventParams = {};
      if (p.params.name) details.name = p.params.name;
      if (p.params.email) details.email = p.params.email;
      return `lr.identify(${jsString(p.params.userId)});\n${webTrack("signup", details)}`;
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
