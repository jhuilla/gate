import type { GateHighlight } from "./config.js";

const PAREN_PATTERN =
  /^(.+?)\((\d+),(\d+)\): error TS\d+: (.+)$/;

const COLON_PATTERN =
  /^(.+?):(\d+):(\d+) - error TS\d+: (.+)$/;

export function parseTscHighlights(
  output: string,
  maxHighlights = 20,
): GateHighlight[] {
  const highlights: GateHighlight[] = [];

  if (!output) {
    return highlights;
  }

  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    if (highlights.length >= maxHighlights) {
      break;
    }

    let match = PAREN_PATTERN.exec(line);
    if (!match) {
      match = COLON_PATTERN.exec(line);
    }

    if (!match) {
      continue;
    }

    const [, file, lineStr, colStr, messageRaw] = match;
    const lineNum = Number.parseInt(lineStr, 10);
    const colNum = Number.parseInt(colStr, 10);

    if (!Number.isFinite(lineNum) || !Number.isFinite(colNum)) {
      continue;
    }

    const message = messageRaw.trim();

    highlights.push({
      file,
      line: lineNum,
      col: colNum,
      message,
      tool: "tsc",
    });
  }

  return highlights;
}

