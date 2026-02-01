/**
 * In-Memory Rate Limiter
 * Tracks request counts per user/IP for fraud prevention
 * In production, use Redis for distributed rate limiting
 */

class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 10) {
    // windowMs: Time window in milliseconds (default 1 minute)
    // maxRequests: Max requests allowed per window
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map(); // Store request history
  }

  /**
   * Check if request should be allowed
   * @param {string} key - Unique identifier (user_id, IP, etc.)
   * @returns {object} { allowed: boolean, remaining: number, resetTime: Date }
   */
  check(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];

    // Remove requests outside current window
    const validRequests = userRequests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    const allowed = validRequests.length < this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - validRequests.length - 1);
    const resetTime = new Date(
      validRequests.length > 0
        ? validRequests[0] + this.windowMs
        : now + this.windowMs
    );

    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);

    return {
      allowed,
      remaining,
      resetTime,
      requestCount: validRequests.length,
    };
  }

  /**
   * Reset rate limit for a specific key
   * @param {string} key - Unique identifier
   */
  reset(key) {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clear() {
    this.requests.clear();
  }

  /**
   * Get current request count for a key
   * @param {string} key - Unique identifier
   * @returns {number} Current request count in window
   */
  getCount(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    return userRequests.filter(
      (timestamp) => now - timestamp < this.windowMs
    ).length;
  }
}

// Specific rate limiters for different operations
const rateLimiters = {
  // General API rate limiting
  general: new RateLimiter(60000, 100), // 100 requests per minute

  // Wallet operations
  wallet: new RateLimiter(60000, 20), // 20 requests per minute

  // Funding operations (stricter)
  funding: new RateLimiter(3600000, 5), // 5 requests per hour

  // Purchase operations
  purchase: new RateLimiter(60000, 10), // 10 requests per minute

  // OTP verification (very strict)
  otpVerification: new RateLimiter(900000, 3), // 3 attempts per 15 minutes

  // OTP generation (prevent spam)
  otpGeneration: new RateLimiter(300000, 3), // 3 OTP generations per 5 minutes

  // Password reset/sensitive actions
  sensitiveAction: new RateLimiter(3600000, 3), // 3 attempts per hour

  // OTP sending (prevent spam)
  otpSend: new RateLimiter(60000, 3), // 3 OTP sends per minute

  // OTP status checking
  otpStatus: new RateLimiter(60000, 10), // 10 status checks per minute
};

/**
 * Middleware factory for rate limiting
 * @param {string} limitType - Type of rate limit to apply
 * @param {string} keyFn - Function or field to extract key from request
 * @returns {function} Express middleware
 */
const createRateLimitMiddleware = (limitType = "general", keyFn = (req) => req.user?.id || req.ip) => {
  return (req, res, next) => {
    const limiter = rateLimiters[limitType];
    if (!limiter) {
      return res.status(500).json({ message: "Invalid rate limiter type" });
    }

    const key =
      typeof keyFn === "function"
        ? keyFn(req)
        : req[keyFn] || req.user?.id || req.ip;

    if (!key) {
      return res.status(400).json({ message: "Cannot determine rate limit key" });
    }

    const result = limiter.check(key);

    // Add rate limit info to response headers
    res.set({
      "X-RateLimit-Limit": limiter.maxRequests,
      "X-RateLimit-Remaining": result.remaining,
      "X-RateLimit-Reset": result.resetTime.toISOString(),
    });

    if (!result.allowed) {
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
        resetTime: result.resetTime,
        retryAfter: Math.ceil((result.resetTime - new Date()) / 1000),
      });
    }

    next();
  };
};

/**
 * Check for rapid transactions (fraud detection)
 * @param {string} userId - User ID
 * @param {number} threshold - Number of transactions within window
 * @returns {boolean} True if rapid transactions detected
 */
const checkRapidTransactions = (userId, threshold = 3) => {
  const count = rateLimiters.purchase.getCount(userId);
  return count >= threshold;
};

/**
 * Reset rate limit after successful operation
 * @param {string} limitType - Type of rate limit
 * @param {string} key - Key to reset
 */
const resetRateLimit = (limitType, key) => {
  if (rateLimiters[limitType]) {
    rateLimiters[limitType].reset(key);
  }
};

module.exports = {
  RateLimiter,
  rateLimiters,
  createRateLimitMiddleware,
  checkRapidTransactions,
  resetRateLimit,
};
