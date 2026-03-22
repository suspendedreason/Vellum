const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { startServer } = require("../server");

async function withServer(run) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "vellum-test-"));
  const server = startServer({
    host: "127.0.0.1",
    port: 0,
    dataDir,
    exitOnError: false,
  });

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, dataDir });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

test("submit saves sanitized annotations as JSON and renders the publication", async () => {
  await withServer(async ({ baseUrl, dataDir }) => {
    const submission = {
      title: "Audit Essay",
      author: "Casey",
      annotator: "Tester",
      source: "https://example.com/post",
      text: "## Section\n\nAlpha **beta** gamma",
      annotations: [
        { start: 20, end: 24, note: "  opening  ", ignored: true },
        { start: 6, end: 99, note: "bad range" },
      ],
    };

    const response = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.url, "/text/audit-essay");

    const saved = JSON.parse(
      await fs.readFile(path.join(dataDir, "audit-essay.json"), "utf-8")
    );

    assert.equal(saved.title, "Audit Essay");
    assert.deepEqual(saved.annotations, [
      { start: 20, end: 24, note: "opening" },
    ]);

    const publicationResponse = await fetch(`${baseUrl}${body.url}`);
    assert.equal(publicationResponse.status, 200);

    const html = await publicationResponse.text();
    assert.match(html, /Audit Essay/);
    assert.match(html, /<h2>Section<\/h2>/);
    assert.match(html, /<strong><span data-notes=/);
    assert.match(html, /data-notes=/);
    assert.match(html, /opening/);
    assert.match(html, /href="\/edit\/audit-essay"/);
    assert.match(html, /href="\/export\/audit-essay\/data"/);
  });
});

test("home page and library page render expected navigation", async () => {
  await withServer(async ({ baseUrl }) => {
    const homeResponse = await fetch(baseUrl);
    assert.equal(homeResponse.status, 200);
    const homeHtml = await homeResponse.text();
    assert.match(homeHtml, /Create New Annotation/);
    assert.match(homeHtml, /Open Library/);
    assert.match(homeHtml, /href="\/create"/);
    assert.match(homeHtml, /href="\/library"/);

    const libraryResponse = await fetch(`${baseUrl}/library`);
    assert.equal(libraryResponse.status, 200);
    const libraryHtml = await libraryResponse.text();
    assert.match(libraryHtml, /Existing annotations/);
  });
});

test("health endpoint responds and saved data files are not publicly exposed", async () => {
  await withServer(async ({ baseUrl, dataDir }) => {
    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true });

    const submitResponse = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Hidden Data Essay",
        text: "Alpha beta gamma",
        annotations: [],
      }),
    });

    assert.equal(submitResponse.status, 200);
    await fs.access(path.join(dataDir, "hidden-data-essay.json"));

    const rawDataResponse = await fetch(`${baseUrl}/data/hidden-data-essay.json`);
    assert.equal(rawDataResponse.status, 404);

    const sourceResponse = await fetch(`${baseUrl}/server.js`);
    assert.equal(sourceResponse.status, 404);
  });
});

test("submit preserves partial publication dates", async () => {
  await withServer(async ({ baseUrl, dataDir }) => {
    const response = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Partial Date Essay",
        date: "2024-03",
        text: "Alpha beta gamma",
        annotations: [],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, "/text/partial-date-essay");

    const saved = JSON.parse(
      await fs.readFile(path.join(dataDir, "partial-date-essay.json"), "utf-8")
    );
    assert.equal(saved.date, "2024-03");

    const publicationResponse = await fetch(`${baseUrl}/text/partial-date-essay`);
    assert.equal(publicationResponse.status, 200);
    const html = await publicationResponse.text();
    assert.match(html, /<strong>Date<\/strong> 2024-03/);
  });
});

test("duplicate titles receive incremented slugs", async () => {
  await withServer(async ({ baseUrl, dataDir }) => {
    const payload = {
      title: "Same Title",
      text: "Alpha beta gamma",
      annotations: [],
    };

    const first = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const second = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    assert.equal((await first.json()).url, "/text/same-title");
    assert.equal((await second.json()).url, "/text/same-title-2");

    await fs.access(path.join(dataDir, "same-title.json"));
    await fs.access(path.join(dataDir, "same-title-2.json"));
  });
});

