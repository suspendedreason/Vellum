const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { chromium } = require("playwright");

const { startServer } = require("../server");

async function startTestServer(options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "vellum-e2e-"));
  const server = startServer({
    host: "127.0.0.1",
    port: 0,
    dataDir,
    accessKey: options.accessKey,
    exitOnError: false,
  });

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  return {
    dataDir,
    server,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

async function withBrowserHarness(t, options = {}) {
  const harness = await startTestServer(options);
  t.after(async () => {
    await new Promise((resolve, reject) => {
      harness.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await fs.rm(harness.dataDir, { recursive: true, force: true });
  });
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
  });

  const page = await browser.newPage();
  return { browser, harness, page };
}

async function skipToWorkspace(page, annotator = "Local Tester") {
  if (await page.getByRole("link", { name: "Create New Annotation" }).count()) {
    await page.getByRole("link", { name: "Create New Annotation" }).click();
  }
  await page.locator("#ingest-annotator").fill(annotator);
  await page.locator("#btn-skip").click();
}

async function selectDocumentRange(page, start, end) {
  await page.locator("#essay-input").evaluate(
    (element, range) => {
      element.focus();
      element.setSelectionRange(range.start, range.end);
      element.dispatchEvent(new Event("select", { bubbles: true }));
    },
    { start, end }
  );
}

async function placeDocumentCaret(page, position) {
  await selectDocumentRange(page, position, position);
}

test("UI can edit an annotation before publish and save the updated bundle", async (t) => {
  const { harness, page } = await withBrowserHarness(t);
  await page.goto(harness.url);

  await skipToWorkspace(page);

  await page.locator("#meta-title").fill("Local Save Check");
  await page.locator("#meta-author").fill("QA");
  await page.locator("#essay-input").fill("Alpha beta gamma");

  await selectDocumentRange(page, 6, 10);

  await page.locator("#note-input").fill("Annotate beta");
  await page.locator("#note-input").click();
  await page.locator("#annotation-preview span.pending-selection").waitFor();
  await page.getByRole("button", { name: "Add annotation" }).click();

  await page.locator("#annotation-preview span[data-annotations]").click();
  await page.locator("[data-annotation-id='a1']").waitFor();
  await expectEditorState(page, "Annotate beta");
  await selectDocumentRange(page, 11, 16);
  await page.locator("#note-input").fill("Annotate gamma");
  await page.getByRole("button", { name: "Save annotation" }).click();
  await page.getByRole("button", { name: "Publish" }).click();

  await page.waitForURL(/\/text\/local-save-check$/);
  await expectSavedBundle(harness.dataDir, "local-save-check", {
    title: "Local Save Check",
    annotator: "Local Tester",
    annotations: [
      {
        start: 11,
        end: 16,
        note: "Annotate gamma",
      },
    ],
  });
});

test("home page links to the create studio and library", async (t) => {
  const { harness, page } = await withBrowserHarness(t);
  await page.goto(harness.url);

  await page.getByRole("link", { name: "Create New Annotation" }).waitFor();
  await page.getByRole("link", { name: "Open Library" }).waitFor();

  await page.getByRole("link", { name: "Open Library" }).click();
  await page.waitForURL(/\/library$/);
  await page.getByRole("heading", { name: "Existing annotations" }).waitFor();

  await page.getByRole("link", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/create$/);
  await page.locator("#ingest-screen").waitFor();
});

test("published documents reopen in the same studio for later annotation edits", async (t) => {
  const { harness, page } = await withBrowserHarness(t);
  await page.goto(harness.url);

  await skipToWorkspace(page);
  await page.locator("#meta-title").fill("Later Edit Check");
  await page.locator("#essay-input").fill("Alpha beta gamma");
  await selectDocumentRange(page, 6, 10);
  await page.locator("#note-input").fill("Annotate beta");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Publish" }).click();

  await page.waitForURL(/\/text\/later-edit-check$/);
  await page.getByRole("link", { name: "Edit annotations" }).click();
  await page.waitForURL(/\/edit\/later-edit-check$/);

  await page
    .getByRole("button", { name: "Edit annotation starting at 6" })
    .click();
  await page.locator("#note-input").fill("Annotate beta revised");
  await page.getByRole("button", { name: "Save annotation" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.waitForURL(/\/text\/later-edit-check$/);
  await expectSavedBundle(harness.dataDir, "later-edit-check", {
    title: "Later Edit Check",
    annotator: "Local Tester",
    annotations: [
      {
        start: 6,
        end: 10,
        note: "Annotate beta revised",
      },
    ],
  });
});

test("published documents can delete annotations from the shared edit form", async (t) => {
  const { harness, page } = await withBrowserHarness(t);
  await page.goto(harness.url);

  await skipToWorkspace(page);
  await page.locator("#meta-title").fill("Delete Check");
  await page.locator("#essay-input").fill("Alpha beta gamma");
  await selectDocumentRange(page, 6, 10);
  await page.locator("#note-input").fill("Delete me");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Publish" }).click();

  await page.waitForURL(/\/text\/delete-check$/);
  await page.getByRole("link", { name: "Edit annotations" }).click();
  await page.waitForURL(/\/edit\/delete-check$/);

  await page.locator("#annotation-preview span[data-annotations]").click();
  await page.getByRole("button", { name: "Delete annotation" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.waitForURL(/\/text\/delete-check$/);
  await expectSavedBundle(harness.dataDir, "delete-check", {
    title: "Delete Check",
    annotator: "Local Tester",
    annotations: [],
  });
});

test("new annotations added from the edit form render hover notes after saving", async (t) => {
  const { harness, page } = await withBrowserHarness(t);
  await page.goto(harness.url);

  await skipToWorkspace(page);
  await page.locator("#meta-title").fill("Hover Check");
  await page.locator("#essay-input").fill("Alpha beta gamma delta");
  await selectDocumentRange(page, 6, 10);
  await page.locator("#note-input").fill("Original beta note");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Publish" }).click();

  await page.waitForURL(/\/text\/hover-check$/);
  await page.getByRole("link", { name: "Edit annotations" }).click();
  await page.waitForURL(/\/edit\/hover-check$/);

  await selectDocumentRange(page, 17, 22);
  await page.locator("#note-input").fill("New delta note");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.waitForURL(/\/text\/hover-check$/);
  const highlight = page.locator("span[data-notes]").last();
  await highlight.hover();
  await page.locator("#tooltip.visible").waitFor();
  const highlightBox = await highlight.boundingBox();
  const tooltipBox = await page.locator("#tooltip").boundingBox();
  assert.ok(highlightBox);
  assert.ok(tooltipBox);
  assert.ok(
    Math.abs((tooltipBox?.y || 0) - (highlightBox?.y || 0)) < 160,
    "tooltip should stay close to the hovered annotation"
  );
  assert.match(
    (await page.locator("#tooltip").textContent()) || "",
    /New delta note/
  );
});

test("published documents expose a standalone html export action", async (t) => {
  const { harness, page } = await withBrowserHarness(t);
  await page.goto(harness.url);

  await skipToWorkspace(page);
  await page.locator("#meta-title").fill("Export Button Check");
  await page.locator("#essay-input").fill("Alpha beta gamma");
  await selectDocumentRange(page, 6, 10);
  await page.locator("#note-input").fill("Exported beta note");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Publish" }).click();

  await page.waitForURL(/\/text\/export-button-check$/);
  await page.getByRole("link", { name: "Home" }).waitFor();
  const exportLink = page.getByRole("link", { name: "Export HTML" });
  await exportLink.waitFor();
  assert.equal(await exportLink.getAttribute("href"), "/export/export-button-check");
  const dataLink = page.getByRole("link", { name: "Export Data" });
  await dataLink.waitFor();
  assert.equal(await dataLink.getAttribute("href"), "/export/export-button-check/data");
});

test("editor can export portable markdown and annotations, then import them back", async (t) => {
  const { page, harness } = await withBrowserHarness(t);
  await page.goto(harness.url);

  await skipToWorkspace(page);
  await page.locator("#meta-title").fill("Portable Draft");
  await page.locator("#meta-author").fill("Casey");
  await page.locator("#meta-annotator").fill("Tester");
  await page.locator("#meta-source").fill("https://example.com/post");
  await page.locator("#essay-input").fill("Alpha beta gamma");
  await selectDocumentRange(page, 6, 10);
  await page.locator("#note-input").fill("beta note");
  await page.getByRole("button", { name: "Add annotation" }).click();

  const markdownExport = await page.locator("#portable-markdown-output").inputValue();
  const annotationsExport = await page
    .locator("#portable-annotations-output")
    .inputValue();

  assert.match(markdownExport, /format: "vellum\.markdown\/v1"/);
  assert.match(markdownExport, /annotations_path: "portable-draft\.annotations\.json"/);
  assert.match(annotationsExport, /"format": "vellum\.annotations\/v1"/);
  assert.match(annotationsExport, /"quote": "beta"/);

  await page.getByRole("button", { name: "Clear" }).click();
  await page.locator("#portable-markdown-input").fill(markdownExport);
  await page.getByRole("button", { name: "Load Markdown", exact: true }).click();

  await assertFieldValue(page, "#meta-title", "Portable Draft");
  await assertFieldValue(page, "#meta-author", "Casey");
  await assertFieldValue(page, "#essay-input", "Alpha beta gamma");
  await page.locator(".annotation-empty").waitFor();

  await page.locator("#portable-annotations-input").fill(annotationsExport);
  await page.getByRole("button", { name: "Merge annotations" }).click();

  await page.locator("[data-annotation-id='a1']").waitFor();
  await page.locator("[data-annotation-id='a1'] .annotation-note").waitFor();
  assert.equal(
    await page.locator("[data-annotation-id='a1'] .annotation-note").textContent(),
    "beta note"
  );
});

test("editor can save to an access-key protected server after entering the key", async (t) => {
  const { page, harness } = await withBrowserHarness(t, {
    accessKey: "friend-key",
  });
  await page.goto(harness.url);

  await page.getByRole("link", { name: "Create New Annotation" }).click();
  await page.locator("#ingest-access-key").fill("friend-key");
  await skipToWorkspace(page);
  await page.locator("#meta-title").fill("Protected Draft");
  await page.locator("#essay-input").fill("Alpha beta gamma");
  await selectDocumentRange(page, 6, 10);
  await page.locator("#note-input").fill("beta note");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Publish" }).click();

  await page.waitForURL(/\/text\/protected-draft$/);
});

test("document edits rebase saved annotation ranges in the live editor", async (t) => {
  const { harness, page } = await withBrowserHarness(t);
  await page.goto(harness.url);

  await skipToWorkspace(page);
  await page.locator("#meta-title").fill("Rebase Check");
  await page.locator("#essay-input").fill("Alpha beta gamma");
  await selectDocumentRange(page, 6, 10);
  await page.locator("#note-input").fill("Track beta");
  await page.getByRole("button", { name: "Add annotation" }).click();

  await placeDocumentCaret(page, 6);
  await page.keyboard.type("brave ");
  await page.locator("[data-annotation-id='a1']").waitFor();
  await page
    .getByRole("button", { name: "Edit annotation starting at 12" })
    .click();
  await page.getByRole("button", { name: "Publish" }).click();

  await page.waitForURL(/\/text\/rebase-check$/);
  await expectSavedBundle(harness.dataDir, "rebase-check", {
    title: "Rebase Check",
    annotator: "Local Tester",
    annotations: [
      {
        start: 12,
        end: 16,
        note: "Track beta",
      },
    ],
  });
});

async function expectSavedBundle(dataDir, slug, expected) {
  const raw = await fs.readFile(
    path.join(dataDir, `${slug}.json`),
    "utf-8"
  );
  const payload = JSON.parse(raw);

  assert.equal(payload.title, expected.title);
  assert.equal(payload.annotator, expected.annotator);
  assert.deepEqual(payload.annotations, expected.annotations);
}

async function expectEditorState(page, expectedNote) {
  await page.locator("#note-input").waitFor();
  assert.equal(await page.locator("#note-input").inputValue(), expectedNote);
  const className = await page
    .locator("[data-annotation-id='a1']")
    .getAttribute("class");
  assert.match(className || "", /\bactive\b/);
}

async function assertFieldValue(page, selector, expected) {
  await page.locator(selector).waitFor();
  assert.equal(await page.locator(selector).inputValue(), expected);
}
