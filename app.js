const {
  buildSegments,
  clampQuote,
  escapeHtml,
  normalizeAnnotations,
  rebaseAnnotations,
} = window.VellumAnnotationUtils;
const {
  getPortableBaseName,
  parsePortableAnnotations,
  parsePortableMarkdown,
  serializePortableAnnotations,
  serializePortableMarkdown,
} = window.VellumPortableFormat;
const { normalizePublicationDate } = window.VellumPublicationDateUtils;
const { getDocumentMetadata } = window.VellumDocumentUtils;
const ACCESS_KEY_STORAGE_KEY = "vellum.accessKey";

const state = {
  text: "",
  annotations: [],
  selection: { start: null, end: null },
  editingId: null,
  linkedAnnotationIds: [],
  pendingTextEdit: null,
  nextId: 1,
  submissionSlug: null,
};

const elements = {
  input: document.getElementById("essay-input"),
  noteInput: document.getElementById("note-input"),
  rangeStart: document.getElementById("range-start"),
  rangeEnd: document.getElementById("range-end"),
  rangeQuote: document.getElementById("range-quote"),
  selectionInfo: document.getElementById("selection-info"),
  submissionStatus: document.getElementById("submission-status"),
  annotationFormTitle: document.getElementById("annotation-form-title"),
  annotationList: document.getElementById("annotation-list"),
  addButton: document.getElementById("btn-add"),
  deleteAnnotationButton: document.getElementById("btn-delete-annotation"),
  cancelEditButton: document.getElementById("btn-cancel-edit"),
  submitButton: document.getElementById("btn-submit"),
  clearButton: document.getElementById("btn-clear"),
  preview: document.getElementById("annotation-preview"),
  metaTitle: document.getElementById("meta-title"),
  metaAuthor: document.getElementById("meta-author"),
  metaDate: document.getElementById("meta-date"),
  metaAnnotator: document.getElementById("meta-annotator"),
  metaSource: document.getElementById("meta-source"),
  ingestScreen: document.getElementById("ingest-screen"),
  workspace: document.getElementById("workspace"),
  ingestAnnotator: document.getElementById("ingest-annotator"),
  ingestAccessKey: document.getElementById("ingest-access-key"),
  ingestUrl: document.getElementById("ingest-url"),
  ingestHtml: document.getElementById("ingest-html"),
  ingestButton: document.getElementById("btn-ingest"),
  ingestHtmlButton: document.getElementById("btn-ingest-html"),
  ingestSkip: document.getElementById("btn-skip"),
  ingestStatus: document.getElementById("ingest-status"),
  portableStatus: document.getElementById("portable-status"),
  portableMarkdownOutput: document.getElementById("portable-markdown-output"),
  portableMarkdownInput: document.getElementById("portable-markdown-input"),
  portableAnnotationsOutput: document.getElementById(
    "portable-annotations-output"
  ),
  portableAnnotationsInput: document.getElementById("portable-annotations-input"),
  downloadMarkdownButton: document.getElementById("btn-download-markdown"),
  importMarkdownButton: document.getElementById("btn-import-markdown"),
  downloadAnnotationsButton: document.getElementById("btn-download-annotations"),
  mergeAnnotationsButton: document.getElementById("btn-merge-annotations"),
  replaceAnnotationsButton: document.getElementById("btn-replace-annotations"),
  metaAccessKey: document.getElementById("meta-access-key"),
};

function showWorkspace() {
  elements.ingestScreen.classList.add("hidden");
  elements.workspace.classList.remove("hidden");
}

function setIngestStatus(message, tone = "info") {
  elements.ingestStatus.textContent = message;
  elements.ingestStatus.style.color =
    tone === "error" ? "#b6432a" : "var(--muted)";
}

function setSubmissionStatus(message, tone = "info") {
  elements.submissionStatus.textContent = message;
  elements.submissionStatus.style.color =
    tone === "error" ? "#b6432a" : "var(--muted)";
}

function setPortableStatus(message, tone = "info") {
  elements.portableStatus.textContent = message;
  elements.portableStatus.style.color =
    tone === "error" ? "#b6432a" : "var(--muted)";
}

function resetPortableImports() {
  elements.portableMarkdownInput.value = "";
  elements.portableAnnotationsInput.value = "";
}

function getAccessKey() {
  return (
    elements.metaAccessKey.value.trim() || elements.ingestAccessKey.value.trim()
  );
}

function syncAccessKeyInputs(value) {
  if (elements.metaAccessKey.value !== value) {
    elements.metaAccessKey.value = value;
  }
  if (elements.ingestAccessKey.value !== value) {
    elements.ingestAccessKey.value = value;
  }
}

function persistAccessKey(value) {
  try {
    if (value) {
      window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
    }
  } catch (error) {
    // Ignore localStorage failures.
  }
}

