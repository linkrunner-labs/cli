import { describe, it, expect } from "vitest";
import { generateEventCode, type EventCodeParams } from "./event-code.js";
import { PROJECT_TYPES } from "../types/index.js";

// Expected output follows the SDK docs on docs.linkrunner.io (sdk/<platform>.mdx):
// - trackEvent: eventName + eventData (named on Flutter, iOS and Android,
//   positional on React Native, Expo and Capacitor)
// - capturePayment: amount, userId, paymentId, type, status, eventData
// - Web: lr.track(name, data); payments are lr.track('purchase', ...)

const customEvent: EventCodeParams = {
  type: "custom",
  params: {
    name: "plan_purchased",
    properties: { plan: "gold", amount_paid: 499, is_trial: false },
  },
};

const payment: EventCodeParams = {
  type: "payment",
  params: {
    amount: 499,
    userId: "user_123",
    paymentId: "pay_123",
    type: "FIRST_PAYMENT",
    status: "PAYMENT_INITIATED",
    properties: { plan: "gold", currency: "INR", is_trial: false },
  },
};

const RN_CUSTOM =
  "await linkrunner.trackEvent('plan_purchased', { plan: 'gold', amount_paid: 499, is_trial: false });";

const RN_PAYMENT = `await linkrunner.capturePayment({
  amount: 499,
  userId: 'user_123',
  paymentId: 'pay_123',
  type: 'FIRST_PAYMENT',
  status: 'PAYMENT_INITIATED',
  eventData: { plan: 'gold', currency: 'INR', is_trial: false },
});`;

describe("generateEventCode: trackEvent with mixed parameter types", () => {
  it("flutter uses eventName and eventData", () => {
    expect(generateEventCode("flutter", customEvent)).toBe(
      `await LinkRunner().trackEvent(
  eventName: 'plan_purchased',
  eventData: {'plan': 'gold', 'amount_paid': 499, 'is_trial': false},
);`
    );
  });

  it("react-native passes the name and data as positional arguments", () => {
    expect(generateEventCode("react-native", customEvent)).toBe(RN_CUSTOM);
  });

  it("expo uses the rn-linkrunner call", () => {
    expect(generateEventCode("expo", customEvent)).toBe(RN_CUSTOM);
  });

  it("capacitor passes the name and data as positional arguments", () => {
    expect(generateEventCode("capacitor", customEvent)).toBe(RN_CUSTOM);
  });

  it("ios uses eventName and eventData without try", () => {
    expect(generateEventCode("ios", customEvent)).toBe(
      `await LinkrunnerSDK.shared.trackEvent(
  eventName: "plan_purchased",
  eventData: ["plan": "gold", "amount_paid": 499, "is_trial": false]
)`
    );
  });

  it("android uses named eventName and eventData", () => {
    expect(generateEventCode("android", customEvent)).toBe(
      `LinkRunner.getInstance().trackEvent(
  eventName = "plan_purchased",
  eventData = mapOf("plan" to "gold", "amount_paid" to 499, "is_trial" to false),
)`
    );
  });

  it("web uses lr.track", () => {
    expect(generateEventCode("web", customEvent)).toBe(
      "lr.track('plan_purchased', { plan: 'gold', amount_paid: 499, is_trial: false });"
    );
  });
});

describe("generateEventCode: trackEvent without parameters", () => {
  const bare: EventCodeParams = {
    type: "custom",
    params: { name: "app_opened", properties: {} },
  };

  it.each([
    ["flutter", "await LinkRunner().trackEvent(eventName: 'app_opened');"],
    ["react-native", "await linkrunner.trackEvent('app_opened');"],
    ["expo", "await linkrunner.trackEvent('app_opened');"],
    ["capacitor", "await linkrunner.trackEvent('app_opened');"],
    ["ios", 'await LinkrunnerSDK.shared.trackEvent(eventName: "app_opened")'],
    [
      "android",
      'LinkRunner.getInstance().trackEvent(eventName = "app_opened")',
    ],
    ["web", "lr.track('app_opened');"],
  ] as const)("%s", (platform, expected) => {
    expect(generateEventCode(platform, bare)).toBe(expected);
  });
});

