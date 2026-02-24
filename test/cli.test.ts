import { describe, it, expect } from "vitest";
import { runCli, type CliIO } from "../src/cli";
import { Writable } from "node:stream";

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
  it("shows help and exits 0 for --help", () => {
    const { io, stdout, stderr } = createIO();
    const code = runCli(["--help"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");
    expect(stderr.data).toContain("Usage:");
    expect(stderr.data).toContain("gate init [--force]");
  });

  it("shows help and exits 0 with no args", () => {
    const { io, stdout, stderr } = createIO();
    const code = runCli([], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");
    expect(stderr.data).toContain("Usage:");
  });

  it("runs init stub and exits 0", () => {
    const { io, stdout, stderr } = createIO();
    const code = runCli(["init"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");
    expect(stderr.data.trim()).toBe("init stub");
  });

  it("errors with exit 2 when run is missing phase", () => {
    const { io, stdout, stderr } = createIO();
    const code = runCli(["run"], io);

    expect(code).toBe(2);
    expect(stdout.data).toBe("");
    expect(stderr.data.trim()).toBe("Missing phase name. Usage: gate run <phase>");
  });

  it("runs run stub with phase and exits 0", () => {
    const { io, stdout, stderr } = createIO();
    const code = runCli(["run", "fast"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");
    expect(stderr.data.trim()).toBe("run stub (phase: fast)");
  });

  it("runs claude bundle stub with phase and exits 0", () => {
    const { io, stdout, stderr } = createIO();
    const code = runCli(["claude", "bundle", "pr"], io);

    expect(code).toBe(0);
    expect(stdout.data).toBe("");
    expect(stderr.data.trim()).toBe("claude bundle stub (phase: pr)");
  });

  it("errors with exit 2 for unknown command", () => {
    const { io, stdout, stderr } = createIO();
    const code = runCli(["unknown"], io);

    expect(code).toBe(2);
    expect(stdout.data).toBe("");
    expect(stderr.data.trim()).toBe("Unknown command 'unknown'.");
  });
});

