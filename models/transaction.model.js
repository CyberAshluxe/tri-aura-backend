const mongoose = require("mongoose");

// Main Transactions Table - Full Audit Trail
const transactionSchema = new mongoose.Schema(
  {
    transaction_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Type of transaction: funding (add to wallet), purchase (deduct from wallet)
    type: {
      type: String,
      enum: ["funding", "purchase", "refund", "admin_adjustment"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    // Balance snapshot for audit trail
    previous_balance: {
      type: Number,
      required: true,
    },
    new_balance: {
      type: Number,
      required: true,
    },
    // Reference tracking
    reference: {
      type: String,
      index: true,
      // For Flutterwave: tx_ref or flutterwave reference
      // For purchases: order_id
    },
    // Transaction status: pending, completed, failed, reversed
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "pending",
      index: true,
    },
    // Source of transaction
    source: {
      type: String,
      enum: ["wallet", "flutterwave", "direct_payment", "admin"],
      required: true,
    },
    // For purchase transactions
    order_id: mongoose.Schema.Types.ObjectId,
    order_details: {
      items: [mongoose.Schema.Types.Mixed],
      total: Number,
    },
    // For refund transactions
    refund_reason: String,
    refund_of_transaction_id: {
      type: String,
      index: true,
    },
    // IP and device info for fraud detection
    ip_address: String,
    user_agent: String,
    device_fingerprint: String,
    // Fraud assessment
    fraud_risk_score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    fraud_flags: [String], // ["rapid_transaction", "unusual_amount", "new_device", etc.]
    // Additional metadata
    metadata: {
      payment_method: String,
      merchant_info: mongoose.Schema.Types.Mixed,
      notes: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Index for efficient audit queries
transactionSchema.index({ user_id: 1, timestamp: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ reference: 1 });

// OTP Verifications Table
const otpSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Hashed OTP value
    otp_hash: {
      type: String,
      required: true,
    },
    // Purpose of OTP: wallet_funding, wallet_deduction, sensitive_action
    purpose: {
      type: String,
      enum: ["wallet_funding", "wallet_deduction", "sensitive_action"],
      required: true,
    },
    // Transaction reference this OTP is tied to
    transaction_reference: String,
    // Expiration time (default 5 minutes)
    expires_at: {
      type: Date,
      required: true,
      index: true,
      default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
    // Attempt tracking
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    max_attempts: {
      type: Number,
      default: 3,
    },
    // One-time use only
    is_used: {
      type: Boolean,
      default: false,
      index: true,
    },
    used_at: Date,
    // Optional: delivery method
    delivery_method: {
      type: String,
      enum: ["email", "sms", "both"],
      default: "email",
    },
    // Track if OTP was locked due to max attempts
    is_locked: {
      type: Boolean,
      default: false,
    },
    locked_until: Date,
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Index for cleanup of expired OTPs
otpSchema.index({ expires_at: 1 });
otpSchema.index({ user_id: 1, purpose: 1, is_used: 1 });

// Flutterwave Transactions Table
const flutterwaveTransactionSchema = new mongoose.Schema(
  {
    flutterwave_reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Flutterwave tx_ref
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    // Verification status: pending, verified, failed, duplicate
    verification_status: {
      type: String,
      enum: ["pending", "verified", "failed", "duplicate"],
      default: "pending",
      index: true,
    },
    // Raw response from Flutterwave for audit
    raw_response: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Flutterwave transaction ID
    flutterwave_transaction_id: String,
    // Linked wallet transaction
    wallet_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      index: true,
    },
    // Verification timestamp
    verified_at: Date,
    // Webhook signature verification
    webhook_signature_valid: {
      type: Boolean,
      default: null,
    },
    webhook_verified_at: Date,
    // Idempotency tracking
    idempotency_key: {
      type: String,
      index: true,
    },
    // Error details if verification failed
    error_details: {
      code: String,
      message: String,
      details: mongoose.Schema.Types.Mixed,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

flutterwaveTransactionSchema.index({ user_id: 1, created_at: -1 });

// Fraud Logs Table
const fraudLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Reason for fraud flag
    reason: {
      type: String,
      enum: [
        "rapid_transactions",
        "unusual_amount",
        "new_device",
        "location_change",
        "multiple_failures",
        "duplicate_reference",
        "high_value_transaction",
        "unusual_pattern",
        "manual_flag",
      ],
      required: true,
    },
    // Risk score contribution
    risk_score: {
      type: Number,
      min: 0,
      max: 100,
    },
    // Action taken: monitoring, require_otp, block, manual_review
    action_taken: {
      type: String,
      enum: ["monitoring", "require_otp", "block", "manual_review", "escalate"],
      default: "monitoring",
    },
    // Associated transaction reference
    transaction_reference: String,
    // Details about the fraud detection
    details: {
      previous_transactions_count: Number,
      time_since_last_transaction: String,
      amount_variance: Number,
      ip_address: String,
      device_info: String,
      notes: String,
    },
    // Follow-up action
    resolved: {
      type: Boolean,
      default: false,
    },
    resolved_by: String, // admin_id or "system"
    resolution_notes: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

fraudLogSchema.index({ user_id: 1, timestamp: -1 });
fraudLogSchema.index({ action_taken: 1, resolved: 1 });

module.exports = {
  Transaction: mongoose.model("Transaction", transactionSchema),
  OTPVerification: mongoose.model("OTPVerification", otpSchema),
  FlutterwaveTransaction: mongoose.model("FlutterwaveTransaction", flutterwaveTransactionSchema),
  FraudLog: mongoose.model("FraudLog", fraudLogSchema),
};
