const express = require("express");
const jwt = require("jsonwebtoken");
const {
  getWalletBalance,
  getTransactionHistory,
  initiateWalletFunding,
  verifyWalletOTP,
  deductWalletBalance,
} = require("../controllers/wallet.controller");
const {
  createRateLimitMiddleware,
} = require("../utils/rate-limiting.util");
const {
  createValidationMiddleware,
  validateFundingPayload,
  validateOTPPayload,
  validatePurchasePayload,
} = require("../utils/validation.util");

const router = express.Router();

/**
 * Authentication Middleware
 * Verifies JWT token and sets req.user
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      message: "No authorization token provided",
    });
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      message: "Invalid authorization header format",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired token",
      error: err.message,
    });
  }
};

/**
 * Rate limiting middleware
 */
const generalRateLimit = createRateLimitMiddleware("general", (req) =>
  req.user?.id || req.ip
);
const fundingRateLimit = createRateLimitMiddleware("funding", (req) =>
  req.user?.id || req.ip
);
const purchaseRateLimit = createRateLimitMiddleware("purchase", (req) =>
  req.user?.id || req.ip
);
const otpRateLimit = createRateLimitMiddleware("otpVerification", (req) =>
  req.user?.id || req.ip
);

// Validation middleware
const validateFunding = createValidationMiddleware(validateFundingPayload);
const validateOTP = createValidationMiddleware(validateOTPPayload);
const validatePurchase = createValidationMiddleware(validatePurchasePayload);

/**
 * WALLET ENDPOINTS
 * All endpoints require JWT authentication
 */

/**
 * GET /api/wallet/balance
 * Retrieve current wallet balance
 * Authentication: Required (Bearer token)
 * Rate Limit: 20 requests per minute
 */
router.get(
  "/balance",
  authenticateToken,
  generalRateLimit,
  getWalletBalance
);

/**
 * GET /api/wallet/transactions
 * Get transaction history with pagination
 * Query params: page (default 1), limit (default 20, max 50)
 * Authentication: Required
 * Rate Limit: 20 requests per minute
 */
router.get(
  "/transactions",
  authenticateToken,
  generalRateLimit,
  getTransactionHistory
);

/**
 * POST /api/wallet/fund
 * Initiate wallet funding with Flutterwave
 * Body: { amount, email, phone_number?, name? }
 * Authentication: Required
 * Rate Limit: 5 requests per hour
 * Returns: Transaction reference and OTP status
 */
router.post(
  "/fund",
  authenticateToken,
  fundingRateLimit,
  validateFunding,
  initiateWalletFunding
);

/**
 * POST /api/wallet/verify-otp
 * Verify OTP for wallet operations
 * Body: { otp, transaction_reference }
 * Authentication: Required
 * Rate Limit: 3 attempts per 15 minutes
 */
router.post(
  "/verify-otp",
  authenticateToken,
  otpRateLimit,
  validateOTP,
  verifyWalletOTP
);

/**
 * POST /api/wallet/deduct
 * Deduct balance for purchase
 * Body: { amount, items, notes? }
 * Authentication: Required
 * Rate Limit: 10 requests per minute
 * May require OTP if fraud risk is detected
 */
router.post(
  "/deduct",
  authenticateToken,
  purchaseRateLimit,
  validatePurchase,
  deductWalletBalance
);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error("Wallet route error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

module.exports = router;