function setAccessKey(value) {
  const normalized = String(value || "").trim();
  syncAccessKeyInputs(normalized);
  persistAccessKey(normalized);
}

function restoreAccessKey() {
  try {
    const saved = window.localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || "";
    syncAccessKeyInputs(saved);
  } catch (error) {
    syncAccessKeyInputs("");
  }
}

function normalizeParagraphs(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks = [];
  let buffer = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buffer.length) {
        blocks.push(buffer.join(" "));
        buffer = [];
      }
      return;
    }
    buffer.push(trimmed);
  });

  if (buffer.length) {
    blocks.push(buffer.join(" "));
  }

  return blocks.join("\n\n");
}

function extractMainNode(doc) {
  const selectors = ["article", "main", "[role='main']", "body"];
  const candidates = selectors
    .map((selector) => Array.from(doc.querySelectorAll(selector)))
    .flat()
    .filter(Boolean);

  const scored = candidates.map((node) => ({
    node,
    text: node.innerText || "",
  }));

  scored.sort((left, right) => right.text.length - left.text.length);
  return scored[0]?.node || null;
}

function extractMainText(doc) {
  return extractMainNode(doc)?.innerText || "";
}

function markdownFromNode(node) {
  if (!node) return "";

  const blocks = [];

  const pushBlock = (text) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed) blocks.push(trimmed);
  };

  const renderBlockquote = (element) => {
    const lines = (element.innerText || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `> ${line}`);
    if (lines.length) blocks.push(lines.join("\n"));
  };

  const renderList = (element, ordered) => {
    const items = Array.from(element.children).filter(
      (child) => child.tagName?.toLowerCase() === "li"
    );

    items.forEach((item, index) => {
      const text = (item.innerText || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      const prefix = ordered ? `${index + 1}. ` : "- ";
      blocks.push(`${prefix}${text}`);
    });
  };

  const walk = (element) => {
    if (!element?.tagName) return;
    const tag = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      pushBlock(`${"#".repeat(Number(tag.slice(1)))} ${element.innerText || ""}`);
      return;
    }

    if (tag === "p") {
      pushBlock(element.innerText || "");
      return;
    }

    if (tag === "blockquote") {
      renderBlockquote(element);
      return;
    }

    if (tag === "ul") {
      renderList(element, false);
      return;
    }

    if (tag === "ol") {
      renderList(element, true);
      return;
    }

    Array.from(element.children).forEach((child) => walk(child));
  };

  walk(node);
  return blocks.join("\n\n");
}

function syncSelectionFromInput() {
  const start = elements.input.selectionStart;
  const end = elements.input.selectionEnd;

  state.selection =
    start === end ? { start: null, end: null } : { start, end };
}

function isRangeValid(annotation) {
  return (
    annotation &&
    Number.isInteger(annotation.start) &&
    Number.isInteger(annotation.end) &&
    annotation.start >= 0 &&
    annotation.end > annotation.start &&
    annotation.end <= state.text.length
  );
}

function getAnnotationById(id) {
  return state.annotations.find((annotation) => annotation.id === id) || null;
}

