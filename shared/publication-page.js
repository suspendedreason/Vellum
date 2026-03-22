const { escapeHtml } = require("./annotation-utils");
const { renderMarkdownWithAnnotations } = require("./markdown-render");

function getSourcePreview(source) {
  const raw = String(source || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const trimmedPath =
      path === "/"
        ? ""
        : path.length > 28
          ? `${path.slice(0, 25)}...`
          : path;

    return {
      href: url.toString(),
      label: trimmedPath ? `${hostname}${trimmedPath}` : hostname,
    };
  } catch (error) {
    return {
      href: raw,
      label: raw.length > 40 ? `${raw.slice(0, 37)}...` : raw,
    };
  }
}

function buildMetaParts(data) {
  const metaParts = [];
  if (data.author) {
    metaParts.push(
      `<span><strong>Author</strong> ${escapeHtml(data.author)}</span>`
    );
  }
  if (data.date) {
    metaParts.push(`<span><strong>Date</strong> ${escapeHtml(data.date)}</span>`);
  }
  if (data.annotator) {
    metaParts.push(
      `<span><strong>Annotator</strong> ${escapeHtml(data.annotator)}</span>`
    );
  }
  if (data.source) {
    const preview = getSourcePreview(data.source);
    metaParts.push(
      `<span><strong>Source</strong> <a href="${escapeHtml(
        preview?.href || data.source
      )}" target="_blank" rel="noreferrer">${escapeHtml(
        preview?.label || data.source
      )}</a></span>`
    );
  }

  return metaParts;
}

function buildActions(data, options) {
  const actions = [`<a href="/">Home</a>`];

  if (options.includeEditAction && data.slug) {
    actions.push(
      `<a href="/edit/${escapeHtml(data.slug)}">Edit annotations</a>`
    );
  }

  if (options.includeExportAction && data.slug) {
    actions.push(
      `<a href="/export/${escapeHtml(data.slug)}" download>Export HTML</a>`
    );
    actions.push(
      `<a href="/export/${escapeHtml(data.slug)}/data" download>Export Data</a>`
    );
  }

  return actions;
}

