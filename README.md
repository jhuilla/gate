## Gate

A CLI that runs verification gates (lint, typecheck, test, build) on a TS frontend repo and, on failure, emits a **structured repair bundle** that Claude Code (or similar) can consume directly.

**One command:** `gate claude bundle <phase>` — runs the phase, prints progress to stderr, and on failure writes a self-contained bundle to stdout. Paste into Claude, fix, repeat until exit 0.

- **Short-term:** `gate run <phase>` (and `--json`), `gate init`, YAML config, tsc highlights + log tail for other tools, stable exit codes. Unix-like only.
- **Long-term:** eslint/vitest parsers, `--continue` / `gate plan`, workspace presets, plugin system, CI helpers, agent-protocol adapters (Aider, Cursor, OpenHands).

See [PLAN.md](PLAN.md) for config format, JSON contract, bundle format, and build phases.

---

## Local development (Phase 0)

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
  # show help (also what plain `gate` will do for now)
  pnpm start -- --help

  # init stub (Phase 0: no config written yet)
  pnpm start -- init

  # run stub for a phase
  pnpm start -- run fast

  # Claude bundle stub for a phase
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

Phase 0 only wires up the CLI skeleton and behavior; no real config loading or gate execution happens yet (see [PLAN.md](PLAN.md) for upcoming phases).
