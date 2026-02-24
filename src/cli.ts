#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function runCli(args: string[], io: CliIO): ExitCode {
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
    if (sub === undefined || sub.startsWith("-")) {
      io.stderr.write("Missing phase name. Usage: gate run <phase>\n");
      return 2;
    }
    io.stderr.write(`run stub (phase: ${sub})\n`);
    return 0;
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

function main(): void {
  const code = runCli(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
