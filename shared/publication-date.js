(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VellumPublicationDateUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function isValidCalendarDate(year, month, day) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    );
  }

  function normalizePublicationDate(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";

    const yearOnly = trimmed.match(/^(\d{4})$/);
    if (yearOnly) {
      return yearOnly[1];
    }

    const yearMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (yearMonth) {
      const month = Number(yearMonth[2]);
      if (month >= 1 && month <= 12) {
        return `${yearMonth[1]}-${pad(month)}`;
      }
      return "";
    }

    const fullDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fullDate) {
      const year = Number(fullDate[1]);
      const month = Number(fullDate[2]);
      const day = Number(fullDate[3]);
      if (isValidCalendarDate(year, month, day)) {
        return `${year}-${pad(month)}-${pad(day)}`;
      }
      return "";
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return [
      parsed.getUTCFullYear(),
      pad(parsed.getUTCMonth() + 1),
      pad(parsed.getUTCDate()),
    ].join("-");
  }

  function isValidPublicationDate(value) {
    return normalizePublicationDate(value).length > 0;
  }

  return {
    isValidPublicationDate,
    normalizePublicationDate,
  };
});
