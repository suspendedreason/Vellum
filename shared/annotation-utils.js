(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VellumAnnotationUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MAX_QUOTE_LEN = 80;

  function clampQuote(text, maxLen = MAX_QUOTE_LEN) {
    const condensed = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (condensed.length <= maxLen) return condensed;
    return `${condensed.slice(0, maxLen - 3)}...`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeAnnotations(text, annotations) {
    const maxLen = typeof text === "string" ? text.length : 0;
    if (!Array.isArray(annotations)) return [];

    return annotations
      .map((annotation) => ({
        ...annotation,
        start: Number.isInteger(annotation?.start) ? annotation.start : NaN,
        end: Number.isInteger(annotation?.end) ? annotation.end : NaN,
        note: typeof annotation?.note === "string" ? annotation.note.trim() : "",
      }))
      .filter(
        (annotation) =>
          Number.isFinite(annotation.start) &&
          Number.isFinite(annotation.end) &&
          annotation.start >= 0 &&
          annotation.end > annotation.start &&
          annotation.end <= maxLen &&
          annotation.note.length > 0
      );
  }

  function findEditRange(previousText, nextText) {
    const before = typeof previousText === "string" ? previousText : "";
    const after = typeof nextText === "string" ? nextText : "";

    let start = 0;
    const maxPrefix = Math.min(before.length, after.length);
    while (start < maxPrefix && before[start] === after[start]) {
      start += 1;
    }

    let suffix = 0;
    const beforeRemaining = before.length - start;
    const afterRemaining = after.length - start;
    const maxSuffix = Math.min(beforeRemaining, afterRemaining);

    while (
      suffix < maxSuffix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) {
      suffix += 1;
    }

    return {
      start,
      previousEnd: before.length - suffix,
      nextEnd: after.length - suffix,
    };
  }

  function rebaseAnnotation(annotation, edit) {
    const { start, end } = annotation;
    const { start: editStart, previousEnd, nextEnd } = edit;
    const delta = nextEnd - previousEnd;

    if (end <= editStart) {
      return annotation;
    }

    if (start >= previousEnd) {
      return {
        ...annotation,
        start: start + delta,
        end: end + delta,
      };
    }

    if (start < editStart && end > previousEnd) {
      return {
        ...annotation,
        start,
        end: end + delta,
      };
    }

    if (start >= editStart && end <= previousEnd) {
      return {
        ...annotation,
        start: editStart,
        end: nextEnd,
      };
    }

    if (start < editStart && end <= previousEnd) {
      return {
        ...annotation,
        start,
        end: nextEnd,
      };
    }

    return {
      ...annotation,
      start: editStart,
      end: end + delta,
    };
  }

  function normalizeEditHint(previousText, nextText, editHint) {
    if (!editHint) return null;

    const before = typeof previousText === "string" ? previousText : "";
    const after = typeof nextText === "string" ? nextText : "";
    const start = Number.isInteger(editHint.start) ? editHint.start : NaN;
    const previousEnd = Number.isInteger(editHint.previousEnd)
      ? editHint.previousEnd
      : NaN;

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(previousEnd) ||
      start < 0 ||
      previousEnd < start ||
      previousEnd > before.length
    ) {
      return null;
    }

    const insertedLength =
      after.length - (before.length - (previousEnd - start));
    const nextEnd = start + Math.max(0, insertedLength);

    return { start, previousEnd, nextEnd };
  }

  function rebaseAnnotations(previousText, nextText, annotations, editHint) {
    const before = typeof previousText === "string" ? previousText : "";
    const after = typeof nextText === "string" ? nextText : "";
    const safeAnnotations = normalizeAnnotations(before, annotations);

    if (before === after || !safeAnnotations.length) {
      return safeAnnotations;
    }

    const edit =
      normalizeEditHint(before, after, editHint) || findEditRange(before, after);

    return normalizeAnnotations(
      after,
      safeAnnotations.map((annotation) => rebaseAnnotation(annotation, edit))
    );
  }

  function buildSegments(text, annotations) {
    const safeText = typeof text === "string" ? text : "";
    const safeAnnotations = normalizeAnnotations(safeText, annotations);
    const breakpoints = new Set([0, safeText.length]);
    const segments = [];

    safeAnnotations.forEach((annotation) => {
      breakpoints.add(annotation.start);
      breakpoints.add(annotation.end);
    });

    const points = Array.from(breakpoints).sort((left, right) => left - right);

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];

      if (start === end) continue;

      const covering = safeAnnotations.filter(
        (annotation) => annotation.start < end && annotation.end > start
      );

      segments.push({ start, end, covering });
    }

    return segments;
  }

  return {
    MAX_QUOTE_LEN,
    buildSegments,
    clampQuote,
    escapeHtml,
    normalizeAnnotations,
    rebaseAnnotations,
  };
});
