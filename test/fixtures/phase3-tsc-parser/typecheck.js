console.error(
  "src/foo.ts(42,13): error TS2345: Type 'X' is not assignable to type 'Y'.",
);
console.error(
  "src/foo.ts(51,5): error TS2339: Property 'bar' does not exist on type 'Baz'.",
);
console.error(
  "src/foo.ts(60,1): error TS1005: ';' expected.",
);
console.error(
  "  This is additional context that should not be parsed as its own error.",
);

process.exit(1);

