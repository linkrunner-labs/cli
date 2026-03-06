import chalk from "chalk";
import { isAuthenticated, getProjectConfig, getEnvironment } from "../config/store.js";
import { apiGet, ApiError } from "../api/client.js";
import * as output from "../utils/output.js";

export interface StatusOptions {
  json?: boolean;
  days?: string;
}

// TODO: verify endpoint path once backend implements it
interface ProjectStats {
  installs: number;
  signups: number;
  events: number;
  revenue: number;
  currency: string;
}

// TODO: verify endpoint path once backend implements it
interface Campaign {
  id: number;
  name: string;
  status: string;
  platform: string;
}

interface HealthCheck {
  check: string;
  status: "pass" | "warn";
  message?: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCurrency(amount: number, currency: string): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency,
  });
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  if (options.json) {
    output.setJsonMode(true);
  }

  // Step 1: Check authentication
  if (!isAuthenticated()) {
    if (options.json) {
      console.log(JSON.stringify({ error: "Not authenticated" }));
    } else {
      output.error("Not authenticated", "Run `lr login` to authenticate");
    }
    return;
  }

  // Step 2: Read project config
  const config = getProjectConfig();
  if (!config) {
    if (options.json) {
      console.log(JSON.stringify({ error: "No .linkrunner.json found" }));
    } else {
      output.error(
        "No .linkrunner.json found",
        "Run `lr init` to set up your project",
      );
    }
    return;
  }

  const env = getEnvironment();
  const days = parseInt(options.days ?? "7", 10) || 7;

  if (!options.json) {
    console.log();
    console.log(chalk.bold("Linkrunner Status"));
  }

  // Step 3: Project Info
  if (!options.json) {
    output.header("Project Info");
    console.log(`  ${chalk.dim("Name:")}         ${config.project_name}`);
    console.log(`  ${chalk.dim("ID:")}           ${config.project_id}`);
    console.log(`  ${chalk.dim("Platforms:")}    ${config.platforms.join(", ")}`);
    console.log(`  ${chalk.dim("Domain:")}       ${config.deep_link_domain}`);
    console.log(`  ${chalk.dim("Environment:")}  ${env}`);
  }

  // Step 4: Recent Activity
  let stats: ProjectStats | null = null;
  const activitySpinner = options.json ? null : output.spinner("Fetching recent activity...");

  try {
    // TODO: verify endpoint path
    const res = await apiGet<ProjectStats>(
      `/project/stats?project_id=${config.project_id}&days=${days}`,
    );
    stats = res.data;
    activitySpinner?.succeed("Activity loaded");
  } catch (err) {
    if (err instanceof ApiError) {
      activitySpinner?.warn(`Could not fetch activity: ${err.message}`);
    } else {
      activitySpinner?.warn("Could not fetch recent activity");
    }
  }

  if (!options.json) {
    output.header(`Recent Activity (last ${days} days)`);
    if (stats) {
      console.log(`  ${chalk.dim("Installs:")}     ${formatNumber(stats.installs)}`);
      console.log(`  ${chalk.dim("Signups:")}      ${formatNumber(stats.signups)}`);
      console.log(`  ${chalk.dim("Events:")}       ${formatNumber(stats.events)}`);
      console.log(`  ${chalk.dim("Revenue:")}      ${formatCurrency(stats.revenue, stats.currency)}`);
    } else {
      output.warn("Activity data unavailable");
    }
  }

  // Step 5: Active Campaigns
  let campaigns: Campaign[] | null = null;
  const campaignSpinner = options.json ? null : output.spinner("Fetching campaigns...");

  try {
    // TODO: verify endpoint path
    const res = await apiGet<Campaign[]>(
      `/project/campaigns?project_id=${config.project_id}`,
    );
    campaigns = res.data;
    campaignSpinner?.succeed("Campaigns loaded");
  } catch (err) {
    if (err instanceof ApiError) {
      campaignSpinner?.warn(`Could not fetch campaigns: ${err.message}`);
    } else {
      campaignSpinner?.warn("Could not fetch campaigns");
    }
  }

  if (!options.json) {
    output.header("Active Campaigns");
    if (campaigns && campaigns.length > 0) {
      for (const c of campaigns) {
        console.log(`  - ${c.name} (${c.platform}) ${chalk.dim(`— ${c.status}`)}`);
      }
    } else if (campaigns && campaigns.length === 0) {
      output.info("No active campaigns");
    } else {
      output.warn("Campaign data unavailable");
    }
  }

  // Step 6: Integration Health
  const health: HealthCheck[] = [];

  health.push({
    check: "config_found",
    status: "pass",
    message: ".linkrunner.json found",
  });

  if (config.project_token) {
    health.push({
      check: "token_configured",
      status: "pass",
      message: "Project token configured",
    });
  } else {
    health.push({
      check: "token_configured",
      status: "warn",
      message: "Project token not configured",
    });
  }

  if (config.platforms.length > 0) {
    health.push({
      check: "platforms",
      status: "pass",
      message: `Platforms: ${config.platforms.join(", ")}`,
    });
  } else {
    health.push({
      check: "platforms",
      status: "warn",
      message: "No platforms configured",
    });
  }

  if (config.deep_link_domain) {
    health.push({
      check: "deep_link_domain",
      status: "pass",
      message: "Deep link domain configured",
    });
  } else {
    health.push({
      check: "deep_link_domain",
      status: "warn",
      message: "Deep link domain not configured",
    });
  }

  if (!options.json) {
    output.header("Integration Health");
    for (const h of health) {
      if (h.status === "pass") {
        output.pass(h.message!);
      } else {
        output.warn(h.message!, "Run `lr doctor` for detailed diagnostics");
      }
    }
    console.log();
  }

  // Step 7: JSON output
  if (options.json) {
    const result: Record<string, unknown> = {
      project: {
        name: config.project_name,
        id: config.project_id,
        platforms: config.platforms,
        deep_link_domain: config.deep_link_domain,
        environment: env,
      },
      activity: stats
        ? {
            days,
            installs: stats.installs,
            signups: stats.signups,
            events: stats.events,
            revenue: stats.revenue,
            currency: stats.currency,
          }
        : null,
      campaigns: campaigns ?? null,
      health,
    };
    console.log(JSON.stringify(result, null, 2));
  }
}
