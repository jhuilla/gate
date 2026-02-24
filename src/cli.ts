#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, ConfigError } from "./config";
import { runPhase } from "./runner";

export type ExitCode = 0 | 1 | 2;

export interface CliIO {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

function help(io: CliIO): void {
  const text = `gate — run verification gates on a TS frontend repo

Usage:
  gate init [--force]              Write gate.config.yml; fail if present unless --force
  gate run <phase>                 Run all gates; stdout empty, progress/logs to stderr
  gate run <phase> --format json   Same, emit JSON result to stdout; logs to stderr
  gate run <phase> --config <path> Use alternate config
  gate claude bundle <phase>       Run phase; bundle to stdout if fail, exit 0 if pass
`;
  io.stderr.write(text);
}

function getTemplatePath(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), "../templates/gate.config.tsweb.yml");
}

export async function runCli(args: string[], io: CliIO): Promise<ExitCode> {
  const [cmd, ...rest] = args;
  const sub = rest[0];
  const phase = rest[1];

  // No args or --help / -h
  if (cmd === undefined || cmd === "--help" || cmd === "-h") {
    help(io);
    return 0;
  }

  if (cmd === "init") {
    const force = rest.includes("--force");

    const targetPath = resolve(process.cwd(), "gate.config.yml");
    if (existsSync(targetPath) && !force) {
      io.stderr.write(
        "gate.config.yml already exists. Use --force to overwrite.\n",
      );
      return 2;
    }

    const templatePath = getTemplatePath();
    let template: string;
    try {
      template = readFileSync(templatePath, "utf8");
    } catch (err) {
      io.stderr.write(
        `Failed to read embedded template at '${templatePath}': ${(err as Error).message}\n`,
      );
      return 2;
    }

    writeFileSync(targetPath, template);
    io.stderr.write(
      "Wrote gate.config.yml from template. Verify these commands match your repo before running.\n",
    );
    return 0;
  }

  if (cmd === "run") {
    const runArgs = rest;
    let phaseName: string | undefined;
    let format: string | undefined;
    let configPathArg: string | undefined;

    for (let i = 0; i < runArgs.length; i += 1) {
      const token = runArgs[i];
      if (!phaseName && token && !token.startsWith("-")) {
        phaseName = token;
      } else if (token === "--format") {
        format = runArgs[i + 1];
        i += 1;
      } else if (token === "--config") {
        configPathArg = runArgs[i + 1];
        i += 1;
      }
    }

    if (!phaseName) {
      io.stderr.write("Missing phase name. Usage: gate run <phase>\n");
      return 2;
    }

    if (format && format !== "json") {
      io.stderr.write(
        `Unsupported format '${format}'. Supported: json.\n`,
      );
      return 2;
    }

    const originalCwd = process.cwd();

    let configPathResolved: string | undefined;
    if (configPathArg) {
      configPathResolved = resolve(originalCwd, configPathArg);
    }

    let config;
    try {
      config = loadConfig(configPathResolved);
    } catch (err) {
      if (err instanceof ConfigError) {
        io.stderr.write(`${(err as Error).message}\n`);
        return 2;
      }
      io.stderr.write(
        `Unexpected error loading config: ${(err as Error).message}\n`,
      );
      return 2;
    }

    const configFilePath =
      configPathResolved ?? resolve(originalCwd, "gate.config.yml");
    const repoRoot = dirname(configFilePath);

    process.chdir(repoRoot);
    try {
      const { exitCode } = await runPhase(config, phaseName, io, {
        format: format === "json" ? "json" : undefined,
      });
      return exitCode;
    } catch (err) {
      if (err instanceof ConfigError) {
        io.stderr.write(`${(err as Error).message}\n`);
        return 2;
      }
      io.stderr.write(
        `Unexpected error running phase: ${(err as Error).message}\n`,
      );
      return 2;
    } finally {
      process.chdir(originalCwd);
    }
  }

  if (cmd === "claude") {
    if (sub !== "bundle") {
      io.stderr.write(
        `Unknown command '${cmd} ${sub ?? ""}'. Expected: gate claude bundle <phase>\n`,
      );
      return 2;
    }
    if (phase === undefined || phase.startsWith("-")) {
      io.stderr.write("Missing phase name. Usage: gate claude bundle <phase>\n");
      return 2;
    }
    io.stderr.write(`claude bundle stub (phase: ${phase})\n`);
    return 0;
  }

  io.stderr.write(`Unknown command '${cmd}'.\n`);
  return 2;
}

async function main(): Promise<void> {
  const code = await runCli(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}