function parseAnnotationIds(value) {
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function setLinkedAnnotationIds(ids = []) {
  const nextIds = Array.from(
    new Set(ids.filter((id) => Boolean(getAnnotationById(id))))
  );
  const changed =
    nextIds.length !== state.linkedAnnotationIds.length ||
    nextIds.some((id, index) => id !== state.linkedAnnotationIds[index]);
  state.linkedAnnotationIds = nextIds;
  return changed;
}

function getHighlightedAnnotationIds() {
  if (state.linkedAnnotationIds.length) {
    return state.linkedAnnotationIds;
  }

  return state.editingId ? [state.editingId] : [];
}

function scrollAnnotationCardIntoView(id, behavior = "smooth") {
  if (!id) return;
  const card = elements.annotationList.querySelector(
    `[data-annotation-id="${id}"]`
  );
  if (!card) return;
  card.scrollIntoView({ behavior, block: "nearest" });
}

function getAnnotationQuote(annotation) {
  if (!annotation) return "";
  if (!isRangeValid(annotation)) return annotation.quote || "";
  return clampQuote(state.text.slice(annotation.start, annotation.end));
}

function parseAnnotationId(value) {
  return Number.parseInt(String(value || "").replace(/^a/, ""), 10);
}

function updateNextId() {
  const maxId = state.annotations.reduce((currentMax, annotation) => {
    const numericId = parseAnnotationId(annotation.id);
    return Number.isFinite(numericId) ? Math.max(currentMax, numericId) : currentMax;
  }, 0);

  state.nextId = maxId + 1;
}

function getPortableDocumentData() {
  return {
    slug: state.submissionSlug || "",
    title: elements.metaTitle.value.trim(),
    author: elements.metaAuthor.value.trim(),
    date: elements.metaDate.value.trim(),
    annotator: elements.metaAnnotator.value.trim(),
    source: elements.metaSource.value.trim(),
    text: state.text,
  };
}

function updatePortableExports() {
  const documentData = getPortableDocumentData();
  elements.portableMarkdownOutput.value = serializePortableMarkdown(documentData);
  elements.portableAnnotationsOutput.value = serializePortableAnnotations(
    documentData,
    state.annotations
  );
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getPortableFilenames() {
  const baseName = getPortableBaseName(getPortableDocumentData());
  return {
    markdown: `${baseName}.md`,
    annotations: `${baseName}.annotations.json`,
  };
}

function doesImportedContextMatch(record) {
  const quote = state.text.slice(record.start, record.end);
  if (record.quote && record.quote !== quote) {
    return false;
  }

  if (record.prefix) {
    const actualPrefix = state.text.slice(
      Math.max(0, record.start - record.prefix.length),
      record.start
    );
    if (actualPrefix !== record.prefix) {
      return false;
    }
  }

  if (record.suffix) {
    const actualSuffix = state.text.slice(
      record.end,
      Math.min(state.text.length, record.end + record.suffix.length)
    );
    if (actualSuffix !== record.suffix) {
      return false;
    }
  }

  return true;
}

function validateImportedAnnotations(records) {
  const valid = [];
  const issues = [];

  records.forEach((record, index) => {
    const label = `Annotation ${index + 1}`;
    const note = typeof record.note === "string" ? record.note.trim() : "";

    if (
      !Number.isInteger(record.start) ||
      !Number.isInteger(record.end) ||
      record.start < 0 ||
      record.end <= record.start ||
      record.end > state.text.length
    ) {
      issues.push(`${label} has an invalid range for the current document.`);
      return;
    }

    if (!note) {
      issues.push(`${label} is missing a note.`);
      return;
    }

    if (!doesImportedContextMatch(record)) {
      issues.push(`${label} does not match the current document text.`);
      return;
    }

    valid.push({
      id: typeof record.id === "string" ? record.id.trim() : "",
      start: record.start,
      end: record.end,
      quote: clampQuote(state.text.slice(record.start, record.end)),
      note,
    });
  });

  return { valid, issues };
}

function reserveGeneratedId(reservedIds) {
  let nextId = `a${state.nextId}`;
  while (reservedIds.has(nextId)) {
    state.nextId += 1;
    nextId = `a${state.nextId}`;
  }
  reservedIds.add(nextId);
  state.nextId += 1;
  return nextId;
}

function mergeImportedAnnotations(records) {
  const merged = state.annotations.map((annotation) => ({ ...annotation }));
  const existingIndexById = new Map(
    merged.map((annotation, index) => [annotation.id, index])
  );
  const reservedIds = new Set(merged.map((annotation) => annotation.id));

  records.forEach((record) => {
    const nextAnnotation = {
      id: record.id || "",
      start: record.start,
      end: record.end,
      quote: record.quote,
      note: record.note,
    };

    if (nextAnnotation.id && existingIndexById.has(nextAnnotation.id)) {
      merged[existingIndexById.get(nextAnnotation.id)] = nextAnnotation;
      return;
    }

    if (!nextAnnotation.id || reservedIds.has(nextAnnotation.id)) {
      nextAnnotation.id = reserveGeneratedId(reservedIds);
    } else {
      reservedIds.add(nextAnnotation.id);
    }

    existingIndexById.set(nextAnnotation.id, merged.length);
    merged.push(nextAnnotation);
  });

  state.annotations = merged;
  updateNextId();
}

function replaceImportedAnnotations(records) {
  const reservedIds = new Set();
  state.annotations = records.map((record) => {
    const annotation = {
      id: record.id || "",
      start: record.start,
      end: record.end,
      quote: record.quote,
      note: record.note,
    };

    if (!annotation.id || reservedIds.has(annotation.id)) {
      annotation.id = reserveGeneratedId(reservedIds);
    } else {
      reservedIds.add(annotation.id);
    }

    return annotation;
  });
  updateNextId();
}

function hydrateAnnotations(text, annotations) {
  return normalizeAnnotations(text, annotations).map((annotation, index) => ({
    id: annotation.id || `a${index + 1}`,
    start: annotation.start,
    end: annotation.end,
    quote: clampQuote(text.slice(annotation.start, annotation.end)),
    note: annotation.note,
  }));
}

function applySubmission(data = {}) {
  state.submissionSlug = data.slug || null;
  state.editingId = null;
  state.pendingTextEdit = null;
  setLinkedAnnotationIds([]);

  elements.metaTitle.value = data.title || "";
  elements.metaAuthor.value = data.author || "";
  elements.metaDate.value = data.date || "";
  elements.metaAnnotator.value = data.annotator || "";
  elements.metaSource.value = data.source || "";
  elements.noteInput.value = "";

  const safeText = typeof data.text === "string" ? data.text : "";
  state.annotations = hydrateAnnotations(safeText, data.annotations || []);
  updateNextId();

  elements.input.value = safeText;
  state.text = safeText;
  resetPortableImports();
  setPortableStatus(
    "Export this draft as Markdown plus a linked annotations sidecar, or import Markdown and annotations back into the editor."
  );
  syncSelectionFromInput();
  renderAll();
  showWorkspace();
}

function getInitialSubmission() {
  return window.__VELLUM_INITIAL_DATA__ || null;
}

async function requestExtract(payload) {
  const headers = { "Content-Type": "application/json" };
  const accessKey = getAccessKey();
  if (accessKey) {
    headers["X-Vellum-Access-Key"] = accessKey;
  }

  const response = await fetch("/extract", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error) {
        message = errorBody.error;
      }
    } catch (error) {
      // Ignore non-JSON error bodies.
    }
    const requestError = new Error(message);
    requestError.status = response.status;
    throw requestError;
  }

  return response.json();
}