test("edit route bootstraps an existing submission and submit updates the same slug", async () => {
  await withServer(async ({ baseUrl, dataDir }) => {
    const createResponse = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Editable Essay",
        text: "Alpha beta gamma",
        annotations: [{ start: 6, end: 10, note: "beta" }],
      }),
    });

    assert.equal(createResponse.status, 200);
    assert.equal((await createResponse.json()).url, "/text/editable-essay");

    const editPage = await fetch(`${baseUrl}/edit/editable-essay`);
    assert.equal(editPage.status, 200);
    const editHtml = await editPage.text();
    assert.match(editHtml, /window\.__VELLUM_INITIAL_DATA__/);
    assert.match(editHtml, /"slug":"editable-essay"/);
    assert.match(editHtml, /"note":"beta"/);

    const updateResponse = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "editable-essay",
        title: "Editable Essay Revised",
        text: "Alpha beta gamma delta",
        annotations: [{ start: 17, end: 22, note: "delta" }],
      }),
    });

    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).url, "/text/editable-essay");

    const saved = JSON.parse(
      await fs.readFile(path.join(dataDir, "editable-essay.json"), "utf-8")
    );
    assert.equal(saved.title, "Editable Essay Revised");
    assert.equal(saved.slug, "editable-essay");
    assert.deepEqual(saved.annotations, [
      { start: 17, end: 22, note: "delta" },
    ]);
    assert.ok(saved.updatedAt);
  });
});

test("library page lists saved submissions", async () => {
  await withServer(async ({ baseUrl }) => {
    const createResponse = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Library Essay",
        annotator: "Tester",
        text: "Alpha beta gamma",
        annotations: [{ start: 6, end: 10, note: "beta" }],
      }),
    });

    assert.equal(createResponse.status, 200);

    const libraryResponse = await fetch(`${baseUrl}/library`);
    assert.equal(libraryResponse.status, 200);
    const html = await libraryResponse.text();
    assert.match(html, /Library Essay/);
    assert.match(html, /Annotations<\/strong> 1/);
    assert.match(html, /href="\/text\/library-essay"/);
    assert.match(html, /href="\/edit\/library-essay"/);
  });
});

test("export route downloads a standalone read-only html page", async () => {
  await withServer(async ({ baseUrl }) => {
    const createResponse = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Exportable Essay",
        text: "Alpha beta gamma",
        annotations: [{ start: 6, end: 10, note: "beta note" }],
      }),
    });

    assert.equal(createResponse.status, 200);
    assert.equal((await createResponse.json()).url, "/text/exportable-essay");

    const exportResponse = await fetch(`${baseUrl}/export/exportable-essay`);
    assert.equal(exportResponse.status, 200);
    assert.match(
      exportResponse.headers.get("content-type") || "",
      /^text\/html;/
    );
    assert.match(
      exportResponse.headers.get("content-disposition") || "",
      /attachment; filename="exportable-essay\.html"/
    );

    const html = await exportResponse.text();
    assert.match(html, /Exportable Essay/);
    assert.match(html, /data-notes=/);
    assert.match(html, /beta%20note/);
    assert.match(html, /function show\(target\)/);
    assert.doesNotMatch(html, /Edit annotations/);
    assert.doesNotMatch(html, /Export HTML/);
    assert.doesNotMatch(html, /<link rel="stylesheet"/);
    assert.doesNotMatch(html, /<script defer src=/);
  });
});

test("publication page shows a compact source preview instead of the full raw URL", async () => {
  await withServer(async ({ baseUrl }) => {
    const createResponse = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Source Preview Essay",
        source:
          "https://www.example.com/blog/2026/03/annotated-essay-about-things?utm_source=test",
        text: "Alpha beta gamma",
        annotations: [],
      }),
    });

    assert.equal(createResponse.status, 200);
    assert.equal((await createResponse.json()).url, "/text/source-preview-essay");

    const pageResponse = await fetch(`${baseUrl}/text/source-preview-essay`);
    assert.equal(pageResponse.status, 200);
    const html = await pageResponse.text();
    assert.match(html, /<strong>Source<\/strong> <a href="https:\/\/www\.example\.com\/blog\/2026\/03\/annotated-essay-about-things\?utm_source=test"/);
    assert.match(html, />example\.com\/blog\/2026\/03\/annotated-[^<]*\.\.\.<\/a>/);
  });
});

