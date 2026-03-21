const test = require("node:test");
const assert = require("node:assert/strict");

const { renderMarkdownWithAnnotations } = require("../shared/markdown-render");

test("renderMarkdownWithAnnotations renders common markdown blocks and inline styles", () => {
  const text = "# Heading\n\nThis is **bold** and [linked](https://example.com).";
  const html = renderMarkdownWithAnnotations(text, [
    { start: 20, end: 24, note: "important" },
  ]);

  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<p>This is <strong><span data-notes=/);
  assert.match(html, /<a href="https:\/\/example\.com">linked<\/a>/);
});

test("renderMarkdownWithAnnotations renders lists and blockquotes", () => {
  const text = "> Quoted\n\n- One\n- Two";
  const html = renderMarkdownWithAnnotations(text, []);

  assert.match(html, /<blockquote><p>Quoted<\/p><\/blockquote>/);
  assert.match(html, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
});
