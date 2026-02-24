import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadConfig, ConfigError } from "../src/config";

function fixture(name: string): string {
  return resolve(__dirname, "fixtures", name);
}

describe("config loader", () => {
  it("loads a valid gate.config.yml and matches expected shape", () => {
    const config = loadConfig(fixture("gate.valid.yml"));

    expect(config.version).toBe(1);
    expect(config.phases.fast).toEqual(["lint", "typecheck", "test"]);
    expect(config.phases.pr).toEqual(["lint", "typecheck", "test", "build"]);

    expect(config.gates.lint.command).toBe("pnpm -s eslint .");
    expect(config.gates.typecheck.timeout).toBe(120);

    expect(config.options?.logTailLines).toBe(50);
    expect(config.options?.stopOnFirstFailure).toBe(true);
  });

  it("throws ConfigError with exitCode 2 for empty phase", () => {
    expect(() => loadConfig(fixture("gate.empty-phase.yml"))).toThrow(ConfigError);

    try {
      loadConfig(fixture("gate.empty-phase.yml"));
    } catch (err) {
      const e = err as ConfigError;
      expect(e.exitCode).toBe(2);
      expect(e.message).toContain("phases.fast");
      expect(e.message).toContain("at least one gate");
    }
  });

  it("throws ConfigError with exitCode 2 for bad types", () => {
    expect(() => loadConfig(fixture("gate.bad-types.yml"))).toThrow(ConfigError);

    try {
      loadConfig(fixture("gate.bad-types.yml"));
    } catch (err) {
      const e = err as ConfigError;
      expect(e.exitCode).toBe(2);
      expect(e.message).toContain("version");
    }
  });

  it("throws ConfigError when file does not exist", () => {
    try {
      loadConfig(fixture("does-not-exist.yml"));
    } catch (err) {
      const e = err as ConfigError;
      expect(e.exitCode).toBe(2);
      expect(e.message).toContain("Failed to read config file");
    }
  });
});