function convertHtmlLocally(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const mainNode = extractMainNode(doc);
  const markdown =
    markdownFromNode(mainNode) || normalizeParagraphs(extractMainText(doc) || "");
  const metadata = getDocumentMetadata(doc);

  return {
    markdown,
    ...metadata,
  };
}

function applyExtractResult({ markdown, title, url, annotator, author, date }) {
  state.submissionSlug = null;

  if (annotator) elements.metaAnnotator.value = annotator;
  if (url) elements.metaSource.value = url;
  if (title && !elements.metaTitle.value.trim()) {
    elements.metaTitle.value = title;
  }
  if (author && !elements.metaAuthor.value.trim()) {
    elements.metaAuthor.value = author;
  }
  if (date && !elements.metaDate.value) {
    elements.metaDate.value = date;
  }

  state.annotations = [];
  state.editingId = null;
  state.pendingTextEdit = null;
  setLinkedAnnotationIds([]);
  state.nextId = 1;
  elements.noteInput.value = "";
  elements.input.value = markdown || "";
  updateText();
  resetPortableImports();
  setPortableStatus(
    "Export this draft as Markdown plus a linked annotations sidecar, or import Markdown and annotations back into the editor."
  );
  showWorkspace();
}

function importPortableMarkdown() {
  const raw = elements.portableMarkdownInput.value.trim();

  if (!raw) {
    setPortableStatus("Paste a portable Markdown document first.", "error");
    return;
  }

  try {
    const parsed = parsePortableMarkdown(raw);
    const { document, format } = parsed;

    if (format && format !== "vellum.markdown/v1") {
      throw new Error("Unsupported Markdown format.");
    }

    applySubmission({
      title: document.title,
      author: document.author,
      date: document.date,
      annotator: document.annotator,
      source: document.source,
      text: document.text,
      annotations: [],
    });
    resetPortableImports();
    setPortableStatus(
      "Markdown imported as a new draft. Existing annotations were cleared."
    );
  } catch (error) {
    setPortableStatus(
      "Could not parse that Markdown export. Paste a Vellum Markdown document with YAML frontmatter.",
      "error"
    );
  }
}

function importPortableAnnotations(mode = "merge") {
  const raw = elements.portableAnnotationsInput.value.trim();

  if (!raw) {
    setPortableStatus("Paste annotations JSON first.", "error");
    return;
  }

  if (!state.text) {
    setPortableStatus(
      "Load or import the document text before importing annotations.",
      "error"
    );
    return;
  }

  try {
    const parsed = parsePortableAnnotations(raw);

    if (parsed.format && parsed.format !== "vellum.annotations/v1") {
      throw new Error("Unsupported annotations format.");
    }

    const { valid, issues } = validateImportedAnnotations(parsed.annotations);

    if (!valid.length) {
      setPortableStatus(
        issues[0] ||
          "No valid annotations could be imported for the current document.",
        "error"
      );
      return;
    }

    if (mode === "replace") {
      replaceImportedAnnotations(valid);
    } else {
      mergeImportedAnnotations(valid);
    }

    state.editingId = null;
    setLinkedAnnotationIds([]);
    elements.noteInput.value = "";
    clearSelection();
    renderAll();
    elements.portableAnnotationsInput.value = "";

    const action = mode === "replace" ? "replaced" : "merged";
    const droppedCount = issues.length;
    setPortableStatus(
      droppedCount
        ? `Imported ${valid.length} annotations and ${action} them with the current draft. Dropped ${droppedCount} invalid entries.`
        : `Imported ${valid.length} annotations and ${action} them with the current draft.`
    );
  } catch (error) {
    setPortableStatus(
      "Could not parse that annotations export. Paste a Vellum sidecar, an annotation array, or a single annotation object.",
      "error"
    );
  }
}

