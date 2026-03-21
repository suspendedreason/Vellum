const { escapeHtml } = require("./annotation-utils");

function renderShell({ title, eyebrow, heading, lede, content }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --ink: #1b1b1f;
        --muted: #5b5b66;
        --paper: #f5f1e8;
        --surface: #fffdf8;
        --border: rgba(27, 27, 31, 0.12);
        --accent: #ff6a3d;
        --accent-dark: #d5542f;
        --shadow: rgba(0, 0, 0, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Serif", "Georgia", serif;
        color: var(--ink);
        background: radial-gradient(circle at top, #fff6e8 0%, #f3ece1 45%, #efe6d7 100%);
      }
      .wrap { max-width: 1080px; margin: 0 auto; padding: 36px 24px 72px; }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 28px;
      }
      .brand {
        font-family: "Space Grotesk", "Avenir Next", sans-serif;
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .nav {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .nav a, .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 10px 18px;
        border: 1px solid var(--border);
        color: var(--ink);
        text-decoration: none;
        font-family: "Space Grotesk", "Avenir Next", sans-serif;
        font-weight: 600;
        background: rgba(255,255,255,0.6);
      }
      .button.primary {
        background: var(--accent);
        border-color: var(--accent);
      }
      .button.primary:hover, .nav a:hover {
        background: var(--accent-dark);
        border-color: var(--accent-dark);
        color: #fff;
      }
      .hero {
        margin-bottom: 28px;
      }
      .eyebrow {
        margin: 0 0 10px;
        font-family: "Space Grotesk", "Avenir Next", sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 0.78rem;
        color: var(--muted);
      }
      h1 {
        margin: 0 0 12px;
        font-family: "Space Grotesk", "Avenir Next", sans-serif;
        font-size: clamp(2.2rem, 3vw, 3.8rem);
        line-height: 0.96;
      }
      .lede {
        max-width: 720px;
        margin: 0;
        color: var(--muted);
        font-size: 1.08rem;
        line-height: 1.6;
      }
      .panel {
        background: var(--surface);
        border-radius: 20px;
        border: 1px solid var(--border);
        box-shadow: 0 16px 40px var(--shadow);
        padding: 24px;
      }
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .card {
        background: rgba(255,255,255,0.78);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 20px;
      }
      .card h2, .card h3 {
        margin: 0 0 10px;
        font-family: "Space Grotesk", "Avenir Next", sans-serif;
      }
      .card p {
        margin: 0 0 14px;
        color: var(--muted);
        line-height: 1.55;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        color: var(--muted);
        font-size: 0.92rem;
        margin-bottom: 16px;
      }
      .meta span { display: inline-flex; gap: 6px; }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .empty {
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.6;
      }
      @media (max-width: 720px) {
        .topbar { align-items: flex-start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="topbar">
        <div class="brand">Vellum</div>
        <nav class="nav" aria-label="Primary">
          <a href="/">Home</a>
          <a href="/create">Create</a>
          <a href="/library">Library</a>
        </nav>
      </header>
      <section class="hero">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(heading)}</h1>
        <p class="lede">${escapeHtml(lede)}</p>
      </section>
      ${content}
    </div>
  </body>
</html>`;
}

function renderHomePage() {
  return renderShell({
    title: "Vellum",
    eyebrow: "Collaborative annotation studio",
    heading: "Annotate texts, publish notes, browse the library.",
    lede:
      "Start a fresh annotation draft or browse the existing library of published annotated texts.",
    content: `
      <section class="panel">
        <div class="card-grid">
          <article class="card">
            <h2>Create New Annotation</h2>
            <p>Open the studio, paste or ingest a text, and start attaching notes to specific passages.</p>
            <div class="actions">
              <a class="button primary" href="/create">Create New Annotation</a>
            </div>
          </article>
          <article class="card">
            <h2>Library</h2>
            <p>Browse existing annotated texts, open their public pages, or jump back into editing.</p>
            <div class="actions">
              <a class="button" href="/library">Open Library</a>
            </div>
          </article>
        </div>
      </section>
    `,
  });
}

function renderLibraryPage(submissions = []) {
  const items = submissions.length
    ? submissions
        .map((submission) => {
          const meta = [
            submission.author
              ? `<span><strong>Author</strong> ${escapeHtml(submission.author)}</span>`
              : "",
            submission.annotator
              ? `<span><strong>Annotator</strong> ${escapeHtml(submission.annotator)}</span>`
              : "",
            submission.date
              ? `<span><strong>Date</strong> ${escapeHtml(submission.date)}</span>`
              : "",
            `<span><strong>Annotations</strong> ${escapeHtml(
              String(submission.annotationCount || 0)
            )}</span>`,
          ]
            .filter(Boolean)
            .join("");

          return `
            <article class="card">
              <h3>${escapeHtml(submission.title || "Untitled")}</h3>
              <div class="meta">${meta}</div>
              <div class="actions">
                <a class="button primary" href="/text/${escapeHtml(
                  submission.slug
                )}">Read</a>
                <a class="button" href="/edit/${escapeHtml(
                  submission.slug
                )}">Edit</a>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty">No annotated texts yet. Start the first one from <a href="/create">Create New Annotation</a>.</div>`;

  return renderShell({
    title: "Vellum Library",
    eyebrow: "Library",
    heading: "Existing annotations",
    lede:
      "This library lists published annotated texts currently stored in Vellum.",
    content: `
      <section class="panel">
        ${submissions.length ? `<div class="card-grid">${items}</div>` : items}
      </section>
    `,
  });
}

module.exports = {
  renderHomePage,
  renderLibraryPage,
};
