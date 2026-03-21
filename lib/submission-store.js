const fs = require("fs/promises");
const path = require("path");

const { normalizeAnnotations } = require("../shared/annotation-utils");
const { normalizePublicationDate } = require("../shared/publication-date");

function slugify(value) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80) || "untitled"
  );
}

async function ensureDataDir(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
}

async function generateUniqueSlug(baseSlug, dataDir) {
  let slug = baseSlug;
  let counter = 2;

  while (true) {
    try {
      await fs.access(path.join(dataDir, `${slug}.json`));
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    } catch (error) {
      return slug;
    }
  }
}

async function saveSubmission(dataDir, submission) {
  const safeText = typeof submission.text === "string" ? submission.text : "";
  const safeAnnotations = normalizeAnnotations(safeText, submission.annotations);

  await ensureDataDir(dataDir);

  const baseSlug = slugify(submission.title || "untitled");
  const slug = await generateUniqueSlug(baseSlug, dataDir);
  const payload = {
    title: submission.title || "Untitled",
    author: submission.author || "",
    date: normalizePublicationDate(submission.date) || "",
    annotator: submission.annotator || "",
    source: submission.source || "",
    text: safeText,
    annotations: safeAnnotations.map(({ start, end, note }) => ({
      start,
      end,
      note,
    })),
    createdAt: new Date().toISOString(),
    slug,
  };

  await fs.writeFile(
    path.join(dataDir, `${slug}.json`),
    JSON.stringify(payload, null, 2),
    "utf-8"
  );

  return payload;
}

async function updateSubmission(dataDir, slug, submission) {
  const existing = await readSubmission(dataDir, slug);
  const safeText = typeof submission.text === "string" ? submission.text : "";
  const safeAnnotations = normalizeAnnotations(safeText, submission.annotations);
  const payload = {
    title: submission.title || "Untitled",
    author: submission.author || "",
    date: normalizePublicationDate(submission.date) || "",
    annotator: submission.annotator || "",
    source: submission.source || "",
    text: safeText,
    annotations: safeAnnotations.map(({ start, end, note }) => ({
      start,
      end,
      note,
    })),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slug,
  };

  await ensureDataDir(dataDir);
  await fs.writeFile(
    path.join(dataDir, `${slug}.json`),
    JSON.stringify(payload, null, 2),
    "utf-8"
  );

  return payload;
}

async function readSubmission(dataDir, slug) {
  const raw = await fs.readFile(path.join(dataDir, `${slug}.json`), "utf-8");
  return JSON.parse(raw);
}

async function listSubmissions(dataDir) {
  await ensureDataDir(dataDir);
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);

  const submissions = await Promise.all(
    jsonFiles.map(async (filename) => {
      const raw = await fs.readFile(path.join(dataDir, filename), "utf-8");
      const submission = JSON.parse(raw);
      const annotations = Array.isArray(submission.annotations)
        ? submission.annotations
        : [];
      return {
        slug: submission.slug || filename.replace(/\.json$/i, ""),
        title: submission.title || "Untitled",
        author: submission.author || "",
        annotator: submission.annotator || "",
        date: submission.date || "",
        source: submission.source || "",
        annotationCount: annotations.length,
        createdAt: submission.createdAt || "",
        updatedAt: submission.updatedAt || "",
      };
    })
  );

  submissions.sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt || "") || 0;
    const rightTime = Date.parse(right.updatedAt || right.createdAt || "") || 0;
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title);
  });

  return submissions;
}

module.exports = {
  listSubmissions,
  readSubmission,
  saveSubmission,
  updateSubmission,
  slugify,
};