function downloadPortableMarkdown() {
  const filenames = getPortableFilenames();
  downloadTextFile(
    filenames.markdown,
    elements.portableMarkdownOutput.value,
    "text/markdown;charset=utf-8"
  );
  setPortableStatus(`Downloaded ${filenames.markdown}.`);
}

function downloadPortableAnnotations() {
  const filenames = getPortableFilenames();
  downloadTextFile(
    filenames.annotations,
    elements.portableAnnotationsOutput.value,
    "application/json;charset=utf-8"
  );
  setPortableStatus(`Downloaded ${filenames.annotations}.`);
}

async function fetchAndConvert() {
  const url = elements.ingestUrl.value.trim();
  const annotator = elements.ingestAnnotator.value.trim();

  if (!url) {
    setIngestStatus("Please paste a URL to fetch.", "error");
    return;
  }

  setIngestStatus("Fetching and converting…");

  try {
    const result = await requestExtract({ url });
    applyExtractResult({
      markdown: result.markdown,
      title: result.title || "Untitled",
      author: result.author,
      date: result.date,
      url,
      annotator,
    });
  } catch (error) {
    if (error?.status === 401) {
      setIngestStatus("This server requires a valid access key.", "error");
      return;
    }
    if (error?.status === 429) {
      setIngestStatus(error.message, "error");
      return;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const html = await response.text();
      const result = convertHtmlLocally(html);

      if (!result.markdown || result.markdown.trim().length < 50) {
        throw new Error("Could not find a readable article body.");
      }

      applyExtractResult({
        markdown: result.markdown,
        title: result.title,
        author: result.author,
        date: result.date,
        url,
        annotator,
      });
    } catch (fallbackError) {
      setIngestStatus(
        "Could not fetch that page in the browser or reach /extract. Many sites block this (CORS). You can still paste source text manually.",
        "error"
      );
    }
  }
}

async function convertHtmlPaste() {
  const html = elements.ingestHtml.value.trim();
  const annotator = elements.ingestAnnotator.value.trim();

  if (!html) {
    setIngestStatus("Paste some HTML to convert.", "error");
    return;
  }

  setIngestStatus("Converting pasted HTML…");

  try {
    const result = await requestExtract({ html });
    applyExtractResult({
      markdown: result.markdown,
      title: result.title || "Untitled",
      author: result.author,
      date: result.date,
      url: "",
      annotator,
    });
  } catch (error) {
    if (error?.status === 401) {
      setIngestStatus("This server requires a valid access key.", "error");
      return;
    }
    if (error?.status === 429) {
      setIngestStatus(error.message, "error");
      return;
    }
    const fallback = convertHtmlLocally(html);
    if (!fallback.markdown || fallback.markdown.trim().length < 20) {
      setIngestStatus(
        "Could not extract readable text from that HTML. You can still paste source text manually.",
        "error"
      );
      return;
    }

    applyExtractResult({
      markdown: fallback.markdown,
      title: fallback.title,
      author: fallback.author,
      date: fallback.date,
      url: "",
      annotator,
    });
  }
}

function updateSelection() {
  syncSelectionFromInput();
  renderSelection();
  renderPreview();
}

function syncPreviewScroll() {
  elements.preview.scrollTop = elements.input.scrollTop;
  elements.preview.scrollLeft = elements.input.scrollLeft;
}

function renderDocumentState() {
  const editingSubmission = Boolean(state.submissionSlug);
  elements.submitButton.textContent = editingSubmission ? "Save changes" : "Publish";
  setSubmissionStatus(
    editingSubmission
      ? "Saving updates this document and every annotation together."
      : "Publishing saves the full document and all annotations."
  );
}

function renderAnnotationEditorState() {
  const editingAnnotation = getAnnotationById(state.editingId);
  elements.annotationFormTitle.textContent = editingAnnotation
    ? "Edit annotation"
    : "New annotation";
  elements.addButton.textContent = editingAnnotation
    ? "Save annotation"
    : "Add annotation";
  elements.deleteAnnotationButton.classList.toggle("hidden", !editingAnnotation);
  elements.cancelEditButton.classList.toggle("hidden", !editingAnnotation);
}

