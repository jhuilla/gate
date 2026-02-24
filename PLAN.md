# PLAN.md — Gate

## Goal

A CLI tool that runs verification gates on a TS frontend repo and produces a structured repair bundle that Claude Code can consume directly.

One command has to work end-to-end on a real repo:

* `gate claude bundle <phase>`

Everything else is secondary.

---

## Definition of done

1. `gate run <phase>` executes gates in order, stops on first failure by default, exits non-zero on failure.
2. `gate run <phase> --format json` emits structured JSON to stdout and human-readable logs to stderr. Without `--format`, stdout is empty and all human-readable progress and logs go to stderr (maximum scriptability: stdout is a pure data channel only when a format is requested). If `--format` is given with an unsupported value, exit code 2 and a clear error (e.g. "Unsupported format 'x'. Supported: json.").
3. `gate claude bundle <phase>` runs the phase and either exits 0 (pass) or prints a repair bundle to stdout and exits non-zero. Gate progress goes to stderr as normal; stdout contains only the bundle or nothing.
4. `tsc` errors are parsed into structured highlights (file/line/col/message).
5. All other tool output is passed through as a bounded log tail — no parsing, no magic.
6. `gate init` writes a default `gate.config.yml` if one doesn't exist.
7. Gate entries are always present in JSON output, even if skipped, using `status: "skip"` and a reason.
8. Exit codes are stable:
   * `0` = pass
   * `1` = gate failure
   * `2` = config or runtime error

---

## Non-goals (day-1)

* eslint / vitest output parsing (log tail is enough for Claude)
* Interactive repair loop (`gate claude repair`)
* `--continue` / `--changed-only` flags (beyond `stopOnFirstFailure` in config)
* Process graph or monorepo support
* Template markdown files for Claude system prompts
* Plugin system or dynamic loader
* Container or remote runners
* Windows support (Unix-like only)

---

## Repo structure

Start flat. Split files when they get long, not before.

```
gate/
  src/
    cli.ts        # command routing, arg parsing
    config.ts     # load + validate gate.config.yml
    runner.ts     # execute gates, collect results, JSON output
    parse.ts      # tsc parser only; generic log tail for everything else
    bundle.ts     # convert gate result → Claude repair bundle text
  templates/
    gate.config.tsweb.yml
  README.md
  PLAN.md
```

---

## Config format

`gate.config.yml` — kept in the repo root, committed. Repo root is the directory containing the loaded config file (the default `gate.config.yml`, or the path given via `--config`).

```yaml
version: 1

phases:
  fast:
    - lint
    - typecheck
    - test
  pr:
    - lint
    - typecheck
    - test
    - build

gates:
  lint:
    command: pnpm -s eslint .
    timeout: 60
  typecheck:
    command: pnpm -s tsc --noEmit
    timeout: 120
  test:
    command: pnpm -s vitest run
    timeout: 120
  build:
    command: pnpm -s build
    timeout: 180

options:
  logTailLines: 50
  stopOnFirstFailure: true   # default true; false collects all gates
```

### Optional per-gate fields

```yaml
gates:
  test:
    command: pnpm -s vitest run
    cwd: apps/web          # relative to repo root (directory containing the config file); defaults to repo root
    env:
      CI: "1"              # merged over process.env; never appears in output
```

* `cwd`: working directory for the gate. Defaults to the repo root (directory containing the config file).
* `env`: environment variables merged over `process.env` at spawn time. **Never included in JSON output or repair bundles** — the risk of leaking secrets to CI logs or Claude sessions is too high. If you need to debug env issues, add a temporary `echo` to your command.

`gate init` writes the default template and exits. It does not inspect `package.json` or infer scripts. The generated file includes a comment: "Verify these commands match your repo before running."
The template is loaded from the published package directory (e.g., alongside the compiled CLI entry), so `gate init` works from any install location. The build/publish step must include `templates/gate.config.tsweb.yml` in the package.

---

## JSON output contract

Structured output is only produced when `--format json` is passed. `gate run <phase> --format json` emits to stdout:

