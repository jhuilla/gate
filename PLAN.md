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

Across all phases, follow **TDD**:

1. Start by writing or updating automated tests that encode the phase's exit criteria.
2. Run tests and see them fail for the right reason.
3. Implement the minimum code to make the new tests pass.
4. Refactor while keeping the suite green.

### Phase 0 — Bootstrap (DONE)

- **Tests first**
  - Add a small smoke-test suite around the CLI entry (e.g., via `vitest` or another test runner) that:
    - Asserts `gate --help` exits 0 and prints usage text.
    - Asserts `gate init --help` and `gate run --help` are wired and exit 0.
  - These tests can shell out to the built CLI or invoke the command router directly.
- **Implementation**
  - Implement the minimal TS CLI skeleton with command routing so the above tests pass.
  - Ensure all subcommands exist as callable stubs.
- **Exit (all green)**
  - `gate init` and `gate run` are reachable without crashing, and the CLI smoke tests pass.

### Phase 1 — Config (DONE)

- **Tests first**
  - Unit tests for `config.ts` that:
    - Load a valid `gate.config.yml` and assert the parsed structure matches the schema.
    - Cover representative invalid configs (missing phase, empty phase, bad gate field, wrong types) and assert:
      - Exit code 2 is used for config errors.
      - Error messages point to the offending field.
  - Tests for `gate init` that:
    - Assert it writes the default template when no config exists.
    - Assert it fails clearly if the config already exists, and only overwrites with `--force`.
- **Implementation**
  - Implement YAML load with zod schema validation to satisfy the tests.
  - Implement `gate init` behavior and error mapping so tests for exit codes and messages pass.
- **Exit (all green)**
  - `gate init` creates a valid config; bad configs produce a clear error; all config tests pass.

### Phase 2 — Runner (DONE)

- **Tests first**
  - Integration-style tests around `runner.ts` that:
    - Run against a small fixture repo with a simple `gate.config.yml`.
    - Assert `gate run fast`:
      - Returns correct exit codes for passing and failing gates.
      - Produces no stdout (human mode) and writes progress/logs to stderr.
    - Assert `gate run fast --format json`:
      - Emits valid JSON matching the contract (statuses, `failedGate`, `failedGates`, `skip` entries, `exitCode: null` for skipped).
      - Sends all human-readable logs to stderr only.
    - Simulate a command timing out and assert timeout behavior (exit code, log tail, and process group cleanup if observable).
    - Simulate a command-not-found case and assert exit code 1 plus the structured 127-message is present in stderr and `logTail`.
    - Assert unsupported `--format` values exit 2 with a clear error.
- **Implementation**
  - Implement process spawning via `sh -c` with `detached: true`, merged stdout/stderr buffer, and cap.
  - Implement timeout and process-group SIGTERM → SIGKILL.
  - Implement JSON assembly per contract and `--format` behavior to satisfy the tests.
- **Exit (all green)**
  - On a real TS repo, `gate run fast` and `gate run fast --format json` behave per contract, and all runner tests pass.

### Phase 2.5 — Self-gating (DONE)

- **Tests first**
  - Integration tests that invoke the built CLI from this repo root (or a temp copy of it) with a real `gate.config.yml` for `gate` itself.
  - Assert `gate run fast` on this repo:
    - Exits 0 when the repo is healthy.
    - Produces no stdout in human mode and sends progress/logs to stderr.
  - Assert `gate run fast --format json` on this repo:
    - Exits 0 when healthy and emits JSON matching the contract.
    - Still routes all human-readable logs to stderr.
  - Introduce a controlled failure (e.g. a broken `tsc` or test command) in a temp copy of this repo and assert:
    - Exit code 1 on gate failure, with `failedGate` and `failedGates` populated correctly.
    - The JSON output and log tail accurately reflect the failure.
- **Implementation**
  - Add and maintain a `gate.config.yml` at the root of this repo that defines `fast` / `pr` phases and gates (lint, typecheck, test, build) appropriate for `gate` itself.
  - Ensure `pnpm` scripts and local tooling in this repo match the commands referenced in the self-gating config.
  - Wire the integration tests to use the built CLI (or a near-identical in-process entry) so they exercise the full runner path.
- **Exit (all green)**
  - This repo can successfully run `gate run fast` and `gate run fast --format json` against itself and behave exactly as a “regular” TS repo would.
  - A CI job (even if minimal) exists that runs `gate run fast` on this repo and will fail if gates fail, making `gate` self-gating in practice.

### Phase 3 — tsc parser (TODO)

- **Tests first**
  - Unit tests for `parse.ts` that:
    - Feed representative `tsc` output strings and assert parsed highlights contain correct `file`, `line`, `col`, `message`, and `tool: "tsc"`.
    - Include multi-line errors and assert only the first line is parsed.
    - Include >20 errors and assert the highlights array is capped at 20.
  - Integration tests that run a failing `typecheck` gate and assert:
    - JSON output includes structured highlights for tsc.
    - Non-`tsc` gates still only include log tails.
- **Implementation**
  - Implement the tsc parser with the described constraints and integrate it into the runner.
- **Exit (all green)**
  - Typecheck failures show structured highlights in JSON and bundle, and all parser tests pass.

### Phase 4 — Claude bundle (TODO)

- **Tests first**
  - Unit tests for `bundle.ts` that:
    - Given a failing JSON result with one failed gate, assert the rendered text matches the bundle contract (sections, wording, highlights, log tail).
    - Given multiple failed gates, assert one FAILED GATE block per failed gate in phase order.
    - Assert `cwd` appears only when it differs from the repo root.
  - Integration tests for `gate claude bundle <phase>` that:
    - Run on a small fixture repo with a known failing gate.
    - Assert progress goes to stderr, and stdout contains either nothing (pass) or a well-formed bundle (fail).
- **Implementation**
  - Implement `bundle.ts` and wire `gate claude bundle <phase>` to the runner and bundler so the tests pass.
- **Exit (all green)**
  - The manual loop works end-to-end at least once with a real Claude session, and the bundle tests pass.

### Phase 5 — Polish (TODO)

- **Tests first**
  - Lightweight tests or scripts that:
    - Exercise the documented README quickstart commands (`init`, `run`, `claude bundle`) in a fixture repo to prevent regressions.
    - Exercise the example GitHub Actions snippet in a dry-run or local CI harness where feasible.
    - Assert stdout/stderr separation and exit codes still match the contract in these flows.
- **Implementation**
  - Write and polish the README quickstart and CI examples.
  - Adjust CLI ergonomics and messaging as needed to keep the tests passing.
- **Exit (all green)**
  - Docs and examples reflect the actual behavior of the tool, and the high-level integration tests remain green.

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