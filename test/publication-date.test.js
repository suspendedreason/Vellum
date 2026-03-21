const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePublicationDate,
} = require("../shared/publication-date");

test("normalizePublicationDate accepts partial ISO dates", () => {
  assert.equal(normalizePublicationDate("2024"), "2024");
  assert.equal(normalizePublicationDate("2024-03"), "2024-03");
  assert.equal(normalizePublicationDate("2024-03-11"), "2024-03-11");
});

test("normalizePublicationDate normalizes parseable full dates and rejects invalid partials", () => {
  assert.equal(
    normalizePublicationDate("March 11, 2024"),
    "2024-03-11"
  );
  assert.equal(normalizePublicationDate("2024-13"), "");
  assert.equal(normalizePublicationDate("2024-02-31"), "");
});
