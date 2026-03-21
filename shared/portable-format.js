(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./annotation-utils"));
    return;
  }

  root.VellumPortableFormat = factory(root.VellumAnnotationUtils);
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  annotationUtils
) {
  const { normalizeAnnotations } = annotationUtils || {};

  const PORTABLE_MARKDOWN_FORMAT = "vellum.markdown/v1";
  const PORTABLE_ANNOTATIONS_FORMAT = "vellum.annotations/v1";
  const DEFAULT_CONTEXT_LEN = 40;

  function slugifyFilename(value) {
    return (
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "")
        .slice(0, 80) || "untitled"
    );
  }

  function quoteYamlValue(value) {
    return JSON.stringify(String(value || ""));
  }

  function serializeFrontmatter(fields) {
    const lines = ["---"];

    Object.entries(fields).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      lines.push(`${key}: ${quoteYamlValue(value)}`);
    });

    lines.push("---");
    return lines.join("\n");
  }

  function parseFrontmatterValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (raw.startsWith('"')) {
      try {
        return JSON.parse(raw);
      } catch (error) {
        return raw.slice(1, raw.endsWith('"') ? -1 : undefined);
      }
    }

    if (raw.startsWith("'") && raw.endsWith("'")) {
      return raw.slice(1, -1).replace(/\\'/g, "'");
    }

    return raw;
  }

  function splitFrontmatter(markdown) {
    const normalized = String(markdown || "").replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");

    if (lines[0] !== "---") {
      return {
        frontmatter: {},
        text: normalized,
      };
    }

    const closingIndex = lines.findIndex(
      (line, index) => index > 0 && line.trim() === "---"
    );

    if (closingIndex === -1) {
      return {
        frontmatter: {},
        text: normalized,
      };
    }

    const frontmatter = {};
    lines.slice(1, closingIndex).forEach((line) => {
      const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
      if (!match) return;
      frontmatter[match[1]] = parseFrontmatterValue(match[2] || "");
    });

    const body = lines.slice(closingIndex + 1).join("\n");

    return {
      frontmatter,
      text: body.replace(/^\n/, ""),
    };
  }

  function getPortableBaseName(documentData = {}, options = {}) {
    return slugifyFilename(
      options.baseName ||
        documentData.slug ||
        documentData.title ||
        documentData.markdown_path ||
        "untitled"
    );
  }

  function serializePortableMarkdown(documentData = {}, options = {}) {
    const baseName = getPortableBaseName(documentData, options);
    const frontmatter = serializeFrontmatter({
      format: PORTABLE_MARKDOWN_FORMAT,
      annotations_path: `${baseName}.annotations.json`,
      title: documentData.title || "",
      author: documentData.author || "",
      date: documentData.date || "",
      annotator: documentData.annotator || "",
      source: documentData.source || "",
    });
    const text = typeof documentData.text === "string" ? documentData.text : "";

    return text ? `${frontmatter}\n\n${text}` : `${frontmatter}\n`;
  }

  function parsePortableMarkdown(markdown) {
    const { frontmatter, text } = splitFrontmatter(markdown);

    return {
      format: frontmatter.format || "",
      annotationsPath: frontmatter.annotations_path || "",
      document: {
        title: frontmatter.title || "",
        author: frontmatter.author || "",
        date: frontmatter.date || "",
        annotator: frontmatter.annotator || "",
        source: frontmatter.source || "",
        text,
      },
    };
  }

  function getAnnotationContext(text, start, end, contextLen = DEFAULT_CONTEXT_LEN) {
    const safeText = typeof text === "string" ? text : "";
    return {
      quote: safeText.slice(start, end),
      prefix: safeText.slice(Math.max(0, start - contextLen), start),
      suffix: safeText.slice(end, Math.min(safeText.length, end + contextLen)),
    };
  }

  function serializePortableAnnotations(documentData = {}, annotations, options = {}) {
    const baseName = getPortableBaseName(documentData, options);
    const safeText = typeof documentData.text === "string" ? documentData.text : "";
    const safeAnnotations = normalizeAnnotations
      ? normalizeAnnotations(safeText, annotations)
      : [];

    const payload = {
      format: PORTABLE_ANNOTATIONS_FORMAT,
      markdown_path: `${baseName}.md`,
      text_length: safeText.length,
      annotations: safeAnnotations.map((annotation) => {
        const context = getAnnotationContext(
          safeText,
          annotation.start,
          annotation.end,
          options.contextLen
        );
        const record = {
          start: annotation.start,
          end: annotation.end,
          quote: context.quote,
          prefix: context.prefix,
          suffix: context.suffix,
          note: annotation.note,
        };

        if (typeof annotation.id === "string" && annotation.id.trim()) {
          record.id = annotation.id.trim();
        }

        return record;
      }),
    };

    return JSON.stringify(payload, null, 2);
  }

  function normalizePortableAnnotationRecord(annotation) {
    if (!annotation || typeof annotation !== "object") return null;

    const target = annotation.target || {};
    const body = annotation.body || {};
    const normalized = {
      start: Number.isInteger(annotation.start)
        ? annotation.start
        : Number.isInteger(target.start)
          ? target.start
          : NaN,
      end: Number.isInteger(annotation.end)
        ? annotation.end
        : Number.isInteger(target.end)
          ? target.end
          : NaN,
      note:
        typeof annotation.note === "string"
          ? annotation.note
          : typeof body.text === "string"
            ? body.text
            : "",
      quote:
        typeof annotation.quote === "string"
          ? annotation.quote
          : typeof target.quote === "string"
            ? target.quote
            : "",
      prefix:
        typeof annotation.prefix === "string"
          ? annotation.prefix
          : typeof target.prefix === "string"
            ? target.prefix
            : "",
      suffix:
        typeof annotation.suffix === "string"
          ? annotation.suffix
          : typeof target.suffix === "string"
            ? target.suffix
            : "",
    };

    if (typeof annotation.id === "string" && annotation.id.trim()) {
      normalized.id = annotation.id.trim();
    }

    return normalized;
  }

  function parsePortableAnnotations(raw) {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const isArray = Array.isArray(parsed);
    const records = isArray
      ? parsed
      : Array.isArray(parsed?.annotations)
        ? parsed.annotations
        : parsed && typeof parsed === "object"
          ? [parsed]
          : [];

    return {
      format: isArray ? "" : parsed?.format || "",
      markdownPath: isArray ? "" : parsed?.markdown_path || "",
      textLength:
        !isArray && Number.isInteger(parsed?.text_length) ? parsed.text_length : null,
      annotations: records
        .map((annotation) => normalizePortableAnnotationRecord(annotation))
        .filter(Boolean),
    };
  }

  return {
    DEFAULT_CONTEXT_LEN,
    PORTABLE_ANNOTATIONS_FORMAT,
    PORTABLE_MARKDOWN_FORMAT,
    getAnnotationContext,
    getPortableBaseName,
    parsePortableAnnotations,
    parsePortableMarkdown,
    serializePortableAnnotations,
    serializePortableMarkdown,
    slugifyFilename,
    splitFrontmatter,
  };
});
