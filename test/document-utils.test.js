const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const {
  findDate,
  getDocumentMetadata,
  normalizeDate,
} = require("../shared/document-utils");

function createDocument(html) {
  return new JSDOM(html).window.document;
}

test("normalizeDate preserves partial ISO dates and normalizes full dates", () => {
  assert.equal(normalizeDate("2024"), "2024");
  assert.equal(normalizeDate("2024-03"), "2024-03");
  assert.equal(normalizeDate("March 21, 2026"), "2026-03-21");
});

test("findDate prefers common metadata tags such as Parsely publish date", () => {
  const doc = createDocument(`
    <!doctype html>
    <html>
      <head>
        <meta name="parsely-pub-date" content="2026-03-18T09:45:00Z" />
      </head>
      <body></body>
    </html>
  `);

  assert.equal(findDate(doc), "2026-03-18");
});

test("findDate extracts datePublished from JSON-LD", () => {
  const doc = createDocument(`
    <!doctype html>
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": "Example post",
            "datePublished": "2026-03-20T14:15:00Z"
          }
        </script>
      </head>
      <body></body>
    </html>
  `);

  assert.equal(findDate(doc), "2026-03-20");
});

test("getDocumentMetadata falls back to visible date elements when metadata is absent", () => {
  const doc = createDocument(`
    <!doctype html>
    <html>
      <head>
        <title>Example article</title>
        <meta name="author" content="Casey" />
      </head>
      <body>
        <article>
          <div class="post-date">March 19, 2026</div>
        </article>
      </body>
    </html>
  `);

  assert.deepEqual(getDocumentMetadata(doc), {
    title: "Example article",
    author: "Casey",
    date: "2026-03-19",
  });
});
