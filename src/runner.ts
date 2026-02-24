import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { CliIO, ExitCode } from "./cli";
import { type GateConfig, type GateResultConfig, ConfigError } from "./config";

export interface PhaseResult {
  version: 1;
  phase: string;
  status: "pass" | "fail";
  startedAt: string;
  durationMs: number;
  failedGate: string | null;
  failedGates: string[];
  gates: GateResultConfig[];
}

export interface RunPhaseOptions {
  format?: "json";
}

const MAX_LOG_BYTES = 500 * 1024; // ~500KB

interface GateExecutionResult {
  result: GateResultConfig;
  failed: boolean;
}

function tailLines(buffer: string, maxLines: number): string {
  const lines = buffer.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return buffer.trimEnd();
  }
  return lines.slice(-maxLines).join("\n").trimEnd();
}

async function runSingleGate(
  name: string,
  command: string,
  gateConfig: GateConfig,
  io: CliIO,
): Promise<GateExecutionResult> {
  const def = gateConfig.gates[name];
  if (!def) {
    throw new Error(`Gate '${name}' is not defined in gates map`);
  }

  const timeoutSeconds = def.timeout ?? 60;
  const timeoutMs = timeoutSeconds * 1000;
  const logTailLines = gateConfig.options?.logTailLines ?? 50;

  const cwd = def.cwd ? resolve(process.cwd(), def.cwd) : process.cwd();
  const env = { ...process.env, ...(def.env ?? {}) };

  const started = Date.now();
  let buffer = "";

  const append = (chunk: string): void => {
    buffer += chunk;
    if (buffer.length > MAX_LOG_BYTES) {
      buffer = buffer.slice(buffer.length - MAX_LOG_BYTES);
    }
    io.stderr.write(chunk);
  };

  return new Promise<GateExecutionResult>((resolvePromise) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => append(chunk));
    child.stderr.on("data", (chunk: string) => append(chunk));

    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      const msg = `Gate '${name}' timed out after ${timeoutSeconds}s.\n`;
      append(msg);
      try {
        if (child.pid != null) {
          process.kill(-child.pid, "SIGTERM");
          setTimeout(() => {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              // ignore
            }
          }, 3000);
        }
      } catch {
        // ignore kill errors
      }
    }, timeoutMs);

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - started;

      let status: GateResultConfig["status"];
      let exitCode: number | null;
      let logTail = tailLines(buffer, logTailLines);

      if (timedOut) {
        status = "fail";
        exitCode = 1;
      } else if (code === 0) {
        status = "pass";
        exitCode = 0;
      } else if (code === 127) {
        status = "fail";
        exitCode = 1;
        const msgLines = [
          `Gate '${name}' failed: command not found (exit 127).`,
          `Command: ${command}`,
          "Possible causes:",
          "  - pnpm is not installed or not in PATH",
          "  - the script does not exist in package.json",
          "  - the gate command has a typo in gate.config.yml",
          "Run 'pnpm install' and verify the command manually before retrying.",
        ];
        logTail = msgLines.join("\n");
        io.stderr.write(`${logTail}\n`);
      } else {
        status = "fail";
        exitCode = code ?? 1;
      }

      const result: GateResultConfig = {
        name,
        status,
        command,
        exitCode,
        durationMs,
        highlights: [],
        logTail,
      };

      resolvePromise({
        result,
        failed: status === "fail",
      });
    });

    child.on("error", (err: Error) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - started;
      const message = `Failed to start gate '${name}': ${err.message}\n`;
      append(message);

      const result: GateResultConfig = {
        name,
        status: "fail",
        command,
        exitCode: 1,
        durationMs,
        highlights: [],
        logTail: tailLines(buffer, logTailLines),
      };

      resolvePromise({
        result,
        failed: true,
      });
    });
  });
}

export async function runPhase(
  config: GateConfig,
  phaseName: string,
  io: CliIO,
  options: RunPhaseOptions = {},
): Promise<{ exitCode: ExitCode; result: PhaseResult | null }> {
  const phaseGates = config.phases[phaseName];
  if (!phaseGates || phaseGates.length === 0) {
    throw new ConfigError(`Phase '${phaseName}' is not defined or empty`);
  }

  const stopOnFirstFailure = config.options?.stopOnFirstFailure ?? true;

  const startedAt = new Date();
  const gateResults: GateResultConfig[] = [];
  const failedGates: string[] = [];

  let shouldSkip = false;
  let firstFailedGate: string | null = null;

  for (const gateName of phaseGates) {
    const def = config.gates[gateName];
    if (!def) {
      throw new ConfigError(
        `Gate '${gateName}' referenced in phase '${phaseName}' is not defined`,
      );
    }

    if (shouldSkip) {
      gateResults.push({
        name: gateName,
        status: "skip",
        command: def.command,
        exitCode: null,
        durationMs: 0,
        reason: firstFailedGate
          ? `skipped: stopOnFirstFailure after ${firstFailedGate} failed`
          : "skipped: stopOnFirstFailure after previous failure",
        highlights: [],
        logTail: "",
      });
      continue;
    }

    const { result, failed } = await runSingleGate(
      gateName,
      def.command,
      config,
      io,
    );
    gateResults.push(result);

    if (failed) {
      failedGates.push(gateName);
      if (!firstFailedGate) {
        firstFailedGate = gateName;
      }
      if (stopOnFirstFailure) {
        shouldSkip = true;
      }
    }
  }

  const durationMs = Date.now() - startedAt.getTime();

  const phaseStatus: PhaseResult["status"] =
    failedGates.length === 0 ? "pass" : "fail";

  const phaseResult: PhaseResult = {
    version: 1,
    phase: phaseName,
    status: phaseStatus,
    startedAt: startedAt.toISOString(),
    durationMs,
    failedGate: phaseStatus === "pass" ? null : firstFailedGate,
    failedGates,
    gates: gateResults,
  };

  const exitCode: ExitCode = phaseStatus === "pass" ? 0 : 1;

  if (options.format === "json") {
    io.stdout.write(`${JSON.stringify(phaseResult)}\n`);
    return { exitCode, result: phaseResult };
  }

  return { exitCode, result: null };
}

