# Linkrunner CLI (`lr`)

SDK integration, validation, and debugging tool for Linkrunner.

[![npm version](https://img.shields.io/npm/v/@linkrunner/cli)](https://www.npmjs.com/package/@linkrunner/cli)
[![GitHub release](https://img.shields.io/github/v/release/linkrunner-labs/cli)](https://github.com/linkrunner-labs/cli/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
# Recommended: install script (downloads platform-specific binary)
curl -fsSL https://raw.githubusercontent.com/linkrunner-labs/cli/main/install.sh | sh

# Via npm
npm install -g @linkrunner/cli

# Via bun
bun install -g @linkrunner/cli
```

## Quick Start

```bash
lr login          # Authenticate with Linkrunner
lr init           # Initialize SDK in your project
lr doctor         # Check integration health
```

## Commands

| Command | Description |
| --- | --- |
| `lr login` | Authenticate with Linkrunner |
| `lr logout` | Log out |
| `lr init` | Interactive SDK setup wizard |
| `lr doctor` | Diagnose integration issues (`--fix`, `--deep`, `--ci`) |
| `lr validate` | Alias for doctor |
| `lr analyze` | AI-powered deep code analysis |
| `lr test` | Test SDK connectivity and token validity |
| `lr deeplink setup` | Configure deep linking |
| `lr events add` | Generate event tracking code |
| `lr status` | View project dashboard |
| `lr suggest` | Get feature recommendations |

## Supported Platforms

Flutter, React Native, Expo, iOS Native, Android Native, Capacitor, Web

## CI/CD Integration

Use the CLI in your CI pipeline to validate SDK integration on every commit:

```bash
lr doctor --ci --fail-on-warn
```

This exits with code 0 on success or 1 on failure, treating warnings as errors.

## Links

- Documentation: [docs.linkrunner.io/cli](https://docs.linkrunner.io/cli)
- Website: [linkrunner.io](https://linkrunner.io)

## License

MIT
