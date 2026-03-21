const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSegments,
  clampQuote,
  normalizeAnnotations,
  rebaseAnnotations,
} = require("../shared/annotation-utils");

test("normalizeAnnotations trims notes, preserves ids, and drops invalid ranges", () => {
  const annotations = normalizeAnnotations("abcdef", [
    { id: "a1", start: 0, end: 3, note: "  first  " },
    { id: "a2", start: 3, end: 3, note: "nope" },
    { id: "a3", start: 1, end: 7, note: "too long" },
    { id: "a4", start: 2, end: 5, note: "   " },
  ]);

  assert.deepEqual(annotations, [
    { id: "a1", start: 0, end: 3, note: "first" },
  ]);
});

test("buildSegments splits overlapping annotations into stable chunks", () => {
  const segments = buildSegments("abcdef", [
    { id: "a1", start: 0, end: 4, note: "left" },
    { id: "a2", start: 2, end: 6, note: "right" },
  ]);

  assert.deepEqual(
    segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      covering: segment.covering.map((annotation) => annotation.id),
    })),
    [
      { start: 0, end: 2, covering: ["a1"] },
      { start: 2, end: 4, covering: ["a1", "a2"] },
      { start: 4, end: 6, covering: ["a2"] },
    ]
  );
});

test("clampQuote condenses whitespace and truncates long selections", () => {
  assert.equal(clampQuote("a   b"), "a b");
  assert.equal(clampQuote("x".repeat(100), 10), "xxxxxxx...");
});

test("rebaseAnnotations shifts later ranges after inserted text", () => {
  const annotations = rebaseAnnotations(
    "Alpha beta gamma",
    "Alpha brave beta gamma",
    [
      { id: "a1", start: 6, end: 10, note: "beta" },
      { id: "a2", start: 11, end: 16, note: "gamma" },
    ],
    { start: 6, previousEnd: 6 }
  );

  assert.deepEqual(annotations, [
    { id: "a1", start: 12, end: 16, note: "beta" },
    { id: "a2", start: 17, end: 22, note: "gamma" },
  ]);
});

test("rebaseAnnotations expands a range when editing inside it", () => {
  const annotations = rebaseAnnotations(
    "Alpha beta gamma",
    "Alpha beXta gamma",
    [{ id: "a1", start: 6, end: 10, note: "beta" }],
    { start: 8, previousEnd: 8 }
  );

  assert.deepEqual(annotations, [
    { id: "a1", start: 6, end: 11, note: "beta" },
  ]);
});

test("rebaseAnnotations drops annotations deleted from the document", () => {
  const annotations = rebaseAnnotations("Alpha beta gamma", "Alpha gamma", [
    { id: "a1", start: 6, end: 10, note: "beta" },
    { id: "a2", start: 11, end: 16, note: "gamma" },
  ]);

  assert.deepEqual(annotations, [
    { id: "a2", start: 6, end: 11, note: "gamma" },
  ]);
});
