# Agent instructions — Gate

Instructions for AI agents (and humans) working on this repo.

## Plan and phases

- **Source of truth:** [PLAN.md](PLAN.md) defines the goal, config format, JSON contract, bundle format, exit codes, and build phases.
- **When a phase is complete:** If you are satisfied that a phase’s implementation meets its exit criteria and tests pass, update PLAN.md: change the phase heading from `(TODO)` to `(DONE)` (e.g. `### Phase 2 — Runner (DONE)`). Optionally add a short note under that phase describing what was done.
- **Build order:** Implement phases in order (0 → 1 → 2 → …). Each phase’s “Tests first” and “Exit” criteria are the definition of done.
- **Self-gating:** Before you change any phase `(TODO)` to `(DONE)`, you must:
  - Run `pnpm build`.
  - From the repo root, run `node dist/cli.js run fast` (using this repo’s own `gate.config.yml`) and require it to exit 0. Do not mark the phase as `(DONE)` if this self-gate fails.

## Development workflow

- **TDD:** Per PLAN.md, for each phase: write or update tests that encode the exit criteria, see them fail, implement until they pass, then refactor with the suite green.
- **Tests:** `pnpm test` (vitest). Use `pnpm test -- --run` for a single run without watch. Unit tests live in `test/` next to the code they exercise (e.g. `test/config.test.ts`, `test/cli.test.ts`).
- **Build:** `pnpm build` (TypeScript to `dist/`). The CLI entry is `dist/cli.js`; run with `pnpm start -- <args>` or `node dist/cli.js <args>`.
- **Fixtures:** Test fixtures (e.g. YAML configs) live under `test/fixtures/`. Use temp directories for tests that write files (e.g. `gate init`); restore `process.cwd()` in `afterEach` to avoid leaking state.

## Conventions

- **Exit codes:** 0 = pass, 1 = gate failure, 2 = config or runtime error. Use `ConfigError` (from `config.ts`) for config validation failures; it has `exitCode: 2`.
- **stdout vs stderr:** Without `--format`, stdout is empty; progress and logs go to stderr. With `--format json`, only the JSON payload goes to stdout; logs still go to stderr.
- **Config:** Repo root = directory containing the loaded `gate.config.yml`. Config is validated with zod in `src/config.ts`; invalid configs must produce clear, field-pointing error messages and exit 2.
- **Structure:** Keep the repo flat; split files when they get long. See PLAN.md “Repo structure” for the intended layout (`src/cli.ts`, `config.ts`, `runner.ts`, `parse.ts`, `bundle.ts`, `templates/`).

## Useful references

- Config schema and optional fields: PLAN.md “Config format” and “Optional per-gate fields”.
- JSON output contract: PLAN.md “JSON output contract”.
- Claude bundle format: PLAN.md “Claude repair bundle format”.
- Process execution (spawn, timeout, buffers): PLAN.md “Process execution” and “Exit code 127 handling”.
