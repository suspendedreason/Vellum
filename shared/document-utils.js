(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VellumDocumentUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function getMetaContent(doc, selector) {
    const element = doc.querySelector(selector);
    return element ? element.getAttribute("content") || "" : "";
  }

  function normalizeDate(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().slice(0, 10);
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
    const metaDate =
      getMetaContent(doc, 'meta[property="article:published_time"]') ||
      getMetaContent(doc, 'meta[property="og:published_time"]') ||
      getMetaContent(doc, 'meta[name="pubdate"]') ||
      getMetaContent(doc, 'meta[name="publish-date"]') ||
      getMetaContent(doc, 'meta[name="date"]') ||
      getMetaContent(doc, 'meta[itemprop="datePublished"]') ||
      getMetaContent(doc, 'meta[name="article:published_time"]') ||
      "";

    const normalizedMetaDate = normalizeDate(metaDate);
    if (normalizedMetaDate) return normalizedMetaDate;

    const timeElement =
      doc.querySelector("time[datetime]") ||
      doc.querySelector('[itemprop="datePublished"]');

    if (!timeElement) return "";

    return normalizeDate(
      timeElement.getAttribute("datetime") || timeElement.textContent.trim()
    );
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
    getMetaContent,
    normalizeDate,
  };
});