test("portable export routes download Markdown and annotations sidecar files", async () => {
  await withServer(async ({ baseUrl }) => {
    const createResponse = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Portable Essay",
        author: "Casey",
        annotator: "Tester",
        source: "https://example.com/post",
        text: "Alpha beta gamma",
        annotations: [{ start: 6, end: 10, note: "beta note" }],
      }),
    });

    assert.equal(createResponse.status, 200);
    assert.equal((await createResponse.json()).url, "/text/portable-essay");

    const markdownResponse = await fetch(`${baseUrl}/export/portable-essay/markdown`);
    assert.equal(markdownResponse.status, 200);
    assert.match(
      markdownResponse.headers.get("content-type") || "",
      /^text\/markdown;/
    );
    assert.match(
      markdownResponse.headers.get("content-disposition") || "",
      /attachment; filename="portable-essay\.md"/
    );
    const markdown = await markdownResponse.text();
    assert.match(markdown, /format: "vellum\.markdown\/v1"/);
    assert.match(markdown, /annotations_path: "portable-essay\.annotations\.json"/);
    assert.match(markdown, /title: "Portable Essay"/);
    assert.match(markdown, /\n\nAlpha beta gamma$/);

    const annotationsResponse = await fetch(
      `${baseUrl}/export/portable-essay/annotations`
    );
    assert.equal(annotationsResponse.status, 200);
    assert.match(
      annotationsResponse.headers.get("content-type") || "",
      /^application\/json;/
    );
    assert.match(
      annotationsResponse.headers.get("content-disposition") || "",
      /attachment; filename="portable-essay\.annotations\.json"/
    );
    const annotations = JSON.parse(await annotationsResponse.text());
    assert.equal(annotations.format, "vellum.annotations/v1");
    assert.equal(annotations.markdown_path, "portable-essay.md");
    assert.deepEqual(annotations.annotations, [
      {
        start: 6,
        end: 10,
        quote: "beta",
        prefix: "Alpha ",
        suffix: " gamma",
        note: "beta note",
      },
    ]);
  });
});

test("export data route downloads a zip containing Markdown and annotations JSON", async () => {
  await withServer(async ({ baseUrl }) => {
    const createResponse = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Bundle Essay",
        text: "Alpha beta gamma",
        annotations: [{ start: 6, end: 10, note: "beta note" }],
      }),
    });

    assert.equal(createResponse.status, 200);
    assert.equal((await createResponse.json()).url, "/text/bundle-essay");

    const exportResponse = await fetch(`${baseUrl}/export/bundle-essay/data`);
    assert.equal(exportResponse.status, 200);
    assert.match(
      exportResponse.headers.get("content-type") || "",
      /^application\/zip/
    );
    assert.match(
      exportResponse.headers.get("content-disposition") || "",
      /attachment; filename="bundle-essay-data\.zip"/
    );

    const zipBuffer = Buffer.from(await exportResponse.arrayBuffer());
    const zipText = zipBuffer.toString("utf-8");
    assert.match(zipText, /bundle-essay\.md/);
    assert.match(zipText, /bundle-essay\.annotations\.json/);
    assert.match(zipText, /vellum\.markdown\/v1/);
    assert.match(zipText, /vellum\.annotations\/v1/);
  });
});

test("write routes can require an access key", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "vellum-auth-"));
  const server = startServer({
    host: "127.0.0.1",
    port: 0,
    dataDir,
    accessKey: "friend-key",
    exitOnError: false,
  });

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const denied = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Protected Essay",
        text: "Alpha beta gamma",
        annotations: [],
      }),
    });

    assert.equal(denied.status, 401);
    assert.match(await denied.text(), /valid access key/i);

    const allowed = await fetch(`${baseUrl}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vellum-Access-Key": "friend-key",
      },
      body: JSON.stringify({
        title: "Protected Essay",
        text: "Alpha beta gamma",
        annotations: [],
      }),
    });

    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).url, "/text/protected-essay");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
