# Linkrunner CLI

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Bun
- **CLI framework:** Commander.js
- **Key deps:** inquirer, chalk, ora, zod, conf, fast-xml-parser, plist, yaml

## Development Commands

```bash
bun install                 # Install dependencies
bun run dev                 # Run CLI in dev mode (src/index.ts)
bun run build               # Build JS bundle (dist/index.js)
bun run build:binary:local  # Compile native binary for current platform
bun run typecheck           # TypeScript type checking
```

## Architecture

```
src/
├── commands/       # Command implementations (login, init, doctor, etc.)
├── api/            # API client (auth, project, base client)
├── config/         # Constants + config store (via conf package)
├── validators/     # Platform-specific validators (android, ios, flutter, expo, react-native, capacitor, web)
├── detectors/      # Project type auto-detection
├── generators/     # Code generation (config files, event tracking code)
├── llm/            # AI-powered analysis (client, analyzer, types)
├── utils/          # Output formatting, code insertion, file parsing
├── types/          # TypeScript type definitions
└── index.ts        # CLI entry point (Commander setup + global error handling)
```

## CI/CD Notes

- Every commit to `main` auto-bumps patch version, builds 4 platform binaries, publishes to npm + GitHub Releases
- Use `[minor]` or `[major]` in commit messages for non-patch bumps
- Use `[skip ci]` to skip release entirely
- Version is stored in 3 places (kept in sync by CI):
  - `package.json` → `version` field
  - `src/index.ts:8` → `.version("x.y.z")`
  - `src/config/constants.ts:3` → `CLI_VERSION = "x.y.z"`

## Supported Platforms

Flutter, React Native, Expo, iOS Native, Android Native, Capacitor, Web

## npm Package

- Name: `@linkrunner/cli` (public, scoped)
- Binary command: `lr`
