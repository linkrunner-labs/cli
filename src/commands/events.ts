import chalk from "chalk";
import inquirer from "inquirer";
import { detectProjectType } from "../detectors/project-detector.js";
import {
  generateEventCode,
  type EventCodeParams,
} from "../generators/event-code.js";
import { header, info, pass, error as logError } from "../utils/output.js";
import { PROJECT_TYPES, type ProjectType } from "../types/index.js";

type EventType = "custom" | "payment" | "signup";

const EVENT_TYPE_CHOICES = [
  { name: "Custom Event", value: "custom" as EventType },
  { name: "Payment / Revenue", value: "payment" as EventType },
  { name: "Signup", value: "signup" as EventType },
];

async function resolvePlatform(platformFlag?: string): Promise<ProjectType> {
  if (platformFlag) {
    const valid = PROJECT_TYPES.includes(platformFlag as ProjectType);
    if (valid) {
      info(`Platform override: ${platformFlag}`);
      return platformFlag as ProjectType;
    }
    logError(
      `Unknown platform "${platformFlag}"`,
      `Valid platforms: ${PROJECT_TYPES.join(", ")}`,
    );
    process.exit(1);
  }

  const detected = detectProjectType();
  if (detected) {
    info(`Detected platform: ${detected.type}`);
    return detected.type;
  }

  console.log();
  console.log(chalk.yellow("  Could not auto-detect project type."));

  const { projectType } = await inquirer.prompt<{ projectType: ProjectType }>([
    {
      type: "list",
      name: "projectType",
      message: "Select your platform:",
      choices: PROJECT_TYPES.map((t) => ({ name: t, value: t })),
    },
  ]);

  return projectType;
}

async function resolveEventType(typeFlag?: string): Promise<EventType> {
  if (typeFlag) {
    const valid: EventType[] = ["custom", "payment", "signup"];
    if (valid.includes(typeFlag as EventType)) {
      return typeFlag as EventType;
    }
    logError(
      `Unknown event type "${typeFlag}"`,
      `Valid types: custom, payment, signup`,
    );
    process.exit(1);
  }

  const { eventType } = await inquirer.prompt<{ eventType: EventType }>([
    {
      type: "list",
      name: "eventType",
      message: "Select event type:",
      choices: EVENT_TYPE_CHOICES,
    },
  ]);

  return eventType;
}

async function collectProperties(): Promise<Record<string, string>> {
  const properties: Record<string, string> = {};

  const { addFirst } = await inquirer.prompt<{ addFirst: boolean }>([
    {
      type: "confirm",
      name: "addFirst",
      message: "Add a property?",
      default: false,
    },
  ]);

  if (!addFirst) return properties;

  let adding = true;
  while (adding) {
    const { key, value } = await inquirer.prompt<{
      key: string;
      value: string;
    }>([
      {
        type: "input",
        name: "key",
        message: "Property key:",
        validate: (input: string) => (input.trim() ? true : "Key is required"),
      },
      {
        type: "input",
        name: "value",
        message: "Property value:",
        validate: (input: string) =>
          input.trim() ? true : "Value is required",
      },
    ]);

    properties[key.trim()] = value.trim();

    const { addMore } = await inquirer.prompt<{ addMore: boolean }>([
      {
        type: "confirm",
        name: "addMore",
        message: "Add another property?",
        default: false,
      },
    ]);

    adding = addMore;
  }

  return properties;
}

async function collectCustomEventParams(): Promise<EventCodeParams> {
  const { name } = await inquirer.prompt<{ name: string }>([
    {
      type: "input",
      name: "name",
      message: "Event name:",
      validate: (input: string) =>
        input.trim() ? true : "Event name is required",
    },
  ]);

  const properties = await collectProperties();

  return {
    type: "custom",
    params: { name: name.trim(), properties },
  };
}

async function collectPaymentParams(): Promise<EventCodeParams> {
  const { amount, currency, transactionId } = await inquirer.prompt<{
    amount: number;
    currency: string;
    transactionId: string;
  }>([
    {
      type: "number",
      name: "amount",
      message: "Payment amount:",
      validate: (input: number) => {
        if (isNaN(input) || input <= 0) return "Enter a valid positive number";
        return true;
      },
    },
    {
      type: "input",
      name: "currency",
      message: "Currency code:",
      default: "USD",
    },
    {
      type: "input",
      name: "transactionId",
      message: "Transaction ID (optional, press enter to skip):",
    },
  ]);

  const properties = await collectProperties();

  return {
    type: "payment",
    params: {
      amount,
      currency: currency.trim().toUpperCase(),
      transactionId: transactionId.trim() || undefined,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
    },
  };
}

