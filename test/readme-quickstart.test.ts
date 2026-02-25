import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { runCli, type CliIO } from "../src/cli";

class StringWriter extends Writable {
  data = "";

  _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.data += String(chunk);
    callback();
  }
}

function createIO(): { io: CliIO; stdout: StringWriter; stderr: StringWriter } {
  const stdout = new StringWriter();
  const stderr = new StringWriter();
  const io: CliIO = {
    stdout,
    stderr,
  };
  return { io, stdout, stderr };
}

function fixtureDir(name: string): string {
  return resolvePath(__dirname, "fixtures", name);
}

describe("README quickstart flows via CLI", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    process.chdir(originalCwd);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it("quickstart: init creates gate.config.yml in a fresh directory", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gate-readme-init-"));
    process.chdir(tmp);

    const { io, stdout, stderr } = createIO();
    const code = await runCli(["init"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");

    const writtenPath = resolvePath(tmp, "gate.config.yml");
    expect(existsSync(writtenPath)).toBe(true);

    const written = readFileSync(writtenPath, "utf8");
    expect(written).toContain("phases:");
    expect(stderr.data).toContain("Wrote gate.config.yml");
  });

  it("quickstart: run fast in human mode uses stderr only", async () => {
    const repo = fixtureDir("phase2-pass-fail");
    process.chdir(repo);

    const { io, stdout, stderr } = createIO();
    const code = await runCli(["run", "fast"], io);

    // fixture is designed to fail one gate and skip the rest
    expect(code).toBe(1);
    expect(stdout.data).toBe("");
    expect(stderr.data).toContain("pass gate running");
    expect(stderr.data).toContain("fail gate running");
  });

  it("quickstart: run fast --format json emits JSON to stdout and logs to stderr", async () => {
    const repo = fixtureDir("phase2-pass-fail");
    process.chdir(repo);

    const { io, stdout, stderr } = createIO();
    const code = await runCli(["run", "fast", "--format", "json"], io);

    expect(code).toBe(1);
    expect(stdout.data).not.toBe("");

    const parsed = JSON.parse(stdout.data);
    expect(parsed).toMatchObject({
      phase: "fast",
      status: "fail",
      failedGate: "fail",
    });

    expect(Array.isArray(parsed.gates)).toBe(true);
    expect(stderr.data).toContain("pass gate running");
    expect(stderr.data).toContain("fail gate running");
  });

  it("quickstart: claude bundle prints bundle to stdout for a failing phase", async () => {
    const repo = fixtureDir("phase3-tsc-parser");
    process.chdir(repo);

    const { io, stdout, stderr } = createIO();
    const code = await runCli(["claude", "bundle", "fast"], io);

    expect(code).toBe(1);
    expect(stderr.data).toContain("Type 'X' is not assignable to type 'Y'.");

    expect(stdout.data).toContain("GATE FAILED: typecheck");
    expect(stdout.data).toContain("PHASE: fast");
    expect(stdout.data).toContain("━━━ FAILED GATE ━━━");
    expect(stdout.data).toContain("Gate:    typecheck");
    expect(stdout.data).toContain("HIGHLIGHTS:");
    expect(stdout.data).toContain("LOG TAIL:");
  });

  it("CI snippet: gate run fast --format json is safe to capture stdout", async () => {
    const repo = fixtureDir("phase2-pass-fail");
    process.chdir(repo);

    const { io, stdout, stderr } = createIO();
    const code = await runCli(["run", "fast", "--format", "json"], io);

    expect(code).toBe(1);

    const text = stdout.data.trim();
    expect(text).not.toBe("");

    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty("phase", "fast");
    expect(parsed).toHaveProperty("status");
    expect(parsed).toHaveProperty("gates");

    expect(stderr.data).toContain("pass gate running");
    expect(stderr.data).toContain("fail gate running");
  });
});

