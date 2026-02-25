import { describe, it, expect } from "vitest";
import { parseTscHighlights } from "../src/parse";

describe("tsc parser", () => {
  it("parses representative tsc error output into highlights", () => {
    const output = [
      "src/foo.ts(42,13): error TS2345: Type 'X' is not assignable to type 'Y'.",
      "src/bar.ts(10,5): error TS2339: Property 'baz' does not exist on type 'Qux'.",
    ].join("\n");

    const highlights = parseTscHighlights(output);

    expect(highlights).toHaveLength(2);

    expect(highlights[0]).toEqual({
      file: "src/foo.ts",
      line: 42,
      col: 13,
      message: "Type 'X' is not assignable to type 'Y'.",
      tool: "tsc",
    });

    expect(highlights[1]).toEqual({
      file: "src/bar.ts",
      line: 10,
      col: 5,
      message: "Property 'baz' does not exist on type 'Qux'.",
      tool: "tsc",
    });
  });

  it("treats multi-line errors as a single highlight using only the first line", () => {
    const output = [
      "src/foo.ts(1,1): error TS1005: ';' expected.",
      "  This is additional context that should not become its own highlight.",
      "src/foo.ts(2,3): error TS2588: Cannot assign to 'x' because it is a constant.",
      "  More context that should be ignored for parsing purposes.",
    ].join("\n");

    const highlights = parseTscHighlights(output);

    expect(highlights).toHaveLength(2);
    expect(highlights[0]).toMatchObject({
      file: "src/foo.ts",
      line: 1,
      col: 1,
      message: "';' expected.",
    });
    expect(highlights[1]).toMatchObject({
      file: "src/foo.ts",
      line: 2,
      col: 3,
      message: "Cannot assign to 'x' because it is a constant.",
    });
  });

  it("caps the number of highlights at 20", () => {
    const lines: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const lineNum = i + 1;
      lines.push(
        `src/foo.ts(${lineNum},1): error TS1005: ';' expected on line ${lineNum}.`,
      );
    }

    const output = lines.join("\n");
    const highlights = parseTscHighlights(output);

    expect(highlights).toHaveLength(20);
    expect(highlights[0]).toMatchObject({ line: 1 });
    expect(highlights[19]).toMatchObject({ line: 20 });
  });

  it("supports the alternative colon tsc format", () => {
    const output =
      "src/foo.ts:42:13 - error TS2345: Type 'X' is not assignable to type 'Y'.";

    const highlights = parseTscHighlights(output);

    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toEqual({
      file: "src/foo.ts",
      line: 42,
      col: 13,
      message: "Type 'X' is not assignable to type 'Y'.",
      tool: "tsc",
    });
  });
});

