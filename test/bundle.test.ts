import { describe, it, expect } from "vitest";
import type { PhaseResult } from "../src/runner";
import type { GateConfig } from "../src/config";
import { renderClaudeBundle } from "../src/bundle";

function makeConfig(overrides: Partial<GateConfig> = {}): GateConfig {
  return {
    version: 1,
    phases: { fast: ["typecheck"] },
    gates: {
      typecheck: {
        command: "pnpm -s tsc --noEmit",
      },
      ...(overrides.gates ?? {}),
    },
    options: overrides.options,
  };
}

function makeBasePhaseResult(): PhaseResult {
  return {
    version: 1,
    phase: "pr",
    status: "fail",
    startedAt: new Date(0).toISOString(),
    durationMs: 1234,
    failedGate: "typecheck",
    failedGates: ["typecheck"],
    gates: [
      {
        name: "typecheck",
        status: "fail",
        command: "pnpm -s tsc --noEmit",
        exitCode: 2,
        durationMs: 1000,
        highlights: [
          {
            file: "src/foo.ts",
            line: 42,
            col: 13,
            message: "Type 'X' is not assignable to type 'Y'",
            tool: "tsc",
          },
          {
            file: "src/foo.ts",
            line: 51,
            col: 5,
            message: "Property 'bar' does not exist on type 'Baz'",
            tool: "tsc",
          },
        ],
        logTail: "[last 50 lines of combined stdout/stderr]",
      },
    ],
  };
}

describe("Claude bundle renderer", () => {
  it("renders a single failing gate bundle matching the contract", () => {
    const phaseResult = makeBasePhaseResult();
    const config = makeConfig();

    const text = renderClaudeBundle(phaseResult, config);

    expect(text).toContain("GATE FAILED: typecheck");
    expect(text).toContain("PHASE: pr");
    expect(text).toContain(
      "To fix this repo, make the smallest change that causes this command to pass:",
    );
    expect(text).toContain("  gate run pr");

    expect(text).toContain("━━━ FAILED GATE ━━━");
    expect(text).toContain("Gate:    typecheck");
    expect(text).toContain("Command: pnpm -s tsc --noEmit");
    expect(text).toContain("Exit:    2");

    expect(text).toContain("HIGHLIGHTS:");
    expect(text).toContain(
      "  src/foo.ts:42:13  Type 'X' is not assignable to type 'Y'",
    );
    expect(text).toContain(
      "  src/foo.ts:51:5  Property 'bar' does not exist on type 'Baz'",
    );

    expect(text).toContain("LOG TAIL:");
    expect(text).toContain(
      "  [last 50 lines of combined stdout/stderr]",
    );

    expect(text).toContain("━━━ NEXT ━━━");
    expect(text).toContain(
      "After making edits, the harness will rerun `gate run pr`.",
    );
    expect(text).toContain("You do not need to run tests yourself.");

    expect(text).toContain("━━━ RULES ━━━");
    expect(text).toContain(
      "- Make the smallest change that makes the gate pass.",
    );
    expect(text).toContain(
      "- Do not change tests unless the tests themselves are wrong.",
    );
    expect(text).toContain(
      "- Do not add dependencies unless strictly unavoidable.",
    );
    expect(text).toContain("- Do not refactor unrelated code.");
    expect(text).toContain(
      "- When done, respond with a short list of files changed and why.",
    );
  });

  it("renders one FAILED GATE block per failed gate in phase order", () => {
    const phaseResult: PhaseResult = {
      version: 1,
      phase: "fast",
      status: "fail",
      startedAt: new Date(0).toISOString(),
      durationMs: 2000,
      failedGate: "lint",
      failedGates: ["lint", "test"],
      gates: [
        {
          name: "lint",
          status: "fail",
          command: "pnpm -s eslint .",
          exitCode: 1,
          durationMs: 500,
          highlights: [],
          logTail: "lint failed",
        },
        {
          name: "test",
          status: "fail",
          command: "pnpm -s vitest run",
          exitCode: 1,
          durationMs: 1500,
          highlights: [],
          logTail: "tests failed",
        },
      ],
    };

    const config: GateConfig = {
      version: 1,
      phases: { fast: ["lint", "test"] },
      gates: {
        lint: { command: "pnpm -s eslint ." },
        test: { command: "pnpm -s vitest run" },
      },
    };

    const text = renderClaudeBundle(phaseResult, config);

    const blocks = text.match(/━━━ FAILED GATE ━━━/g) ?? [];
    expect(blocks).toHaveLength(2);

    const lintIndex = text.indexOf("Gate:    lint");
    const testIndex = text.indexOf("Gate:    test");
    expect(lintIndex).toBeGreaterThanOrEqual(0);
    expect(testIndex).toBeGreaterThanOrEqual(0);
    expect(lintIndex).toBeLessThan(testIndex);
  });

  it("includes Cwd only when it differs from the repo root", () => {
    const baseResult = makeBasePhaseResult();

    const withDefaultCwdConfig: GateConfig = {
      version: 1,
      phases: { pr: ["typecheck"] },
      gates: {
        typecheck: {
          command: "pnpm -s tsc --noEmit",
        },
      },
    };

    const textWithoutCwd = renderClaudeBundle(baseResult, withDefaultCwdConfig);
    expect(textWithoutCwd).not.toContain("Cwd:");

    const withCustomCwdConfig: GateConfig = {
      version: 1,
      phases: { pr: ["typecheck"] },
      gates: {
        typecheck: {
          command: "pnpm -s tsc --noEmit",
          cwd: "apps/web",
        },
      },
    };

    const textWithCwd = renderClaudeBundle(baseResult, withCustomCwdConfig);
    expect(textWithCwd).toContain("Cwd:     apps/web");
  });
});