async function collectSignupParams(): Promise<EventCodeParams> {
  const { userId, name, email } = await inquirer.prompt<{
    userId: string;
    name: string;
    email: string;
  }>([
    {
      type: "input",
      name: "userId",
      message: "User ID:",
      validate: (input: string) =>
        input.trim() ? true : "User ID is required",
    },
    {
      type: "input",
      name: "name",
      message: "User name (optional, press enter to skip):",
    },
    {
      type: "input",
      name: "email",
      message: "User email (optional, press enter to skip):",
    },
  ]);

  return {
    type: "signup",
    params: {
      userId: userId.trim(),
      name: name.trim() || undefined,
      email: email.trim() || undefined,
    },
  };
}

function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    let cmd: string[];

    if (platform === "darwin") {
      cmd = ["pbcopy"];
    } else if (platform === "win32") {
      cmd = ["clip"];
    } else {
      cmd = ["xclip", "-selection", "clipboard"];
    }

    const result = Bun.spawnSync(cmd, {
      stdin: Buffer.from(text),
    });

    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function eventsAddCommand(options: {
  platform?: string;
  type?: string;
}): Promise<void> {
  header("Event Code Generator");

  // Step 1: Resolve platform
  const platform = await resolvePlatform(options.platform);

  // Step 2: Resolve event type
  const eventType = await resolveEventType(options.type);

  // Step 3: Check web + signup limitation
  if (platform === "web" && eventType === "signup") {
    info("Web SDK does not have a signup method.");
    info("Use trackEvent for custom events instead.");
    return;
  }

  // Step 4: Collect event-specific parameters
  let eventParams: EventCodeParams;

  switch (eventType) {
    case "custom":
      eventParams = await collectCustomEventParams();
      break;
    case "payment":
      eventParams = await collectPaymentParams();
      break;
    case "signup":
      eventParams = await collectSignupParams();
      break;
  }

  // Step 5: Generate code
  const code = generateEventCode(platform, eventParams);

  // Step 6: Display generated code
  header("Generated Code");
  console.log(
    code
      .split("\n")
      .map((l) => `    ${chalk.white(l)}`)
      .join("\n"),
  );
  console.log();

  // Step 7: Try LLM auto-insertion
  let inserted = false;
  try {
    inserted = await tryEventAutoInsert(platform, eventType);
  } catch {
    // LLM unavailable, fall through to clipboard
  }

  // Step 8: Copy to clipboard (skip if code was already inserted)
  if (!inserted) {
    const { shouldCopy } = await inquirer.prompt<{ shouldCopy: boolean }>([
      {
        type: "confirm",
        name: "shouldCopy",
        message: "Copy to clipboard?",
        default: true,
      },
    ]);

    if (shouldCopy) {
      const success = copyToClipboard(code);
      if (success) {
        pass("Copied to clipboard!");
      } else {
        logError("Failed to copy to clipboard");
      }
    }
  }
}

const EVENT_TYPE_TO_CODE_TYPE: Record<EventType, "trackEvent" | "capturePayment" | "signup"> = {
  custom: "trackEvent",
  payment: "capturePayment",
  signup: "signup",
};

async function tryEventAutoInsert(
  platform: ProjectType,
  eventType: EventType,
): Promise<boolean> {
  const { autoInsert } = await inquirer.prompt<{ autoInsert: boolean }>([
    {
      type: "confirm",
      name: "autoInsert",
      message: "Would you like me to insert this into your code?",
      default: true,
    },
  ]);

  if (!autoInsert) return false;

  const { getInsertionPoint } = await import("../llm/analyzer.js");
  const { promptAndInsertCode } = await import("../utils/code-inserter.js");

  const codeType = EVENT_TYPE_TO_CODE_TYPE[eventType];
  const result = await getInsertionPoint(platform, process.cwd(), codeType);
  const insertionPoint = result?.structured?.insertionPoint;

  if (!insertionPoint) {
    info("Could not determine where to insert the code. Copy the snippet above manually.");
    return false;
  }

  return await promptAndInsertCode(process.cwd(), insertionPoint, `${eventType} event`);
}
