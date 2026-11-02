import { describe, it, expect, vi } from "vitest";

vi.mock("conf", () => ({
  default: class MockConf {
    get = vi.fn();
    set = vi.fn();
    delete = vi.fn();
  },
}));

import { FEATURES } from "./suggest.js";
import { PROJECT_TYPES } from "../types/index.js";

function feature(key: string) {
  const found = FEATURES.find((f) => f.key === key);
  if (!found) throw new Error(`feature ${key} not found`);
  return found;
}

// Examples follow the SDK docs on docs.linkrunner.io (sdk/<platform>.mdx).
describe("suggest examples match the SDK docs", () => {
  it("trackEvent", () => {
    expect(feature("trackEvent").example).toEqual({
      flutter:
        "await LinkRunner().trackEvent(eventName: 'event_name', eventData: {'plan': 'gold', 'amount': 499});",
      "react-native":
        "await linkrunner.trackEvent('event_name', { plan: 'gold', amount: 499 });",
      expo: "await linkrunner.trackEvent('event_name', { plan: 'gold', amount: 499 });",
      capacitor:
        "await linkrunner.trackEvent('event_name', { plan: 'gold', amount: 499 });",
      android:
        'LinkRunner.getInstance().trackEvent(eventName = "event_name", eventData = mapOf("plan" to "gold", "amount" to 499))',
      ios: 'await LinkrunnerSDK.shared.trackEvent(eventName: "event_name", eventData: ["plan": "gold", "amount": 499])',
      web: "lr.track('event_name', { plan: 'gold', amount: 499 });",
    });
  });

  it("capturePayment", () => {
    expect(feature("capturePayment").example).toEqual({
      flutter:
        "await LinkRunner().capturePayment(capturePayment: LRCapturePayment(amount: 9.99, userId: 'USER_ID', paymentId: 'PAYMENT_ID'));",
      "react-native":
        "await linkrunner.capturePayment({ amount: 9.99, userId: 'USER_ID', paymentId: 'PAYMENT_ID' });",
      expo: "await linkrunner.capturePayment({ amount: 9.99, userId: 'USER_ID', paymentId: 'PAYMENT_ID' });",
      capacitor:
        "await linkrunner.capturePayment({ amount: 9.99, userId: 'USER_ID', paymentId: 'PAYMENT_ID' });",
      android:
        'LinkRunner.getInstance().capturePayment(CapturePaymentRequest(paymentId = "PAYMENT_ID", userId = "USER_ID", amount = 9.99))',
      ios: 'await LinkrunnerSDK.shared.capturePayment(amount: 9.99, userId: "USER_ID", paymentId: "PAYMENT_ID")',
      web: "lr.track('purchase', { amount: 9.99, currency: 'USD' });",
    });
  });

  it("web signup uses identify and a signup event", () => {
    expect(feature("signup").example.web).toBe(
      "lr.identify('USER_ID'); lr.track('signup', { name: 'User Name' });"
    );
  });
});

describe("suggest detection finds code written from the examples", () => {
  for (const key of ["trackEvent", "capturePayment"]) {
    for (const platform of PROJECT_TYPES) {
      it(`${key} on ${platform}`, () => {
        const f = feature(key);
        const matched = f.patterns[platform].some((p) =>
          p.test(f.example[platform])
        );
        expect(matched).toBe(true);
      });
    }
  }

  it("web signup", () => {
    const f = feature("signup");
    expect(f.patterns.web.some((p) => p.test(f.example.web))).toBe(true);
  });
});

describe("suggest detection for the Web SDK", () => {
  const matches = (key: string, line: string) =>
    feature(key).patterns.web.some((p) => p.test(line));

  it("counts lr.track custom events as trackEvent, but not signup or purchase", () => {
    expect(
      matches("trackEvent", "lr.track('plan_purchased', { plan: 'gold' })")
    ).toBe(true);
    expect(matches("trackEvent", 'window.lr.track("level_up")')).toBe(true);
    expect(matches("trackEvent", "lr.track('signup', { name })")).toBe(false);
    expect(matches("trackEvent", "lr.track( 'purchase', { amount: 1 })")).toBe(
      false
    );
  });

  it("counts lr.track('purchase') as capturePayment", () => {
    expect(
      matches("capturePayment", "lr.track('purchase', { amount: 49.99 })")
    ).toBe(true);
    expect(matches("capturePayment", "lr.track('plan_purchased')")).toBe(false);
  });

  it("counts lr.track('signup') as signup", () => {
    expect(matches("signup", 'lr.track("signup", { email })')).toBe(true);
  });
});
