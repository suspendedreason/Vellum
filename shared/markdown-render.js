const { escapeHtml, normalizeAnnotations } = require("./annotation-utils");

function splitLines(text) {
  const safeText = typeof text === "string" ? text : "";
  const lines = [];
  let start = 0;

  while (start < safeText.length) {
    let end = start;
    while (
      end < safeText.length &&
      safeText[end] !== "\n" &&
      safeText[end] !== "\r"
    ) {
      end += 1;
    }

    let endWithNewline = end;
    if (safeText[endWithNewline] === "\r" && safeText[endWithNewline + 1] === "\n") {
      endWithNewline += 2;
    } else if (
      safeText[endWithNewline] === "\n" ||
      safeText[endWithNewline] === "\r"
    ) {
      endWithNewline += 1;
    }

    lines.push({
      text: safeText.slice(start, end),
      start,
      end,
      endWithNewline,
    });
    start = endWithNewline;
  }

  return lines;
}

function sanitizeUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "#";
  if (/^(https?:|mailto:|\/|#)/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return "#";
}

function annotatePlainText(text, absoluteStart, annotations) {
  if (!text) return "";

  const breakpoints = new Set([0, text.length]);
  const absoluteEnd = absoluteStart + text.length;
  const overlapping = annotations.filter(
    (annotation) => annotation.start < absoluteEnd && annotation.end > absoluteStart
  );

  overlapping.forEach((annotation) => {
    breakpoints.add(Math.max(0, annotation.start - absoluteStart));
    breakpoints.add(Math.min(text.length, annotation.end - absoluteStart));
  });

  const points = Array.from(breakpoints).sort((left, right) => left - right);
  const fragments = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === end) continue;

    const covering = overlapping.filter(
      (annotation) =>
        annotation.start < absoluteStart + end &&
        annotation.end > absoluteStart + start
    );
    const chunk = escapeHtml(text.slice(start, end));

    if (!covering.length) {
      fragments.push(chunk);
      continue;
    }

    const payload = encodeURIComponent(
      JSON.stringify(covering.map((annotation) => ({ note: annotation.note })))
    );

    fragments.push(`<span data-notes="${payload}">${chunk}</span>`);
  }

  return fragments.join("");
}

