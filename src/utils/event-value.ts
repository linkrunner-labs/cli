/**
 * Event parameter values typed in `lr events add` keep their type, so the
 * generated SDK call sends numbers and booleans, not strings.
 *
 * Rule:
 * - `true` or `false` (any case) becomes a boolean.
 * - A plain number becomes a number: an optional minus sign, digits, and an
 *   optional decimal part, like 499, -5 or 9.99. It must not start with a
 *   zero (0.5 is fine, 007 is not) and can have at most 9 digits before the
 *   decimal point, so phone numbers and long IDs stay text.
 * - Anything else is text. Wrap a value in quotes ("499" or '499') to keep
 *   it as text.
 */
export type EventValue = string | number | boolean;

export type EventParams = Record<string, EventValue>;

const NUMBER_PATTERN = /^-?(0|[1-9]\d{0,8})(\.\d+)?$/;

// A double holds 15 significant digits exactly, so longer values stay text
// instead of losing digits.
const MAX_NUMBER_DIGITS = 15;

export const EVENT_VALUE_RULES = [
  "Values keep their type: 499 or 9.99 is a number, true or false is a boolean, anything else is text.",
  "A value with a leading zero (007) or more than 9 digits before the decimal point (like a phone number) stays text.",
  'Wrap a value in quotes to keep it as text, for example "499".',
];

export function parseEventValue(input: string): EventValue {
  const value = input.trim();

  const first = value[0];
  if (
    value.length >= 2 &&
    (first === '"' || first === "'") &&
    value[value.length - 1] === first
  ) {
    return value.slice(1, -1);
  }

  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;

  if (
    NUMBER_PATTERN.test(value) &&
    value.replace(/\D/g, "").length <= MAX_NUMBER_DIGITS
  ) {
    return Number(value);
  }

  return value;
}
