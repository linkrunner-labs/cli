import chalk from "chalk";
import { getProjectConfig, getEnvironment } from "../config/store.js";
import { apiPost, ApiError } from "../api/client.js";
import type { ValidationResult } from "../types/index.js";
import * as output from "../utils/output.js";

export interface TestOptions {
  json?: boolean;
  deep?: boolean;
  ci?: boolean;
}

export async function testCommand(options: TestOptions): Promise<void> {
  if (options.json) {
    output.setJsonMode(true);
  }

  const allResults: ValidationResult[] = [];

  if (!options.json) {
    console.log();
    console.log(chalk.bold("Linkrunner SDK Test"));
    console.log();
  }

  // Step 1: Read project config
  const config = getProjectConfig();
  if (!config) {
    if (options.json) {
      console.log(
        JSON.stringify({
          error: "No .linkrunner.json found",
          results: [],
        })
      );
    } else {
      output.error(
        "No .linkrunner.json found",
        "Run `lr init` to set up your project"
      );
    }
    process.exit(1);
  }

  const env = getEnvironment();

  if (!options.json) {
    console.log(`  ${chalk.blue("Environment:")} ${env}`);
    console.log(
      `  ${chalk.blue("Project:")} ${config.project_name} (ID: ${config.project_id})`
    );
    console.log();
  }

  // Step 2: Token verification
  if (!options.json) {
    output.header("Token Verification");
  }

  const tokenSpinner = options.json
    ? null
    : output.spinner("Verifying project token...");
  const startTime = Date.now();

  try {
    await apiPost("/sdk/v2/init", {
      project_token: config.project_token,
      data: { test: true },
    });
    const elapsed = Date.now() - startTime;

    tokenSpinner?.succeed("Token verified");

    const tokenResult: ValidationResult = {
      id: "token-valid",
      name: "Project token validity",
      status: "pass",
      severity: "error",
      message: "Project token is valid",
      autoFixable: false,
    };
    allResults.push(tokenResult);

    const apiResult: ValidationResult = {
      id: "api-response",
      name: "API response time",
      status: "pass",
      severity: "error",
      message: `API responded in ${elapsed}ms`,
      autoFixable: false,
    };
    allResults.push(apiResult);

    if (!options.json) {
      output.pass(tokenResult.message);
      output.pass(apiResult.message);
    }
  } catch (err) {
    tokenSpinner?.fail("Token verification failed");

    if (err instanceof ApiError) {
      let message: string;
      let fix: string | undefined;

      if (err.statusCode === 401) {
        message = "Invalid project token";
        fix = "Check your .linkrunner.json or run `lr init` to reconfigure";
      } else if (err.statusCode === 404) {
        message = "Project not found";
        fix = "The project may have been deleted. Run `lr init` to reconfigure";
      } else {
        message = `API error: ${err.message} (HTTP ${err.statusCode})`;
        fix = "Check your network connection or try again later";
      }

      const tokenResult: ValidationResult = {
        id: "token-valid",
        name: "Project token validity",
        status: "error",
        severity: "error",
        message,
        fix,
        autoFixable: false,
      };
      allResults.push(tokenResult);

      if (!options.json) {
        output.error(message, fix);
      }
    } else {
      const message = "Could not reach Linkrunner API";
      const fix = "Check your network connection and try again";

      const tokenResult: ValidationResult = {
        id: "token-valid",
        name: "Project token validity",
        status: "error",
        severity: "error",
        message,
        fix,
        autoFixable: false,
      };
      allResults.push(tokenResult);

      if (!options.json) {
        output.error(message, fix);
      }
    }
  }

  // Step 3: Deep link verification (only with --deep)
  if (options.deep && config.deep_link_domain) {
    if (!options.json) {
      output.header("Deep Link Verification");
    }

    const domain = config.deep_link_domain;

    // Check domain reachability
    const domainResult = await checkUrl(
      `https://${domain}`,
      "HEAD",
      "domain-reachable",
      "Domain reachability",
      `Domain ${domain} is reachable`,
      `Domain ${domain} is not reachable`,
      "Verify your deep link domain is correctly configured"
    );
    allResults.push(domainResult);
    if (!options.json) {
      displayResult(domainResult);
    }

    // Check assetlinks.json (Android)
    const assetlinksResult = await checkUrl(
      `https://${domain}/.well-known/assetlinks.json`,
      "GET",
      "assetlinks",
      "Android assetlinks.json",
      "/.well-known/assetlinks.json returns valid response",
      "/.well-known/assetlinks.json not found",
      "Upload assetlinks.json to your deep link domain for Android App Links"
    );
    allResults.push(assetlinksResult);
    if (!options.json) {
      displayResult(assetlinksResult);
    }

    // Check AASA (iOS)
    const aasaResult = await checkUrl(
      `https://${domain}/.well-known/apple-app-site-association`,
      "GET",
      "aasa",
      "iOS apple-app-site-association",
      "/.well-known/apple-app-site-association returns valid response",
      "/.well-known/apple-app-site-association not found",
      "Upload AASA file to your deep link domain for iOS Universal Links"
    );
    allResults.push(aasaResult);
    if (!options.json) {
      displayResult(aasaResult);
    }
  }

  // Step 4: Summary
  if (options.json) {
    for (const r of allResults) {
      output.addJsonResult(r);
    }
    output.flushJsonResults();
  } else {
    output.summary(allResults);
    console.log();
  }

  // Step 5: Exit code for CI
  if (options.ci) {
    const errors = allResults.filter((r) => r.status === "error").length;
    if (errors > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
}

async function checkUrl(
  url: string,
  method: string,
  id: string,
  name: string,
  passMessage: string,
  failMessage: string,
  fix: string
): Promise<ValidationResult> {
  try {
    const res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      return {
        id,
        name,
        status: "pass",
        severity: "warn",
        message: passMessage,
        autoFixable: false,
      };
    }

    return {
      id,
      name,
      status: "warn",
      severity: "warn",
      message: failMessage,
      fix,
      autoFixable: false,
    };
  } catch {
    return {
      id,
      name,
      status: "warn",
      severity: "warn",
      message: failMessage,
      fix,
      autoFixable: false,
    };
  }
}

function displayResult(result: ValidationResult): void {
  switch (result.status) {
    case "pass":
      output.pass(result.message);
      break;
    case "warn":
      output.warn(result.message, result.fix);
      break;
    case "error":
      output.error(result.message, result.fix);
      break;
  }
}
