import { describe, it, expect } from "vitest";
import { parseEventValue } from "./event-value.js";

describe("parseEventValue", () => {
  it.each([
    ["499", 499],
    ["9.99", 9.99],
    ["-5", -5],
    ["0", 0],
    ["0.5", 0.5],
    ["123456789", 123456789],
    ["  42  ", 42],
  ])("reads %j as the number %j", (input, expected) => {
    expect(parseEventValue(input)).toBe(expected);
  });

  it.each([
    ["true", true],
    ["false", false],
    ["TRUE", true],
    ["False", false],
  ])("reads %j as the boolean %j", (input, expected) => {
    expect(parseEventValue(input)).toBe(expected);
  });

  it.each([
    ["gold", "gold"],
    ["007", "007"],
    ["00.5", "00.5"],
    ["9876543210", "9876543210"],
    ["919876543210", "919876543210"],
    ["1.1234567890123456", "1.1234567890123456"],
    ["1e5", "1e5"],
    ["+5", "+5"],
    [".5", ".5"],
    ["5.", "5."],
    ["1,000", "1,000"],
    ["0x10", "0x10"],
    ["12abc", "12abc"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["yes", "yes"],
    ["  gold  ", "gold"],
  ])("keeps %j as the text %j", (input, expected) => {
    expect(parseEventValue(input)).toBe(expected);
  });

  it.each([
    ['"499"', "499"],
    ["'499'", "499"],
    ['"true"', "true"],
    ["'007'", "007"],
    ['""', ""],
    ['"gold class"', "gold class"],
  ])("treats the quoted value %j as the text %j", (input, expected) => {
    expect(parseEventValue(input)).toBe(expected);
  });

  it("does not strip quotes that do not match", () => {
    expect(parseEventValue("\"499'")).toBe("\"499'");
    expect(parseEventValue('"')).toBe('"');
  });
});
