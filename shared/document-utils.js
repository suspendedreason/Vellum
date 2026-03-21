(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VellumDocumentUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PARTIAL_ISO_DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;

  function getMetaContent(doc, selector) {
    const element = doc.querySelector(selector);
    return element ? element.getAttribute("content") || "" : "";
  }

  function normalizeDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (PARTIAL_ISO_DATE_RE.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().slice(0, 10);
  }

  function flattenJsonLd(value, accumulator = []) {
    if (!value) return accumulator;

    if (Array.isArray(value)) {
      value.forEach((item) => flattenJsonLd(item, accumulator));
      return accumulator;
    }

    if (typeof value !== "object") {
      return accumulator;
    }

    accumulator.push(value);
    if (Array.isArray(value["@graph"])) {
      value["@graph"].forEach((item) => flattenJsonLd(item, accumulator));
    }
    return accumulator;
  }

  function getJsonLdObjects(doc) {
    const scripts = Array.from(
      doc.querySelectorAll('script[type="application/ld+json"]')
    );

    return scripts.flatMap((script) => {
      const text = script.textContent.trim();
      if (!text) return [];
      try {
        return flattenJsonLd(JSON.parse(text), []);
      } catch (error) {
        return [];
      }
    });
  }

  function findJsonLdDate(doc) {
    const candidates = getJsonLdObjects(doc);

    for (const item of candidates) {
      const dateValue =
        item.datePublished ||
        item.dateCreated ||
        item.uploadDate ||
        item.dateModified ||
        "";
      const normalized = normalizeDate(dateValue);
      if (normalized) return normalized;
    }

    return "";
  }

  function findAuthor(doc, fallback = "") {
    const metaAuthor =
      getMetaContent(doc, 'meta[name="author"]') ||
      getMetaContent(doc, 'meta[name="byline"]') ||
      getMetaContent(doc, 'meta[property="author"]') ||
      getMetaContent(doc, 'meta[property="article:author"]') ||
      getMetaContent(doc, 'meta[property="og:article:author"]') ||
      "";

    if (metaAuthor) return metaAuthor;

    const byline =
      doc.querySelector('[rel="author"]') ||
      doc.querySelector('[itemprop="author"]') ||
      doc.querySelector('[itemprop="name"]') ||
      doc.querySelector(".byline, .byline-name, .author, .post-author");

    if (byline) return byline.textContent.trim();

    return fallback || "";
  }

  function findDate(doc) {
    const metaDateSelectors = [
      'meta[property="article:published_time"]',
      'meta[property="og:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="article.published"]',
      'meta[name="article.published_time"]',
      'meta[name="publish-date"]',
      'meta[name="pubdate"]',
      'meta[name="parsely-pub-date"]',
      'meta[name="dc.date"]',
      'meta[name="dc.date.issued"]',
      'meta[name="dcterms.created"]',
      'meta[name="dcterms.issued"]',
      'meta[name="citation_publication_date"]',
      'meta[name="date"]',
      'meta[itemprop="datePublished"]',
    ];

    const metaDate =
      metaDateSelectors
        .map((selector) => getMetaContent(doc, selector))
        .find(Boolean) ||
      "";

    const normalizedMetaDate = normalizeDate(metaDate);
    if (normalizedMetaDate) return normalizedMetaDate;

    const jsonLdDate = findJsonLdDate(doc);
    if (jsonLdDate) return jsonLdDate;

    const timeElementSelectors = [
      'time[datetime][itemprop="datePublished"]',
      'time[itemprop="datePublished"]',
      "time[datetime]",
      '[itemprop="datePublished"]',
      ".published-date",
      ".post-date",
      ".entry-date",
      ".article-date",
      ".timestamp",
    ];

    const timeElement =
      timeElementSelectors
        .map((selector) => doc.querySelector(selector))
        .find(Boolean) || null;

    if (!timeElement) return "";

    const attributeDate =
      timeElement.getAttribute("datetime") ||
      timeElement.getAttribute("content") ||
      timeElement.getAttribute("title") ||
      "";

    const normalizedAttributeDate = normalizeDate(attributeDate);
    if (normalizedAttributeDate) return normalizedAttributeDate;

    return normalizeDate(timeElement.textContent.trim());
  }

  function getDocumentMetadata(doc, options = {}) {
    const titleFallback = options.titleFallback || "Untitled";
    const authorFallback = options.authorFallback || "";

    return {
      title: doc.title || titleFallback,
      author: findAuthor(doc, authorFallback),
      date: findDate(doc),
    };
  }

  return {
    findAuthor,
    findDate,
    getDocumentMetadata,
    getJsonLdObjects,
    getMetaContent,
    normalizeDate,
  };
});
