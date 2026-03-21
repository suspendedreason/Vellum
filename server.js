const fs = require("fs/promises");
const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const TurndownService = require("turndown");
const { chromium } = require("playwright");
const { normalizeAnnotations } = require("./shared/annotation-utils");
const { getDocumentMetadata } = require("./shared/document-utils");
const {
  serializePortableAnnotations,
  serializePortableMarkdown,
} = require("./shared/portable-format");
const { renderPublicationPage } = require("./shared/publication-page");
const {
  listSubmissions,
  readSubmission,
  saveSubmission,
  updateSubmission,
} = require("./lib/submission-store");
const { createRateLimiter } = require("./lib/rate-limit");
const { renderHomePage, renderLibraryPage } = require("./shared/site-pages");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ACCESS_KEY = process.env.VELLUM_ACCESS_KEY || "";
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || "");
const EXTRACT_RATE_LIMIT_MAX = Number(process.env.EXTRACT_RATE_LIMIT_MAX) || 20;
const SUBMIT_RATE_LIMIT_MAX = Number(process.env.SUBMIT_RATE_LIMIT_MAX) || 30;
const RATE_LIMIT_WINDOW_MS =
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

turndown.addRule("stripScripts", {
  filter: ["script", "style", "noscript"],
  replacement: () => "",
});

function htmlToMarkdown(html) {
  return turndown.turndown(html || "");
}

async function renderStudioPage(initialData = null) {
  const raw = await fs.readFile(path.join(__dirname, "index.html"), "utf-8");
  if (!initialData) return raw;

  const payload = JSON.stringify(initialData).replace(/</g, "\\u003c");
  const bootstrap = `<script>window.__VELLUM_INITIAL_DATA__ = ${payload};</script>`;
  return raw.replace("</body>", `    ${bootstrap}\n  </body>`);
}

