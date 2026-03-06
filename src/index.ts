import { Command } from "commander";
import chalk from "chalk";
import { setDebug } from "./utils/debug.js";
import { overrideEnvironment } from "./config/store.js";

const program = new Command();

program
  .name("lr")
  .version("0.1.1")
  .description("Linkrunner CLI - SDK integration, validation, and debugging")
  .option("--debug", "Enable debug logging")
  .option("--env <environment>", "Override environment for this command");

program.hook("preAction", (_thisCommand, _actionCommand) => {
  const opts = program.opts();
  if (opts.debug) {
    setDebug(true);
  }
  if (opts.env) {
    const env = opts.env;
    if (env !== "production" && env !== "staging") {
      console.error(
        chalk.red(`Invalid environment "${env}".`),
        `Valid options: production, staging`
      );
      process.exit(1);
    }
    overrideEnvironment(env);
  }
});

program
  .command("login")
  .description("Authenticate with Linkrunner")
  .option(
    "--token <token>",
    "Authenticate with a CLI token or API key (non-interactive)"
  )
  .action(async (options) => {
    const { loginCommand } = await import("./commands/login.js");
    await loginCommand(options);
  });

program
  .command("logout")
  .description("Log out from Linkrunner")
  .action(async () => {
    const { logoutCommand } = await import("./commands/logout.js");
    await logoutCommand();
  });

program
  .command("init")
  .description("Initialize Linkrunner SDK in your project")
  .action(async () => {
    const { initCommand } = await import("./commands/init.js");
    await initCommand();
  });

program
  .command("doctor")
  .description("Diagnose SDK integration issues")
  .option("--json", "Output results as JSON")
  .option("--fix", "Attempt to auto-fix issues")
  .option("--deep", "Run deep LLM-powered analysis")
  .option("--ci", "Exit with code 0 (pass) or 1 (fail)")
  .option("--fail-on-warn", "Treat warnings as failures in CI mode")
  .action(async (options) => {
    const { doctorCommand } = await import("./commands/doctor.js");
    await doctorCommand(options);
  });

program
  .command("validate")
  .description("Validate SDK configuration (alias for doctor)")
  .option("--json", "Output results as JSON")
  .option("--fix", "Attempt to auto-fix issues")
  .option("--deep", "Run deep LLM-powered analysis")
  .option("--ci", "Exit with code 0 (pass) or 1 (fail)")
  .option("--fail-on-warn", "Treat warnings as failures in CI mode")
  .action(async (options) => {
    const { validateCommand } = await import("./commands/validate.js");
    await validateCommand(options);
  });

program
  .command("analyze")
  .description("Run AI-powered deep analysis of your SDK integration")
  .option("--json", "Output results as JSON")
  .option("--ci", "Exit with code 0 (pass) or 1 (fail)")
  .option("--fail-on-warn", "Treat warnings as failures in CI mode")
  .action(async (options) => {
    const { analyzeCommand } = await import("./commands/analyze.js");
    await analyzeCommand(options);
  });

program
  .command("test")
  .description("Test SDK connectivity and token validity")
  .option("--json", "Output results as JSON")
  .option("--deep", "Also verify deep link domains and verification files")
  .option("--ci", "Exit with code 0 (pass) or 1 (fail)")
  .action(async (options) => {
    const { testCommand } = await import("./commands/test.js");
    await testCommand(options);
  });

const deeplinkCmd = program
  .command("deeplink")
  .description("Deep link configuration utilities");

deeplinkCmd
  .command("setup")
  .description("Configure deep linking for your project")
  .option("--domain <domain>", "Deep link domain")
  .option("--skip-android", "Skip Android configuration")
  .option("--skip-ios", "Skip iOS configuration")
  .action(async (options) => {
    const { deeplinkSetupCommand } = await import("./commands/deeplink.js");
    await deeplinkSetupCommand(options);
  });

const eventsCmd = program
  .command("events")
  .description("Event tracking utilities");

eventsCmd
  .command("add")
  .description("Generate event tracking code snippet")
  .option("--platform <type>", "Override detected platform")
  .option("--type <eventType>", "Event type: custom, payment, signup")
  .action(async (options) => {
    const { eventsAddCommand } = await import("./commands/events.js");
    await eventsAddCommand(options);
  });

program
  .command("status")
  .description("Show project dashboard and recent activity")
  .option("--json", "Output results as JSON")
  .option("--days <n>", "Activity window in days", "7")
  .action(async (options) => {
    const { statusCommand } = await import("./commands/status.js");
    await statusCommand(options);
  });

program
  .command("suggest")
  .description("Suggest SDK features to improve your integration")
  .option("--json", "Output results as JSON")
  .option("--no-ai", "Skip AI-powered recommendations")
  .action(async (options) => {
    const { suggestCommand } = await import("./commands/suggest.js");
    await suggestCommand(options);
  });

program
  .command("env [environment]")
  .description("Show or switch the current environment (production/staging)")
  .action(async (environment?: string) => {
    const { envCommand } = await import("./commands/env.js");
    await envCommand(environment);
  });

function classifyError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }

  const code = (err as NodeJS.ErrnoException).code;
  const msg = err.message;

  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    msg.includes("fetch failed")
  ) {
    return "Could not reach Linkrunner API. Check your internet connection.";
  }

  if (code === "EACCES" || code === "EPERM") {
    return "Permission denied. Check file permissions or try with elevated privileges.";
  }

  if (code === "ENOENT" && msg.includes("no such file or directory")) {
    return "File or directory not found. Run this command from your project root.";
  }

  if (code === "EROFS") {
    return "Filesystem is read-only. Cannot apply fixes.";
  }

  if (err instanceof SyntaxError && msg.includes("JSON")) {
    return "Invalid configuration file. Check .linkrunner.json for syntax errors.";
  }

  return `${msg}\n  Run with --debug for more details.`;
}

process.on("unhandledRejection", (reason: unknown) => {
  console.error(chalk.red("\nError:"), classifyError(reason));
  process.exit(1);
});

process.on("uncaughtException", (err: Error) => {
  console.error(chalk.red("\nError:"), classifyError(err));
  process.exit(1);
});

program.parse();
