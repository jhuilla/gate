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

## Agent loop integration

You can plug Gate into an autonomous agent loop (e.g. Ralph, claudeloop, or a custom orchestrator) by treating it as a hard gate before advancing to the next step.

- **Contract**
  - **Command**: `gate claude bundle <phase>`
  - **Exit codes**:
    - `0`: all gates in the phase passed; stdout is empty.
    - `1`: one or more gates failed; stdout contains a self-contained repair bundle suitable for Claude or similar agents.
    - `2`: config or runtime error in Gate itself; treat as an infrastructure failure rather than a code-fix task.
  - **Streams**:
    - `stderr`: human-readable progress and logs (safe to print to console).
    - `stdout`: bundle text only on exit code `1`, otherwise empty.

- **Typical loop (pseudocode)**

  ```ts
  // Run inside the target repo
  while (true) {
    const { exitCode, stdout } = await runCommand("npx gate claude bundle fast");

    if (exitCode === 0) {
      // Gates passed; safe to move on to the next phase of your agentic workflow.
      break;
    }

    if (exitCode === 2) {
      // Config/runtime error in Gate; surface to the operator instead of asking the agent to fix it.
      throw new Error("Gate config/runtime error:\n" + stdout);
    }

    // exitCode === 1: one or more gates failed.
    // stdout is the repair bundle; send it to your coding agent and apply the returned patch.
    const bundle = stdout;

    const agentResponse = await callCodingAgent({
      system: "You are a coding agent that fixes repos so that Gate passes.",
      bundle, // pass the bundle as user content
    });

    await applyPatchFromAgent(agentResponse);
    // Loop will rerun `gate claude bundle fast` after the patch.
  }
  ```

If you prefer structured data, you can instead call `gate run <phase> --format json`, inspect `failedGate`, `failedGates`, and `gates[].highlights` to build your own prompt, and still use the same exit-code contract.

---

### Example: wiring Gate into Ralph locally

Ralph is designed to be copied and customized in your repo. The minimal local change is to swap its “quality checks” step in `ralph.sh` for a Gate call.

Very roughly, find the place where it currently runs its checks (simplified example):

```bash
# Before: ad-hoc checks
npm test && npm run lint && npm run typecheck
```

and replace it with:

```bash
# After: Gate is the single source of truth for checks
npx gate claude bundle fast
if [ "$?" -ne 0 ]; then
  echo "Gate failed for this story. Fix the repo until 'npx gate claude bundle fast' exits 0."
  exit 1
fi
```

You can then have your agent loop (or Ralph’s prompt) feed the printed bundle back into Claude Code or another coding agent, apply the patch, and rerun the same `npx gate claude bundle fast` command until it exits 0.

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