function renderSelection() {
  const { start, end } = state.selection;
  const editingAnnotation = Boolean(getAnnotationById(state.editingId));

  if (start === null || end === null) {
    elements.rangeStart.textContent = "—";
    elements.rangeEnd.textContent = "—";
    elements.rangeQuote.textContent = "No selection yet.";
    elements.selectionInfo.textContent = editingAnnotation
      ? "Select replacement text in the document, then save the annotation."
      : "Select text in the document to create an annotation.";
    elements.addButton.disabled = true;
    return;
  }

  const selected = state.text.slice(start, end);
  elements.rangeStart.textContent = start;
  elements.rangeEnd.textContent = end;
  elements.rangeQuote.textContent =
    clampQuote(selected) || "(selection is whitespace)";
  elements.selectionInfo.textContent = editingAnnotation
    ? `Editing ${end - start} selected characters.`
    : `Selected ${end - start} characters.`;
  elements.addButton.disabled = elements.noteInput.value.trim().length === 0;
}

function updateText() {
  const nextText = elements.input.value || "";
  state.annotations = rebaseAnnotations(
    state.text,
    nextText,
    state.annotations,
    state.pendingTextEdit
  );
  state.pendingTextEdit = null;
  state.text = nextText;
  syncSelectionFromInput();
  renderAll();
}

function clearSelection() {
  state.selection = { start: null, end: null };
  elements.input.focus();
  elements.input.setSelectionRange(0, 0);
  renderSelection();
  renderPreview();
}

function resetAnnotationEditor() {
  state.editingId = null;
  setLinkedAnnotationIds([]);
  elements.noteInput.value = "";
  clearSelection();
}

function startEditingAnnotation(id, options = {}) {
  const annotation = getAnnotationById(id);
  if (!annotation) return;

  const { scrollCard = true, scrollBehavior = "smooth" } = options;

  state.editingId = id;
  setLinkedAnnotationIds([id]);
  elements.noteInput.value = annotation.note;

  if (isRangeValid(annotation)) {
    elements.input.focus();
    elements.input.setSelectionRange(annotation.start, annotation.end);
    syncSelectionFromInput();
  } else {
    state.selection = { start: null, end: null };
    elements.noteInput.focus();
  }

  renderAll();
  if (scrollCard) {
    scrollAnnotationCardIntoView(id, scrollBehavior);
  }
}

function saveAnnotation() {
  const { start, end } = state.selection;
  const note = elements.noteInput.value.trim();

  if (start === null || end === null || start >= end || note.length === 0) {
    return;
  }

  const annotation = {
    id: state.editingId || `a${state.nextId++}`,
    start,
    end,
    quote: clampQuote(state.text.slice(start, end)),
    note,
  };

  const existingIndex = state.annotations.findIndex(
    (item) => item.id === annotation.id
  );

  if (existingIndex === -1) {
    state.annotations.push(annotation);
  } else {
    state.annotations[existingIndex] = annotation;
  }

  resetAnnotationEditor();
  renderAll();
}

function deleteEditingAnnotation() {
  if (!state.editingId) return;

  state.annotations = state.annotations.filter(
    (annotation) => annotation.id !== state.editingId
  );
  resetAnnotationEditor();
  renderAll();
}

function renderAnnotationList() {
  if (!state.annotations.length) {
    elements.annotationList.innerHTML =
      '<div class="annotation-empty">No annotations yet.</div>';
    return;
  }

  const highlightedIds = new Set(getHighlightedAnnotationIds());
  elements.annotationList.innerHTML = state.annotations
    .map((annotation) => {
      const activeClass = annotation.id === state.editingId ? " active" : "";
      const linkedClass = highlightedIds.has(annotation.id) ? " linked" : "";
      const invalidClass = isRangeValid(annotation) ? "" : " invalid";
      const status = isRangeValid(annotation)
        ? `${annotation.start}-${annotation.end}`
        : "Needs reselection after document edits";

      return `
        <article
          class="annotation-card${activeClass}${linkedClass}${invalidClass}"
          data-annotation-id="${escapeHtml(annotation.id)}"
        >
          <div class="annotation-card-header">
            <span class="annotation-offsets">${escapeHtml(status)}</span>
            <button
              class="ghost annotation-edit-button"
              data-action="edit-annotation"
              data-id="${escapeHtml(annotation.id)}"
              aria-label="Edit annotation starting at ${annotation.start}"
            >
              ${annotation.id === state.editingId ? "Editing" : "Edit"}
            </button>
          </div>
          <div class="annotation-quote">${escapeHtml(
            getAnnotationQuote(annotation) || "(selection is whitespace)"
          )}</div>
          <div class="annotation-note">${escapeHtml(annotation.note)}</div>
        </article>
      `;
    })
    .join("");
}