function sendStaticFile(filePath) {
  return function serveFile(req, res) {
    return res.sendFile(path.join(__dirname, filePath));
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf-8");
  const rightBuffer = Buffer.from(String(right || ""), "utf-8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAccessKey(configuredAccessKey) {
  return function accessKeyMiddleware(req, res, next) {
    if (!configuredAccessKey) {
      next();
      return;
    }

    const providedKey =
      req.get("x-vellum-access-key") ||
      req.body?.accessKey ||
      "";

    if (!safeEqual(providedKey, configuredAccessKey)) {
      res.status(401).json({ error: "A valid access key is required." });
      return;
    }

    next();
  };
}

function extractFromHtml(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const doc = dom.window.document;
  const metadata = getDocumentMetadata(doc, {
    authorFallback: (article && article.byline) || "",
  });

  if (article && article.content) {
    return {
      title: article.title || metadata.title,
      author: metadata.author,
      date: metadata.date,
      markdown: htmlToMarkdown(article.content),
    };
  }

  const bodyHtml = doc.body ? doc.body.innerHTML : "";

  return {
    ...metadata,
    markdown: htmlToMarkdown(bodyHtml),
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.text();
}

async function renderHtmlWithBrowser(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const html = await page.content();
    return html;
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

async function extractFromUrl(url) {
  const html = await fetchHtml(url);
  const result = extractFromHtml(html, url);
  if (result.markdown && result.markdown.trim().length >= 100) {
    return result;
  }

  try {
    const rendered = await renderHtmlWithBrowser(url);
    return extractFromHtml(rendered, url);
  } catch (error) {
    return result;
  }
}

function createApp({
  dataDir = DATA_DIR,
  accessKey = ACCESS_KEY,
  trustProxy = TRUST_PROXY,
  extractRateLimitMax = EXTRACT_RATE_LIMIT_MAX,
  submitRateLimitMax = SUBMIT_RATE_LIMIT_MAX,
  rateLimitWindowMs = RATE_LIMIT_WINDOW_MS,
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  if (trustProxy) {
    app.set("trust proxy", true);
  }

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (req, res) => {
    return res.json({ ok: true });
  });
  app.get("/", (req, res) => {
    return res.send(renderHomePage());
  });
  app.get("/create", async (req, res) => {
    return res.send(await renderStudioPage());
  });
  app.get("/index.html", (req, res) => {
    return res.redirect(302, "/");
  });
  app.get("/library", async (req, res) => {
    try {
      const submissions = await listSubmissions(dataDir);
      return res.send(renderLibraryPage(submissions));
    } catch (error) {
      return res.status(500).send("Library unavailable.");
    }
  });
  app.get("/edit/:slug", async (req, res) => {
    try {
      const data = await readSubmission(dataDir, req.params.slug);
      return res.send(await renderStudioPage(data));
    } catch (error) {
      return res.status(404).send("Not found.");
    }
  });

  app.get("/app.js", sendStaticFile("app.js"));
  app.get("/styles.css", sendStaticFile("styles.css"));
  app.use(
    "/shared",
    express.static(path.join(__dirname, "shared"), { index: false })
  );

  const requireWriteAccess = requireAccessKey(accessKey);
  const limitExtract = createRateLimiter({
    windowMs: rateLimitWindowMs,
    maxRequests: extractRateLimitMax,
  });
  const limitSubmit = createRateLimiter({
    windowMs: rateLimitWindowMs,
    maxRequests: submitRateLimitMax,
  });

  app.post("/extract", requireWriteAccess, limitExtract, async (req, res) => {
    const { url, html } = req.body || {};

    try {
      if (!html && url) {
        const result = await extractFromUrl(url);
        if (!result.markdown || result.markdown.trim().length < 20) {
          return res.status(422).json({ error: "Unable to extract article." });
        }
        return res.json(result);
      }

      if (!html) {
        return res.status(400).json({ error: "Missing url or html." });
      }

      const result = extractFromHtml(html, url);

      if (!result.markdown || result.markdown.trim().length < 20) {
        return res.status(422).json({ error: "Unable to extract article." });
      }

      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: "Extraction failed." });
    }
  });

  app.post("/submit", requireWriteAccess, limitSubmit, async (req, res) => {
    try {
      const submission = req.body || {};

      if (!submission.text || typeof submission.text !== "string") {
        return res.status(400).json({ error: "Missing text." });
      }

      const payload = submission.slug
        ? await updateSubmission(dataDir, submission.slug, submission)
        : await saveSubmission(dataDir, submission);
      return res.json({ url: `/text/${payload.slug}` });
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "Submission not found." });
      }
      return res.status(500).json({ error: "Submit failed." });
    }
  });

  app.get("/text/:slug", async (req, res) => {
    try {
      const data = await readSubmission(dataDir, req.params.slug);
      return res.send(renderPublicationPage(data));
    } catch (error) {
      return res.status(404).send("Not found.");
    }
  });

  app.get("/export/:slug", async (req, res) => {
    try {
      const data = await readSubmission(dataDir, req.params.slug);
      const filename = `${data.slug || req.params.slug}.html`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      return res.send(
        renderPublicationPage(data, {
          includeEditAction: false,
          includeExportAction: false,
        })
      );
    } catch (error) {
      return res.status(404).send("Not found.");
    }
  });

  app.get("/export/:slug/markdown", async (req, res) => {
    try {
      const data = await readSubmission(dataDir, req.params.slug);
      const filename = `${data.slug || req.params.slug}.md`;
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      return res.send(serializePortableMarkdown(data));
    } catch (error) {
      return res.status(404).send("Not found.");
    }
  });

  app.get("/export/:slug/annotations", async (req, res) => {
    try {
      const data = await readSubmission(dataDir, req.params.slug);
      const filename = `${data.slug || req.params.slug}.annotations.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      return res.send(serializePortableAnnotations(data, data.annotations));
    } catch (error) {
      return res.status(404).send("Not found.");
    }
  });

  return app;
}

function startServer(options = {}) {
  const port = options.port ?? PORT;
  const host = options.host ?? HOST;
  const exitOnError = options.exitOnError !== false;
  const app = createApp({
    dataDir: options.dataDir ?? DATA_DIR,
    accessKey: options.accessKey ?? ACCESS_KEY,
    trustProxy: options.trustProxy ?? TRUST_PROXY,
    extractRateLimitMax: options.extractRateLimitMax ?? EXTRACT_RATE_LIMIT_MAX,
    submitRateLimitMax: options.submitRateLimitMax ?? SUBMIT_RATE_LIMIT_MAX,
    rateLimitWindowMs: options.rateLimitWindowMs ?? RATE_LIMIT_WINDOW_MS,
  });
  const server = app.listen(port, host, () => {
    const address = server.address();
    const resolvedPort =
      address && typeof address === "object" ? address.port : port;
    console.log(`Vellum server listening on http://${host}:${resolvedPort}`);
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use on ${host}. Set PORT to another value.`
      );
      if (exitOnError) process.exit(1);
      return;
    }

    if (error && error.code === "EPERM") {
      console.error(
        `Unable to bind server on ${host}:${port} (permission denied). ` +
          "Check environment restrictions or choose another host/port."
      );
      if (exitOnError) process.exit(1);
      return;
    }

    console.error("Server failed to start:", error);
    if (exitOnError) process.exit(1);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  extractFromHtml,
  normalizeAnnotations,
  renderPublicationPage,
  startServer,
};
