## Gate

A CLI that runs verification gates (lint, typecheck, test, build) on a TS frontend repo and, on failure, emits a **structured repair bundle** that Claude Code (or similar) can consume directly.

**One command:** `gate claude bundle <phase>` — runs the phase, prints progress to stderr, and on failure writes a self-contained bundle to stdout. Paste into Claude, fix, repeat until exit 0.

- **Short-term:** `gate run <phase>` (and `--format json`), `gate init`, YAML config, tsc highlights + log tail for other tools, stable exit codes. Unix-like only.
- **Long-term:** eslint/vitest parsers, `--continue` / `gate plan`, workspace presets, plugin system, CI helpers, agent-protocol adapters (Aider, Cursor, OpenHands).

See [PLAN.md](PLAN.md) for config format, JSON contract, bundle format, and build phases.

---

## Quickstart

From a typical TS repo root:

- **Install Gate**

  ```bash
  pnpm add -D gate
  ```

- **Create a config**

  ```bash
  # writes gate.config.yml in the current directory
  npx gate init
  ```

- **Run a phase in human mode**

  ```bash
  # no structured stdout; progress and logs go to stderr
  npx gate run fast
  ```

- **Run a phase with JSON output**

  ```bash
  # JSON result to stdout; human-readable logs to stderr
  npx gate run fast --format json
  ```

- **Generate a Claude repair bundle**

  ```bash
  # on failure: bundle text to stdout, progress to stderr, exit code 1
  npx gate claude bundle pr
  ```

See [PLAN.md](PLAN.md) “JSON output contract” and “Claude repair bundle format” for the exact structures.

---

## CI usage (GitHub Actions example)

This example runs Gate as part of a PR workflow and relies on its stable exit codes and stdout/stderr separation:

```yaml
name: gate

on:
  pull_request:
    branches: [main]

jobs:
  gate:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run gate (JSON output)
        run: |
          # human-readable logs go to stderr
          # structured JSON goes to stdout (safe to pipe or capture)
          npx gate run pr --format json > gate-result.json
```

Exit codes:

- **0**: all gates passed.
- **1**: one or more gates failed.
- **2**: config or runtime error (e.g. bad config, unsupported `--format`, command not found).

For an interactive repair loop with Claude, you can also run `gate claude bundle pr` in CI or locally and forward the bundle text to a Claude session.

---

## Local development

- **Install dependencies**

  ```bash
  pnpm install
  ```

- **Build the CLI**

  ```bash
  pnpm build
  ```

- **Run the CLI directly**

  ```bash
  # show help (also what plain `gate` will do)
  pnpm start -- --help

  # initialize a gate.config.yml in the current repo
  pnpm start -- init

  # run a phase in human mode (logs to stderr)
  pnpm start -- run fast

  # generate a Claude bundle for a phase
  pnpm start -- claude bundle pr
  ```

- **Run tests**

  ```bash
  pnpm test
  ```

- **Optional: link the `gate` binary globally for manual testing**

  ```bash
  pnpm link --global

  gate --help
  gate init
  gate run fast
  gate claude bundle pr
  ```