function renderPreview() {
  if (!state.text) {
    elements.preview.textContent = "";
    syncPreviewScroll();
    return;
  }

  const highlightedIds = new Set(getHighlightedAnnotationIds());
  const visibleAnnotations = normalizeAnnotations(state.text, state.annotations);
  const breakpoints = new Set([0, state.text.length]);
  visibleAnnotations.forEach((annotation) => {
    breakpoints.add(annotation.start);
    breakpoints.add(annotation.end);
  });

  if (state.selection.start !== null && state.selection.end !== null) {
    breakpoints.add(state.selection.start);
    breakpoints.add(state.selection.end);
  }

  const points = Array.from(breakpoints).sort((left, right) => left - right);
  const fragments = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === end) continue;

    const chunk = state.text.slice(start, end);
    const covering = visibleAnnotations.filter(
      (annotation) => annotation.start < end && annotation.end > start
    );
    const inSelection =
      state.selection.start !== null &&
      state.selection.end !== null &&
      state.selection.start < end &&
      state.selection.end > start;

    if (!covering.length && !inSelection) {
      fragments.push(escapeHtml(chunk));
      continue;
    }

    const ids = covering.map((annotation) => annotation.id).join(", ");
    const isLinked = covering.some((annotation) => highlightedIds.has(annotation.id));
    const classes = [];

    if (covering.length > 2) {
      classes.push("deep");
    } else if (covering.length > 1) {
      classes.push("stacked");
    }

    if (isLinked) {
      classes.push("linked");
    }

    if (inSelection) {
      classes.push("pending-selection");
    }

    const attributes = [];
    if (ids) {
      attributes.push(`data-annotations="${ids}"`);
    }

    const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
    const dataAttr = attributes.length ? ` ${attributes.join(" ")}` : "";
    fragments.push(
      `<span${dataAttr}${classAttr}>${escapeHtml(chunk)}</span>`
    );
  }

  elements.preview.innerHTML = fragments.join("");
  syncPreviewScroll();
}

function renderAll() {
  renderDocumentState();
  renderAnnotationEditorState();
  renderSelection();
  renderPreview();
  renderAnnotationList();
  updatePortableExports();
}

function serializeSubmission() {
  const normalizedDate = normalizePublicationDate(elements.metaDate.value);
  const payload = {
    title: elements.metaTitle.value.trim(),
    author: elements.metaAuthor.value.trim(),
    date: normalizedDate,
    annotator: elements.metaAnnotator.value.trim(),
    source: elements.metaSource.value.trim(),
    text: state.text,
    annotations: normalizeAnnotations(state.text, state.annotations).map(
      ({ start, end, note }) => ({
        start,
        end,
        note,
      })
    ),
  };

  if (state.submissionSlug) {
    payload.slug = state.submissionSlug;
  }

  return payload;
}

async function submitDocument() {
  if (elements.submitButton.disabled) return;

  if (!state.text.trim()) {
    const originalLabel = state.submissionSlug ? "Save changes" : "Publish";
    elements.submitButton.textContent = "Missing text";
    setSubmissionStatus("Add document text before saving.", "error");
    setTimeout(() => {
      renderDocumentState();
      elements.submitButton.textContent = originalLabel;
    }, 1500);
    return;
  }

  if (
    elements.metaDate.value.trim() &&
    !normalizePublicationDate(elements.metaDate.value)
  ) {
    const originalLabel = state.submissionSlug ? "Save changes" : "Publish";
    elements.submitButton.textContent = "Invalid date";
    setSubmissionStatus(
      "Use YYYY, YYYY-MM, or YYYY-MM-DD for the publication date.",
      "error"
    );
    setTimeout(() => {
      renderDocumentState();
      elements.submitButton.textContent = originalLabel;
    }, 1500);
    return;
  }

  const payload = serializeSubmission();
  const originalLabel = elements.submitButton.textContent;
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = state.submissionSlug
    ? "Saving…"
    : "Publishing…";

  try {
    const headers = { "Content-Type": "application/json" };
    const accessKey = getAccessKey();
    if (accessKey) {
      headers["X-Vellum-Access-Key"] = accessKey;
    }

    const response = await fetch("/submit", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = "Submit failed.";
      try {
        const errorBody = await response.json();
        if (errorBody?.error) {
          message = errorBody.error;
        }
      } catch (error) {
        // Ignore non-JSON error bodies.
      }
      const submitError = new Error(message);
      submitError.status = response.status;
      throw submitError;
    }

    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
    }
  } catch (error) {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = originalLabel;
    if (error?.status === 401) {
      setSubmissionStatus("A valid access key is required to save.", "error");
      return;
    }
    setSubmissionStatus(error.message || "Save failed. Try again.", "error");
  }
}

