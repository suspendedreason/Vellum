const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parsePortableAnnotations,
  parsePortableMarkdown,
  serializePortableAnnotations,
  serializePortableMarkdown,
} = require("../shared/portable-format");

test("portable markdown serializes metadata into YAML frontmatter", () => {
  const markdown = serializePortableMarkdown({
    title: "Essay: Draft",
    author: "Casey",
    date: "2026-03-21",
    annotator: "Tester",
    source: "https://example.com/post",
    text: "# Hello\n\nWorld",
  });

  assert.match(markdown, /^---\n/);
  assert.match(markdown, /format: "vellum\.markdown\/v1"/);
  assert.match(markdown, /annotations_path: "essay-draft\.annotations\.json"/);
  assert.match(markdown, /title: "Essay: Draft"/);
  assert.match(markdown, /source: "https:\/\/example\.com\/post"/);
  assert.match(markdown, /\n\n# Hello\n\nWorld$/);

  const parsed = parsePortableMarkdown(markdown);
  assert.equal(parsed.format, "vellum.markdown/v1");
  assert.equal(parsed.annotationsPath, "essay-draft.annotations.json");
  assert.deepEqual(parsed.document, {
    title: "Essay: Draft",
    author: "Casey",
    date: "2026-03-21",
    annotator: "Tester",
    source: "https://example.com/post",
    text: "# Hello\n\nWorld",
  });
});

test("portable annotations serialize as a linked sidecar with context", () => {
  const raw = serializePortableAnnotations(
    {
      title: "Essay Draft",
      text: "Alpha beta gamma",
    },
    [{ id: "a1", start: 6, end: 10, note: "beta note" }]
  );

  const parsed = parsePortableAnnotations(raw);
  assert.equal(parsed.format, "vellum.annotations/v1");
  assert.equal(parsed.markdownPath, "essay-draft.md");
  assert.equal(parsed.textLength, 16);
  assert.deepEqual(parsed.annotations, [
    {
      id: "a1",
      start: 6,
      end: 10,
      quote: "beta",
      prefix: "Alpha ",
      suffix: " gamma",
      note: "beta note",
    },
  ]);
});

test("portable annotations parser accepts a single annotation object", () => {
  const parsed = parsePortableAnnotations(
    JSON.stringify({
      start: 0,
      end: 5,
      note: "alpha",
    })
  );

  assert.deepEqual(parsed.annotations, [
    {
      start: 0,
      end: 5,
      note: "alpha",
      quote: "",
      prefix: "",
      suffix: "",
    },
  ]);
});
