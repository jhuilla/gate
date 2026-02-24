import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli, type CliIO } from "../src/cli";
import { Writable } from "node:stream";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

class StringWriter extends Writable {
  data = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.data += chunk.toString();
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

describe("CLI bootstrap behavior", () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it("shows help and exits 0 for --help", async () => {
    const { io, stdout, stderr } = createIO();
    const code = await runCli(["--help"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");
    expect(stderr.data).toContain("Usage:");
    expect(stderr.data).toContain("gate init [--force]");
  });

  it("shows help and exits 0 with no args", async () => {
    const { io, stdout, stderr } = createIO();
    const code = await runCli([], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");
    expect(stderr.data).toContain("Usage:");
  });

  it("runs init stub and exits 0", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gate-init-"));
    process.chdir(tmp);

    const { io, stdout, stderr } = createIO();
    const code = await runCli(["init"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");

    const writtenPath = resolvePath(tmp, "gate.config.yml");
    expect(existsSync(writtenPath)).toBe(true);

    const written = readFileSync(writtenPath, "utf8");
    const templatePath = resolvePath(
      __dirname,
      "../templates/gate.config.tsweb.yml",
    );
    const template = readFileSync(templatePath, "utf8");

    expect(written).toBe(template);
    expect(stderr.data).toContain("Wrote gate.config.yml");
  });

  it("fails clearly if config already exists without --force", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gate-init-existing-"));
    process.chdir(tmp);

    const targetPath = resolvePath(tmp, "gate.config.yml");
    writeFileSync(targetPath, "# existing config\n");

    const { io, stdout, stderr } = createIO();
    const code = await runCli(["init"], io);

    expect(code).toBe(2);
    expect(stdout.data).toBe("");
    expect(readFileSync(targetPath, "utf8")).toBe("# existing config\n");
    expect(stderr.data).toContain("already exists");
    expect(stderr.data).toContain("--force");
  });

  it("overwrites existing config when --force is provided", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gate-init-force-"));
    process.chdir(tmp);

    const targetPath = resolvePath(tmp, "gate.config.yml");
    writeFileSync(targetPath, "# old config\n");

    const { io, stdout, stderr } = createIO();
    const code = await runCli(["init", "--force"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");

    const written = readFileSync(targetPath, "utf8");
    const templatePath = resolvePath(
      __dirname,
      "../templates/gate.config.tsweb.yml",
    );
    const template = readFileSync(templatePath, "utf8");

    expect(written).toBe(template);
    expect(stderr.data).toContain("Wrote gate.config.yml");
  });

  it("errors with exit 2 when run is missing phase", async () => {
    const { io, stdout, stderr } = createIO();
    const code = await runCli(["run"], io);

    expect(code).toBe(2);
    expect(stdout.data).toBe("");
    expect(stderr.data.trim()).toBe("Missing phase name. Usage: gate run <phase>");
  });

  it("runs claude bundle stub with phase and exits 0", async () => {
    const { io, stdout, stderr } = createIO();
    const code = await runCli(["claude", "bundle", "pr"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");
    expect(stderr.data.trim()).toBe("claude bundle stub (phase: pr)");
  });

  it("errors with exit 2 for unknown command", async () => {
    const { io, stdout, stderr } = createIO();
    const code = await runCli(["unknown"], io);

    expect(code).toBe(2);
    expect(stdout.data).toBe("");
    expect(stderr.data.trim()).toBe("Unknown command 'unknown'.");
  });
});

