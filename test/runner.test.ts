import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { Writable } from "node:stream";
import { loadConfig } from "../src/config";
import { runPhase } from "../src/runner";

class StringWriter extends Writable {
  data = "";

  _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.data += String(chunk);
    callback();
  }
}

function fixtureDir(name: string): string {
  return resolve(__dirname, "fixtures", name);
}

describe("runner integration", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    process.chdir(originalCwd);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it(
    "runs a phase, stops on first failure, and marks later gates as skipped",
    async () => {
      const repo = fixtureDir("phase2-pass-fail");
      process.chdir(repo);

      const config = loadConfig();
      const stdout = new StringWriter();
      const stderr = new StringWriter();

      const { exitCode, result } = await runPhase(
        config,
        "fast",
        { stdout, stderr },
        { format: "json" },
      );

      expect(exitCode).toBe(1);
      expect(stdout.data).not.toBe("");
      expect(stderr.data).toContain("pass gate running");
      expect(stderr.data).toContain("fail gate running");
      expect(stderr.data).not.toContain("after gate running");

      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.version).toBe(1);
      expect(result.phase).toBe("fast");
      expect(result.status).toBe("fail");
      expect(result.failedGate).toBe("fail");
      expect(result.failedGates).toEqual(["fail"]);
      expect(result.gates).toHaveLength(3);

      const [passGate, failGate, afterGate] = result.gates;

      expect(passGate.name).toBe("pass");
      expect(passGate.status).toBe("pass");
      expect(passGate.exitCode).toBe(0);

      expect(failGate.name).toBe("fail");
      expect(failGate.status).toBe("fail");
      expect(failGate.exitCode).toBe(1);

      expect(afterGate.name).toBe("after");
      expect(afterGate.status).toBe("skip");
      expect(afterGate.exitCode).toBeNull();
      expect(afterGate.reason).toContain("stopOnFirstFailure");
    },
    20000,
  );

  it("times out a slow gate and reports failure", async () => {
    const repo = fixtureDir("phase2-timeout");
    process.chdir(repo);

    const config = loadConfig();
    const stdout = new StringWriter();
    const stderr = new StringWriter();

    const { exitCode, result } = await runPhase(
      config,
      "fast",
      { stdout, stderr },
      { format: "json" },
    );

    expect(exitCode).toBe(1);
    expect(stdout.data).not.toBe("");
    expect(stderr.data).toContain("timed out after 1s");

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.status).toBe("fail");
    expect(result.failedGate).toBe("slow");
    expect(result.failedGates).toEqual(["slow"]);
    expect(result.gates).toHaveLength(1);

    const [slowGate] = result.gates;
    expect(slowGate.name).toBe("slow");
    expect(slowGate.status).toBe("fail");
    expect(slowGate.exitCode).toBe(1);
    expect(slowGate.logTail).toContain("timed out after 1s");
  });

  it("handles command-not-found (exit 127) with a helpful message and exit code 1", async () => {
    const repo = fixtureDir("phase2-missing-command");
    process.chdir(repo);

    const config = loadConfig();
    const stdout = new StringWriter();
    const stderr = new StringWriter();

    const { exitCode, result } = await runPhase(
      config,
      "fast",
      { stdout, stderr },
      { format: "json" },
    );

    expect(exitCode).toBe(1);
    expect(stdout.data).not.toBe("");

    expect(stderr.data).toContain(
      "failed: command not found (exit 127)",
    );
    expect(stderr.data).toContain("Possible causes:");

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.status).toBe("fail");
    expect(result.failedGate).toBe("missing");
    expect(result.failedGates).toEqual(["missing"]);
    expect(result.gates).toHaveLength(1);

    const [missing] = result.gates;
    expect(missing.name).toBe("missing");
    expect(missing.status).toBe("fail");
    expect(missing.exitCode).toBe(1);
    expect(missing.logTail).toContain("command not found (exit 127)");
    expect(missing.logTail).toContain("Possible causes:");
  });

  it(
    "produces no stdout in human mode and sends logs to stderr",
    async () => {
      const repo = fixtureDir("phase2-pass-fail");
      process.chdir(repo);

      const config = loadConfig();
      const stdout = new StringWriter();
      const stderr = new StringWriter();

      const { exitCode, result } = await runPhase(config, "fast", {
        stdout,
        stderr,
      });

      expect(exitCode).toBe(1);
      expect(result).toBeNull();
      expect(stdout.data).toBe("");
      expect(stderr.data).toContain("pass gate running");
      expect(stderr.data).toContain("fail gate running");
    },
    20000,
  );
});

