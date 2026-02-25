import type { GateConfig } from "./config.js";
import type { PhaseResult } from "./runner.js";

function formatHighlights(highlights: PhaseResult["gates"][number]["highlights"]): string[] {
  if (!highlights.length) {
    return ["  (no structured highlights captured)"];
  }

  return highlights.map((h) => {
    return `  ${h.file}:${h.line}:${h.col}  ${h.message}`;
  });
}

function formatLogTail(logTail: string): string[] {
  if (!logTail.trim()) {
    return ["  (no log output captured)"];
  }

  return logTail.split(/\r?\n/).map((line) => `  ${line}`);
}

function formatGateBlock(
  phaseResult: PhaseResult,
  gateName: string,
  config: GateConfig,
): string[] {
  const gate = phaseResult.gates.find((g) => g.name === gateName);
  if (!gate) {
    return [];
  }

  const def = config.gates[gate.name];
  const showCwd = !!def?.cwd && def.cwd !== ".";

  const lines: string[] = [];
  lines.push("━━━ FAILED GATE ━━━");
  lines.push(`Gate:    ${gate.name}`);
  lines.push(`Command: ${gate.command}`);
  if (showCwd) {
    lines.push(`Cwd:     ${def.cwd}`);
  }
  lines.push(`Exit:    ${gate.exitCode ?? ""}`);
  lines.push("");
  lines.push("HIGHLIGHTS:");
  lines.push(...formatHighlights(gate.highlights));
  lines.push("");
  lines.push("LOG TAIL:");
  lines.push(...formatLogTail(gate.logTail));

  return lines;
}

export function renderClaudeBundle(
  phaseResult: PhaseResult,
  config: GateConfig,
): string {
  if (phaseResult.status === "pass" || phaseResult.failedGates.length === 0) {
    return "";
  }

  const lines: string[] = [];

  const primaryFailedGate = phaseResult.failedGate ?? phaseResult.failedGates[0];

  lines.push(`GATE FAILED: ${primaryFailedGate}`);
  lines.push(`PHASE: ${phaseResult.phase}`);
  lines.push("");
  lines.push(
    "To fix this repo, make the smallest change that causes this command to pass:",
  );
  lines.push(`  pnpm exec gate run ${phaseResult.phase}`);
  lines.push("");

  for (const gateName of phaseResult.failedGates) {
    lines.push(...formatGateBlock(phaseResult, gateName, config));
    lines.push("");
  }

  lines.push("━━━ NEXT ━━━");
  lines.push(
    "After making edits, the harness will rerun `pnpm exec gate run pr`.",
  );
  lines.push("You do not need to run tests yourself.");
  lines.push("");
  lines.push("━━━ RULES ━━━");
  lines.push("- Make the smallest change that makes the gate pass.");
  lines.push("- Do not change tests unless the tests themselves are wrong.");
  lines.push("- Do not add dependencies unless strictly unavoidable.");
  lines.push("- Do not refactor unrelated code.");
  lines.push(
    "- When done, respond with a short list of files changed and why.",
  );

  return `${lines.join("\n")}\n`;
}

