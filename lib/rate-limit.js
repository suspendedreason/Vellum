function createRateLimiter({ windowMs, maxRequests } = {}) {
  const safeWindowMs = Number.isFinite(windowMs) ? Math.max(1000, windowMs) : 0;
  const safeMaxRequests = Number.isFinite(maxRequests)
    ? maxRequests > 0
      ? Math.max(1, maxRequests)
      : 0
    : 0;
  const buckets = new Map();

  function cleanup(now) {
    buckets.forEach((bucket, key) => {
      if (!bucket || bucket.resetAt <= now) {
        buckets.delete(key);
      }
    });
  }

  return function rateLimit(req, res, next) {
    if (!safeWindowMs || !safeMaxRequests) {
      next();
      return;
    }

    const now = Date.now();
    cleanup(now);

    const key =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "anonymous";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + safeWindowMs,
      });
      res.setHeader("X-RateLimit-Limit", String(safeMaxRequests));
      res.setHeader("X-RateLimit-Remaining", String(safeMaxRequests - 1));
      next();
      return;
    }

    if (bucket.count >= safeMaxRequests) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(safeMaxRequests));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.status(429).json({
        error: "Too many requests. Try again in a few minutes.",
      });
      return;
    }

    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(safeMaxRequests));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, safeMaxRequests - bucket.count))
    );
    next();
  };
}

module.exports = {
  createRateLimiter,
};