function bindEvents() {
  [elements.ingestAccessKey, elements.metaAccessKey].forEach((element) => {
    element.addEventListener("input", () => {
      setAccessKey(element.value);
    });
  });
  elements.ingestButton.addEventListener("click", fetchAndConvert);
  elements.ingestHtmlButton.addEventListener("click", convertHtmlPaste);
  elements.ingestSkip.addEventListener("click", () => {
    const annotator = elements.ingestAnnotator.value.trim();
    const url = elements.ingestUrl.value.trim();
    if (annotator) elements.metaAnnotator.value = annotator;
    if (url) elements.metaSource.value = url;
    showWorkspace();
    renderAll();
  });

  [
    elements.metaTitle,
    elements.metaAuthor,
    elements.metaDate,
    elements.metaAnnotator,
    elements.metaSource,
  ].forEach((element) => {
    element.addEventListener("input", updatePortableExports);
  });

  elements.input.addEventListener("beforeinput", () => {
    state.pendingTextEdit = {
      start: elements.input.selectionStart,
      previousEnd: elements.input.selectionEnd,
    };
  });
  elements.input.addEventListener("input", updateText);
  elements.input.addEventListener("scroll", syncPreviewScroll);
  ["mouseup", "keyup", "select"].forEach((eventName) => {
    elements.input.addEventListener(eventName, updateSelection);
  });

  elements.noteInput.addEventListener("input", () => {
    elements.addButton.disabled =
      elements.noteInput.value.trim().length === 0 ||
      state.selection.start === null ||
      state.selection.end === null;
  });

  elements.annotationList.addEventListener("click", (event) => {
    const trigger = event.target.closest("button[data-action='edit-annotation']");
    if (trigger) {
      startEditingAnnotation(trigger.dataset.id);
      return;
    }

    const card = event.target.closest("[data-annotation-id]");
    if (!card) return;
    startEditingAnnotation(card.dataset.annotationId);
  });

  elements.annotationList.addEventListener("mouseover", (event) => {
    const card = event.target.closest("[data-annotation-id]");
    if (!card) return;
    if (setLinkedAnnotationIds([card.dataset.annotationId])) {
      renderAll();
    }
  });

  elements.annotationList.addEventListener("mouseout", (event) => {
    const card = event.target.closest("[data-annotation-id]");
    if (!card || card.contains(event.relatedTarget)) return;
    if (setLinkedAnnotationIds(state.editingId ? [state.editingId] : [])) {
      renderAll();
    }
  });

  elements.preview.addEventListener("click", (event) => {
    const span = event.target.closest("span[data-annotations]");
    if (!span) return;
    const ids = parseAnnotationIds(span.dataset.annotations);

    if (!ids.length) return;
    if (ids.length === 1) {
      startEditingAnnotation(ids[0]);
      return;
    }

    if (setLinkedAnnotationIds(ids)) {
      renderAll();
    }
    scrollAnnotationCardIntoView(ids[0]);
  });

  elements.preview.addEventListener("mouseover", (event) => {
    const span = event.target.closest("span[data-annotations]");
    if (!span) return;
    if (
      setLinkedAnnotationIds(parseAnnotationIds(span.dataset.annotations))
    ) {
      renderAll();
    }
  });

  elements.preview.addEventListener("mouseout", (event) => {
    const span = event.target.closest("span[data-annotations]");
    if (!span || span.contains(event.relatedTarget)) return;
    if (setLinkedAnnotationIds(state.editingId ? [state.editingId] : [])) {
      renderAll();
    }
  });

  elements.addButton.addEventListener("click", saveAnnotation);
  elements.deleteAnnotationButton.addEventListener("click", deleteEditingAnnotation);
  elements.cancelEditButton.addEventListener("click", () => {
    resetAnnotationEditor();
    renderAll();
  });
  elements.clearButton.addEventListener("click", () => {
    elements.input.value = "";
    state.annotations = [];
    state.editingId = null;
    setLinkedAnnotationIds([]);
    state.pendingTextEdit = null;
    state.nextId = 1;
    elements.noteInput.value = "";
    resetPortableImports();
    setPortableStatus(
      "Export this draft as Markdown plus a linked annotations sidecar, or import Markdown and annotations back into the editor."
    );
    updateText();
  });
  elements.downloadMarkdownButton.addEventListener("click", downloadPortableMarkdown);
  elements.importMarkdownButton.addEventListener("click", importPortableMarkdown);
  elements.downloadAnnotationsButton.addEventListener(
    "click",
    downloadPortableAnnotations
  );
  elements.mergeAnnotationsButton.addEventListener("click", () => {
    importPortableAnnotations("merge");
  });
  elements.replaceAnnotationsButton.addEventListener("click", () => {
    importPortableAnnotations("replace");
  });
  elements.submitButton.addEventListener("click", submitDocument);
}

function initialize() {
  restoreAccessKey();
  const initialSubmission = getInitialSubmission();
  if (initialSubmission) {
    applySubmission(initialSubmission);
    return;
  }

  renderAll();
}

bindEvents();
initialize();