function renderInline(text, absoluteStart, annotations) {
  let html = "";
  let cursor = 0;

  function appendPlain(until) {
    if (until <= cursor) return;
    html += annotatePlainText(
      text.slice(cursor, until),
      absoluteStart + cursor,
      annotations
    );
    cursor = until;
  }

  while (cursor < text.length) {
    const strongDelimiter =
      text.startsWith("**", cursor) || text.startsWith("__", cursor)
        ? text.slice(cursor, cursor + 2)
        : null;

    if (strongDelimiter) {
      const close = text.indexOf(strongDelimiter, cursor + 2);
      if (close > cursor + 2) {
        appendPlain(cursor);
        const innerStart = cursor + 2;
        const inner = renderInline(
          text.slice(innerStart, close),
          absoluteStart + innerStart,
          annotations
        );
        html += `<strong>${inner}</strong>`;
        cursor = close + 2;
        continue;
      }
    }

    if (text[cursor] === "*" || text[cursor] === "_") {
      const delimiter = text[cursor];
      const close = text.indexOf(delimiter, cursor + 1);
      if (close > cursor + 1) {
        appendPlain(cursor);
        const innerStart = cursor + 1;
        const inner = renderInline(
          text.slice(innerStart, close),
          absoluteStart + innerStart,
          annotations
        );
        html += `<em>${inner}</em>`;
        cursor = close + 1;
        continue;
      }
    }

    if (text[cursor] === "`") {
      const close = text.indexOf("`", cursor + 1);
      if (close > cursor + 1) {
        appendPlain(cursor);
        const innerStart = cursor + 1;
        html += `<code>${annotatePlainText(
          text.slice(innerStart, close),
          absoluteStart + innerStart,
          annotations
        )}</code>`;
        cursor = close + 1;
        continue;
      }
    }

    if (text[cursor] === "[") {
      const labelEnd = text.indexOf("]", cursor + 1);
      const parenStart = labelEnd >= 0 ? labelEnd + 1 : -1;
      const urlEnd =
        parenStart >= 0 && text[parenStart] === "("
          ? text.indexOf(")", parenStart + 1)
          : -1;

      if (labelEnd > cursor + 1 && urlEnd > parenStart + 1) {
        appendPlain(cursor);
        const labelStart = cursor + 1;
        const label = renderInline(
          text.slice(labelStart, labelEnd),
          absoluteStart + labelStart,
          annotations
        );
        const href = sanitizeUrl(text.slice(parenStart + 1, urlEnd));
        html += `<a href="${href}">${label}</a>`;
        cursor = urlEnd + 1;
        continue;
      }
    }

    const nextSpecial = /[*_`\[]/.exec(text.slice(cursor + 1));
    const nextIndex = nextSpecial
      ? cursor + 1 + nextSpecial.index
      : text.length;
    appendPlain(nextIndex);
  }

  return html;
}

function isBlankLine(line) {
  return /^\s*$/.test(line.text);
}

function isFence(line) {
  return /^```/.test(line.text);
}

function renderParagraph(lines, startIndex, annotations) {
  let endIndex = startIndex;
  const parts = [];

  while (endIndex < lines.length) {
    const line = lines[endIndex];
    if (
      isBlankLine(line) ||
      isFence(line) ||
      /^(#{1,6})\s+/.test(line.text) ||
      /^>\s?/.test(line.text) ||
      /^[-+*]\s+/.test(line.text) ||
      /^\d+\.\s+/.test(line.text) ||
      /^([-*_])(?:\s*\1){2,}\s*$/.test(line.text)
    ) {
      break;
    }

    parts.push(renderInline(line.text, line.start, annotations));
    endIndex += 1;
  }

  return {
    html: `<p>${parts.join(" ")}</p>`,
    nextIndex: endIndex,
  };
}

function renderList(lines, startIndex, annotations, ordered) {
  let endIndex = startIndex;
  const items = [];
  const pattern = ordered ? /^\d+\.\s+/ : /^[-+*]\s+/;

  while (endIndex < lines.length && pattern.test(lines[endIndex].text)) {
    const line = lines[endIndex];
    const prefix = line.text.match(pattern)[0];
    items.push(
      `<li>${renderInline(
        line.text.slice(prefix.length),
        line.start + prefix.length,
        annotations
      )}</li>`
    );
    endIndex += 1;
  }

  return {
    html: ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`,
    nextIndex: endIndex,
  };
}

function renderBlockquote(lines, startIndex, annotations) {
  let endIndex = startIndex;
  const parts = [];

  while (endIndex < lines.length && /^>\s?/.test(lines[endIndex].text)) {
    const line = lines[endIndex];
    const prefix = line.text.match(/^>\s?/)[0];
    const content = line.text.slice(prefix.length);
    if (content.trim()) {
      parts.push(
        `<p>${renderInline(
          content,
          line.start + prefix.length,
          annotations
        )}</p>`
      );
    }
    endIndex += 1;
  }

  return {
    html: `<blockquote>${parts.join("")}</blockquote>`,
    nextIndex: endIndex,
  };
}

function renderCodeFence(text, lines, startIndex, annotations) {
  let endIndex = startIndex + 1;

  while (endIndex < lines.length && !isFence(lines[endIndex])) {
    endIndex += 1;
  }

  const contentStart =
    startIndex + 1 < lines.length ? lines[startIndex + 1].start : lines[startIndex].endWithNewline;
  const contentEnd =
    endIndex < lines.length ? lines[endIndex].start : text.length;

  const code = text.slice(contentStart, contentEnd);
  const html = `<pre><code>${annotatePlainText(
    code,
    contentStart,
    annotations
  )}</code></pre>`;

  return {
    html,
    nextIndex: endIndex < lines.length ? endIndex + 1 : endIndex,
  };
}

function renderHeading(line, annotations) {
  const match = line.text.match(/^(#{1,6})\s+(.*)$/);
  const depth = match[1].length;
  const prefixLength = match[0].length - match[2].length;
  const content = match[2].replace(/\s+#+\s*$/, "");
  const trimmedDelta = match[2].length - content.length;

  return `<h${depth}>${renderInline(
    content,
    line.start + prefixLength,
    annotations
  )}</h${depth}>`;
}

function renderMarkdownWithAnnotations(text, annotations) {
  const safeText = typeof text === "string" ? text : "";
  const safeAnnotations = normalizeAnnotations(safeText, annotations);
  const lines = splitLines(safeText);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isBlankLine(line)) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const rendered = renderCodeFence(safeText, lines, index, safeAnnotations);
      blocks.push(rendered.html);
      index = rendered.nextIndex;
      continue;
    }

    if (/^(#{1,6})\s+/.test(line.text)) {
      blocks.push(renderHeading(line, safeAnnotations));
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line.text)) {
      const rendered = renderBlockquote(lines, index, safeAnnotations);
      blocks.push(rendered.html);
      index = rendered.nextIndex;
      continue;
    }

    if (/^[-+*]\s+/.test(line.text)) {
      const rendered = renderList(lines, index, safeAnnotations, false);
      blocks.push(rendered.html);
      index = rendered.nextIndex;
      continue;
    }

    if (/^\d+\.\s+/.test(line.text)) {
      const rendered = renderList(lines, index, safeAnnotations, true);
      blocks.push(rendered.html);
      index = rendered.nextIndex;
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(line.text)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    const rendered = renderParagraph(lines, index, safeAnnotations);
    blocks.push(rendered.html);
    index = rendered.nextIndex;
  }

  return blocks.join("");
}

module.exports = {
  renderMarkdownWithAnnotations,
};