```json
{
  "version": 1,
  "phase": "pr",
  "status": "fail",
  "startedAt": "2025-01-01T00:00:00.000Z",
  "durationMs": 8312,
  "failedGate": "typecheck",
  "failedGates": ["typecheck"],
  "gates": [
    {
      "name": "lint",
      "status": "pass",
      "command": "pnpm -s eslint .",
      "exitCode": 0,
      "durationMs": 1200,
      "highlights": [],
      "logTail": ""
    },
    {
      "name": "typecheck",
      "status": "fail",
      "command": "pnpm -s tsc --noEmit",
      "exitCode": 2,
      "durationMs": 5312,
      "highlights": [
        {
          "file": "src/foo.ts",
          "line": 42,
          "col": 13,
          "message": "Type 'X' is not assignable to type 'Y'",
          "tool": "tsc"
        }
      ],
      "logTail": "...last 50 lines..."
    },
    {
      "name": "test",
      "status": "skip",
      "command": "pnpm -s vitest run",
      "exitCode": null,
      "durationMs": 0,
      "reason": "skipped: stopOnFirstFailure after typecheck failed",
      "highlights": [],
      "logTail": ""
    },
    {
      "name": "build",
      "status": "skip",
      "command": "pnpm -s build",
      "exitCode": null,
      "durationMs": 0,
      "reason": "skipped: stopOnFirstFailure after typecheck failed",
      "highlights": [],
      "logTail": ""
    }
  ]
}
```

Notes:
* `gates[]` always contains one entry per gate listed in the phase, in order.
* `cwd` and `env` are never included in JSON output.
* `exitCode` is `null` for skipped gates.
* If `stopOnFirstFailure` is false, all gates run and each is `pass` or `fail`.
* When `status` is `"fail"`, `failedGate` is the first failed gate name and `failedGates` contains all failed gate names in phase order.
* When `status` is `"pass"`, `failedGate` is `null` and `failedGates` is an empty array `[]`.
* A phase with zero gates is a config error; the run exits with code `2` and a clear message indicating the empty phase.
* If `--format` is omitted, no structured output is produced (human mode only). If `--format <value>` is given and the value is not supported, the run exits with code `2` and a message such as: `Unsupported format '<value>'. Supported: json.`

---

## Claude repair bundle format

`gate claude bundle <phase>` behavior:
* Gate progress is written to **stderr** as normal so the operator can see what's running.
* **stdout** contains either nothing (pass, exit 0) or the repair bundle below (fail, exit 1).

This makes it safe to pipe or capture stdout in scripts without mixing in progress noise.

```
GATE FAILED: typecheck
PHASE: pr

To fix this repo, make the smallest change that causes this command to pass:
  gate run pr

━━━ FAILED GATE ━━━
Gate:    typecheck
Command: pnpm -s tsc --noEmit
Exit:    2

HIGHLIGHTS:
  src/foo.ts:42:13  Type 'X' is not assignable to type 'Y'
  src/foo.ts:51:5   Property 'bar' does not exist on type 'Baz'

LOG TAIL:
  [last 50 lines of combined stdout/stderr]

When multiple gates fail in a single run (e.g. with `stopOnFirstFailure: false`), the bundle repeats the **FAILED GATE → HIGHLIGHTS → LOG TAIL** block once per failed gate, in phase order.

━━━ NEXT ━━━
After making edits, the harness will rerun `gate run pr`.
You do not need to run tests yourself.

━━━ RULES ━━━
- Make the smallest change that makes the gate pass.
- Do not change tests unless the tests themselves are wrong.
- Do not add dependencies unless strictly unavoidable.
- Do not refactor unrelated code.
- When done, respond with a short list of files changed and why.
```

`cwd` is only shown in the bundle when it differs from the repo root, to avoid noise in the common case.

---

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | All gates passed |
| 1 | One or more gates failed |
| 2 | Config error, missing phase, unsupported `--format`, command not found, or runtime error |

Stable and safe to rely on in CI and scripts.

---

## Process execution

Gates run via `child_process.spawn` with the command passed to `sh -c` (not a login shell — `-c` only, to avoid loading shell profiles and their side effects):

```
sh -c "<command string>"
```

* stdout and stderr merged into a single rolling buffer, capped at ~500KB to prevent OOM on runaway output.
* timeout enforced by killing the process group: `process.kill(-pid, 'SIGTERM')`. After a 3-second grace period, follow with `process.kill(-pid, 'SIGKILL')`.
* The spawned `sh` process must be started with `detached: true` so it leads its own process group. This is what makes group kill work reliably with pnpm child processes on macOS.

Orphaned `tsc`/`vite`/`pnpm` processes must be handled — this is not best-effort.

### stdout / stderr for `gate run`