describe("generateEventCode: capturePayment", () => {
  it("flutter wraps the fields in LRCapturePayment", () => {
    expect(generateEventCode("flutter", payment)).toBe(
      `await LinkRunner().capturePayment(
  capturePayment: LRCapturePayment(
    amount: 499,
    userId: 'user_123',
    paymentId: 'pay_123',
    type: PaymentType.FIRST_PAYMENT,
    status: PaymentStatus.PAYMENT_INITIATED,
    eventData: {'plan': 'gold', 'currency': 'INR', 'is_trial': false},
  ),
);`
    );
  });

  it("react-native passes one object with eventData", () => {
    expect(generateEventCode("react-native", payment)).toBe(RN_PAYMENT);
  });

  it("expo uses the rn-linkrunner call", () => {
    expect(generateEventCode("expo", payment)).toBe(RN_PAYMENT);
  });

  it("capacitor leaves out eventData, which its capturePayment does not accept", () => {
    expect(generateEventCode("capacitor", payment)).toBe(
      `// capturePayment on Capacitor does not accept eventData, so these parameters were left out: plan, currency, is_trial
await linkrunner.capturePayment({
  amount: 499,
  userId: 'user_123',
  paymentId: 'pay_123',
  type: 'FIRST_PAYMENT',
  status: 'PAYMENT_INITIATED',
});`
    );
  });

  it("ios uses labelled arguments and enum cases", () => {
    expect(generateEventCode("ios", payment)).toBe(
      `await LinkrunnerSDK.shared.capturePayment(
  amount: 499,
  userId: "user_123",
  paymentId: "pay_123",
  type: .firstPayment,
  status: .initiated,
  eventData: ["plan": "gold", "currency": "INR", "is_trial": false]
)`
    );
  });

  it("android builds a CapturePaymentRequest with a Double amount", () => {
    expect(generateEventCode("android", payment)).toBe(
      `val paymentData = CapturePaymentRequest(
  paymentId = "pay_123",
  userId = "user_123",
  amount = 499.0,
  type = PaymentType.FIRST_PAYMENT,
  status = PaymentStatus.PAYMENT_INITIATED,
  eventData = mapOf("plan" to "gold", "currency" to "INR", "is_trial" to false),
)
LinkRunner.getInstance().capturePayment(paymentData)`
    );
  });

  it("web sends a purchase event with lr.track", () => {
    expect(generateEventCode("web", payment)).toBe(
      "lr.track('purchase', { amount: 499, plan: 'gold', currency: 'INR', is_trial: false });"
    );
  });

  it("leaves out type, status and eventData when they are not set", () => {
    const minimal: EventCodeParams = {
      type: "payment",
      params: { amount: 9.99, userId: "u1", paymentId: "p1" },
    };
    expect(generateEventCode("react-native", minimal)).toBe(
      `await linkrunner.capturePayment({
  amount: 9.99,
  userId: 'u1',
  paymentId: 'p1',
});`
    );
    expect(generateEventCode("ios", minimal)).toBe(
      `await LinkrunnerSDK.shared.capturePayment(
  amount: 9.99,
  userId: "u1",
  paymentId: "p1"
)`
    );
    expect(generateEventCode("android", minimal)).toContain("amount = 9.99,");
    expect(generateEventCode("capacitor", minimal)).not.toContain("//");
  });

  it("web keeps a single amount when the parameters also have one", () => {
    const dup: EventCodeParams = {
      type: "payment",
      params: { amount: 10, properties: { amount: "ignored", plan: "gold" } },
    };
    expect(generateEventCode("web", dup)).toBe(
      "lr.track('purchase', { amount: 10, plan: 'gold' });"
    );
  });
});

describe("generateEventCode: parameter types are kept on every platform", () => {
  for (const platform of PROJECT_TYPES) {
    it(`${platform} writes numbers and booleans as literals`, () => {
      const code = generateEventCode(platform, customEvent);
      expect(code).toMatch(/\b499\b/);
      expect(code).toMatch(/\bfalse\b/);
      expect(code).not.toMatch(/['"]499['"]/);
      expect(code).not.toMatch(/['"]false['"]/);
      expect(code).toMatch(/['"]gold['"]/);
    });
  }
});

describe("generateEventCode: escaping", () => {
  const tricky: EventCodeParams = {
    type: "custom",
    params: {
      name: "it's",
      properties: { "content-type": 'say "hi" for $5' },
    },
  };

  it("escapes JS strings and quotes keys that are not identifiers", () => {
    expect(generateEventCode("web", tricky)).toBe(
      `lr.track('it\\'s', { 'content-type': 'say "hi" for $5' });`
    );
  });

  it("escapes Dart quotes and dollar signs", () => {
    expect(generateEventCode("flutter", tricky)).toContain(
      `eventData: {'content-type': 'say "hi" for \\$5'}`
    );
    expect(generateEventCode("flutter", tricky)).toContain(
      `eventName: 'it\\'s'`
    );
  });

  it("escapes Kotlin quotes and dollar signs", () => {
    expect(generateEventCode("android", tricky)).toContain(
      `mapOf("content-type" to "say \\"hi\\" for \\$5")`
    );
  });

  it("escapes Swift quotes", () => {
    expect(generateEventCode("ios", tricky)).toContain(
      `["content-type": "say \\"hi\\" for $5"]`
    );
  });
});

describe("generateEventCode: web signup", () => {
  it("identifies the user and sends a signup event, as the Web SDK docs show", () => {
    const signup: EventCodeParams = {
      type: "signup",
      params: { userId: "user_123", name: "Asha", email: "asha@example.com" },
    };
    expect(generateEventCode("web", signup)).toBe(
      `lr.identify('user_123');
lr.track('signup', { name: 'Asha', email: 'asha@example.com' });`
    );
  });
});
