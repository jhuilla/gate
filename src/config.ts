import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export type GateStatus = "pass" | "fail" | "skip";

export interface GateHighlight {
  file: string;
  line: number;
  col: number;
  message: string;
  tool: "tsc";
}

export interface GateResultConfig {
  name: string;
  status: GateStatus;
  command: string;
  exitCode: number | null;
  durationMs: number;
  reason?: string;
  highlights: GateHighlight[];
  logTail: string;
}

export interface GateDefinition {
  command: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface GateOptions {
  logTailLines?: number;
  stopOnFirstFailure?: boolean;
}

export interface GateConfig {
  version: 1;
  phases: Record<string, string[]>;
  gates: Record<string, GateDefinition>;
  options?: GateOptions;
}

export class ConfigError extends Error {
  readonly exitCode = 2 as const;

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const gateDefinitionSchema = z.object({
  command: z.string().min(1, "gate command must be a non-empty string"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional(),
  cwd: z.string().min(1).optional(),
  env: z.record(z.string()).optional(),
});

const gateOptionsSchema = z
  .object({
    logTailLines: z
      .number()
      .int()
      .positive()
      .optional(),
    stopOnFirstFailure: z.boolean().optional(),
  })
  .optional();

const gateConfigSchema = z.object({
  version: z.literal(1),
  phases: z
    .record(z.array(z.string().min(1)).nonempty("phase must contain at least one gate"))
    .refine((o) => Object.keys(o).length > 0, { message: "phases must define at least one phase" }),
  gates: z
    .record(gateDefinitionSchema)
    .refine((o) => Object.keys(o).length > 0, { message: "gates must define at least one gate" }),
  options: gateOptionsSchema,
});

export function loadConfig(configPath?: string): GateConfig {
  const path = configPath ?? resolve(process.cwd(), "gate.config.yml");

  let fileContents: string;
  try {
    fileContents = readFileSync(path, "utf8");
  } catch (err: unknown) {
    const e = err as Error;
    throw new ConfigError(
      `Failed to read config file at '${path}': ${e.message}`,
    );
  }

  let raw: unknown;
  try {
    raw = parseYaml(fileContents);
  } catch (err: unknown) {
    const e = err as Error;
    throw new ConfigError(
      `Failed to parse YAML in '${path}': ${e.message}`,
    );
  }

  try {
    return gateConfigSchema.parse(raw) as GateConfig;
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      const pathStr = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      throw new ConfigError(
        `Invalid gate.config.yml at ${pathStr}: ${issue.message}`,
      );
    }

    const e = err as Error;
    throw new ConfigError(
      `Unknown error validating config: ${e.message}`,
    );
  }
}