* **Without `--format`**: stdout is empty. All human-readable progress, summaries, and logs go to stderr (success or failure). Safe to run interactively or in scripts that rely only on exit code.
* **With `--format json`**: stdout is the JSON payload only. All human-readable progress and logs still go to stderr. Safe to pipe stdout to another tool or parse as JSON.

### Exit code 127 handling

Exit code 127 means the shell could not find the command. When the runner sees exit code 127, it should surface a specific, actionable error rather than dumping the raw log tail:

```
Gate 'typecheck' failed: command not found (exit 127).
Command: pnpm -s tsc --noEmit
Possible causes:
  - pnpm is not installed or not in PATH
  - the script does not exist in package.json
  - the gate command has a typo in gate.config.yml
Run 'pnpm install' and verify the command manually before retrying.
```

This replaces the generic log tail in both the human output and the `logTail` field in JSON. The gate still exits with code 1 (gate failure) — code 2 is reserved for errors in gate itself, not in the spawned process.

---

## CLI commands (day-1)

```
gate init [--force]                  write gate.config.yml; fail if present unless --force
gate run <phase>                     run all gates; stdout empty, progress/logs to stderr
gate run <phase> --format json       same, emit JSON result to stdout; logs to stderr
gate run <phase> --config <path>     use alternate config
gate claude bundle <phase>            run phase; bundle to stdout if fail, exit 0 if pass
```

Day-1 only `json` is supported for `--format`. Other formats (e.g. yaml) may be added later. If `--format` is given with an unsupported value, exit 2 with a clear error.

`gate plan` is a small addition once the config loader exists — skip unless time permits.

---

## Build phases

### Phase 0 — Bootstrap

Working TS CLI skeleton with command routing. `gate --help` works. All subcommands are callable stubs.

Exit: `gate init` and `gate run` are reachable without crashing.

### Phase 1 — Config

* YAML load with zod schema validation.
* `gate init` writes template; fails clearly if config already exists (require `--force` to overwrite).
* Config error exits with code 2 and a readable message pointing to the offending field.

Exit: `gate init` creates a valid config; bad configs produce a clear error.

### Phase 2 — Runner

* Spawn via `sh -c`, `detached: true`, merged stdout/stderr buffer with cap.
* Timeout + process-group SIGTERM → SIGKILL.
* Detect exit code 127 and emit the structured command-not-found message.
* Collect exit code, duration, log tail.
* Assemble JSON result per contract, including `skip` entries.
* `--format json`: JSON to stdout, all progress and logs to stderr. Reject unsupported format values with exit 2.

Exit: on a real TS repo, `gate run fast` and `gate run fast --format json` produce correct pass/fail and valid JSON when format is json.

### Phase 3 — tsc parser

* Parse tsc output: `path(line,col): error TSxxxx: message`
* Day-1: only the first line of each multi-line `tsc` error is parsed; wrapped lines are ignored.
* Cap at 20 highlights.
* All other gates: log tail only.

Exit: typecheck failures show structured highlights in JSON and bundle.

### Phase 4 — Claude bundle

* `bundle.ts` converts a JSON result into the repair bundle text.
* `gate claude bundle <phase>` runs the phase, writes progress to stderr, writes bundle to stdout on failure.
* Only print `cwd` in bundle when it differs from repo root.
* Validate on a real failing repo with an actual Claude Code session — not just visual inspection. The format may need a tweak after a live test.

Exit: the manual loop works end-to-end at least once with a real Claude session.

### Phase 5 — Polish

* README quickstart: install, init, run, Claude loop.
* Example GitHub Actions snippet.
* Verify stdout/stderr separation and exit codes under CI-like conditions.

---

## Recommended Claude Code loop

1. Ask Claude to implement a change.
2. Run: `gate claude bundle pr`
3. If exit non-zero: paste the bundle output into Claude and ask for a minimal fix.
4. Apply the patch.
5. Repeat from step 2 until exit 0.

No special system prompt needed. The bundle is self-contained.

---

## Post-ship roadmap

* Additional `--format` options (e.g. yaml)
* Optional env guardrail (e.g. `GATE_REQUIRE_FORMAT=json` in CI to fail if `--format` is omitted)
* eslint and vitest output parsers
* `gate run --continue` (run all gates before stopping)
* `gate plan` command
* Workspace-friendly presets (without full monorepo graph)
* Plugin system for custom gates and parsers
* CI artifact upload helpers
* Agent protocol adapters (Aider, Cursor, OpenHands)