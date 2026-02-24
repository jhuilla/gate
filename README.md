# Gate

A CLI that runs verification gates (lint, typecheck, test, build) on a TS frontend repo and, on failure, emits a **structured repair bundle** that Claude Code (or similar) can consume directly.

**One command:** `gate claude bundle <phase>` — runs the phase, prints progress to stderr, and on failure writes a self-contained bundle to stdout. Paste into Claude, fix, repeat until exit 0.

- **Short-term:** `gate run <phase>` (and `--json`), `gate init`, YAML config, tsc highlights + log tail for other tools, stable exit codes. Unix-like only.
- **Long-term:** eslint/vitest parsers, `--continue` / `gate plan`, workspace presets, plugin system, CI helpers, agent-protocol adapters (Aider, Cursor, OpenHands).

See [PLAN.md](PLAN.md) for config format, JSON contract, bundle format, and build phases.