function renderPublicationPage(data, options = {}) {
  const pageOptions = {
    includeEditAction: options.includeEditAction !== false,
    includeExportAction: options.includeExportAction !== false,
  };
  const safeText = typeof data.text === "string" ? data.text : "";
  const metaParts = buildMetaParts(data);
  const actions = buildActions(data, pageOptions);
  const renderedMarkdown = renderMarkdownWithAnnotations(
    safeText,
    data.annotations
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(data.title || "Vellum")}</title>
    <style>
      body { margin: 0; font-family: "IBM Plex Serif", "Georgia", serif; background: #f5f1e8; color: #1b1b1f; }
      .wrap { max-width: 900px; margin: 0 auto; padding: 48px 24px 80px; }
      .page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
      .page-header .brand { font-family: "Space Grotesk", "Avenir Next", sans-serif; font-size: 1rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
      .page-header .brand a { color: #1b1b1f; text-decoration: none; }
      h1 { font-family: "Space Grotesk", "Avenir Next", sans-serif; font-size: 2.6rem; margin: 0 0 10px; }
      .meta { display: flex; flex-wrap: wrap; gap: 10px 18px; color: #5b5b66; font-size: 0.9rem; margin-bottom: 24px; }
      .meta span { display: inline-flex; gap: 6px; }
      .meta a { color: #b6432a; text-decoration: none; }
      .meta a:hover { text-decoration: underline; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
      .actions a { display: inline-flex; align-items: center; border-radius: 999px; padding: 10px 18px; border: 1px solid #ff6a3d; background: #ff6a3d; color: #1b1b1f; text-decoration: none; font-family: "Space Grotesk", "Avenir Next", sans-serif; font-weight: 600; }
      .actions a:hover { background: #d5542f; border-color: #d5542f; color: #fff; }
      .text { position: relative; background: #fffdf9; border-radius: 16px; border: 1px solid rgba(27,27,31,0.12); padding: 22px; line-height: 1.7; }
      .text > :first-child { margin-top: 0; }
      .text > :last-child { margin-bottom: 0; }
      .text p, .text ul, .text ol, .text blockquote, .text pre { margin: 0 0 1em; }
      .text h1, .text h2, .text h3, .text h4, .text h5, .text h6 { font-family: "Space Grotesk", "Avenir Next", sans-serif; line-height: 1.15; margin: 1.4em 0 0.5em; }
      .text blockquote { border-left: 4px solid rgba(255, 106, 61, 0.45); margin-left: 0; padding-left: 16px; color: #4d4d58; }
      .text code { font-family: "IBM Plex Mono", "SFMono-Regular", monospace; background: rgba(27,27,31,0.06); padding: 0.1em 0.3em; border-radius: 6px; }
      .text pre { overflow: auto; padding: 16px; border-radius: 12px; background: #f2ebde; }
      .text pre code { background: transparent; padding: 0; }
      .text a { color: #b6432a; }
      .text span[data-notes] { background: rgba(255, 200, 120, 0.45); border-bottom: 2px solid #ff6a3d; }
      .tooltip { position: absolute; z-index: 10; max-width: 280px; background: #1b1b1f; color: #f6f0e6; border-radius: 12px; padding: 10px 12px; box-shadow: 0 16px 32px rgba(0,0,0,0.25); font-family: "Space Grotesk", sans-serif; font-size: 0.85rem; line-height: 1.4; pointer-events: none; opacity: 0; transition: opacity 0.15s ease; }
      .tooltip.visible { opacity: 1; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="page-header">
        <div class="brand"><a href="/">Vellum</a></div>
        ${
          actions.length
            ? `<div class="actions">${actions.join("")}</div>`
            : ""
        }
      </header>
      <h1>${escapeHtml(data.title || "Untitled")}</h1>
      <div class="meta">${metaParts.join("")}</div>
      <div class="text" id="publication">
        ${renderedMarkdown}
        <div class="tooltip" id="tooltip"></div>
      </div>
    </div>
    <script>
      const tooltip = document.getElementById("tooltip");
      const pub = document.getElementById("publication");
      let activeTarget = null;
      function positionTooltip(target) {
        if (!target) return;
        const pubRect = pub.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const gutter = 10;
        const preferredLeft = targetRect.left - pubRect.left;
        const maxLeft = Math.max(gutter, pub.clientWidth - tooltipRect.width - gutter);
        const left = Math.min(maxLeft, Math.max(gutter, preferredLeft));
        const targetTop = targetRect.top - pubRect.top;
        const targetBottom = targetRect.bottom - pubRect.top;
        const fitsBelow = targetBottom + gutter + tooltipRect.height <= pub.clientHeight - gutter;
        const top = fitsBelow
          ? targetBottom + gutter
          : Math.max(gutter, targetTop - tooltipRect.height - gutter);
        tooltip.style.left = left + "px";
        tooltip.style.top = top + "px";
      }
      function show(target) {
        const payload = target.getAttribute("data-notes");
        if (!payload) return;
        let notes = [];
        try { notes = JSON.parse(decodeURIComponent(payload)); } catch (e) { notes = []; }
        if (!notes.length) return;
        activeTarget = target;
        tooltip.innerHTML = notes.map(item => "<div>" + item.note.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</div>").join("<hr />");
        tooltip.classList.add("visible");
        positionTooltip(target);
      }
      function hide() {
        activeTarget = null;
        tooltip.classList.remove("visible");
      }
      pub.addEventListener("mouseover", (e) => {
        const target = e.target.closest("span[data-notes]");
        if (!target) return;
        show(target);
      });
      pub.addEventListener("mouseleave", hide);
      pub.addEventListener("focusin", (e) => {
        const target = e.target.closest("span[data-notes]");
        if (!target) return;
        show(target);
      });
      pub.addEventListener("focusout", hide);
      window.addEventListener("resize", () => {
        if (activeTarget) positionTooltip(activeTarget);
      });
    </script>
  </body>
</html>`;
}

module.exports = {
  renderPublicationPage,
};
