const { Transaction, FraudLog } = require("../models/transaction.model");
const { rateLimiters, checkRapidTransactions } = require("../utils/rate-limiting.util");

/**
 * Fraud Detection and Prevention Service
 * Monitors transactions for suspicious patterns
 */

const FRAUD_THRESHOLDS = {
  rapidTransactions: {
    count: 5, // More than 5 transactions
    window: 3600000, // Within 1 hour
    score: 20,
  },
  unusualAmount: {
    deviation: 3, // 3x previous average
    score: 25,
  },
  newDevice: {
    score: 15,
  },
  highValue: {
    threshold: 500000, // NGN 500k
    score: 30,
  },
  multipleFailures: {
    count: 3, // 3 failures
    window: 3600000, // Within 1 hour
    score: 35,
  },
  duplicateReference: {
    score: 50, // High risk - possible replay attack
  },
  locationChange: {
    score: 20,
  },
  suspiciousPattern: {
    score: 40,
  },
};

/**
 * Calculate fraud risk score for a transaction
 * @param {object} transactionData - Transaction details
 * @param {string} userId - User ID
 * @returns {Promise<object>} Fraud assessment with score and flags
 */
const assessFraudRisk = async (transactionData, userId) => {
  try {
    let totalScore = 0;
    const flags = [];

    // 1. Check for rapid transactions
    if (checkRapidTransactions(userId, 5)) {
      totalScore += FRAUD_THRESHOLDS.rapidTransactions.score;
      flags.push("rapid_transactions");
    }

    // 2. Check for unusual amount (compared to user's history)
    const userTransactions = await Transaction.find({
      user_id: userId,
      status: "completed",
      type: transactionData.type,
    })
      .select("amount")
      .sort({ timestamp: -1 })
      .limit(10);

    if (userTransactions.length > 0) {
      const amounts = userTransactions.map((t) => t.amount);
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const maxAmount = Math.max(...amounts);

      if (
        transactionData.amount > avgAmount * 3 ||
        transactionData.amount > maxAmount * 2
      ) {
        totalScore += FRAUD_THRESHOLDS.unusualAmount.score;
        flags.push("unusual_amount");
      }
    }

    // 3. Check for high-value transactions
    if (transactionData.amount >= FRAUD_THRESHOLDS.highValue.threshold) {
      totalScore += FRAUD_THRESHOLDS.highValue.score;
      flags.push("high_value_transaction");
    }

    // 4. Check for new device
    if (
      transactionData.device_fingerprint &&
      !(await isDeviceKnown(userId, transactionData.device_fingerprint))
    ) {
      totalScore += FRAUD_THRESHOLDS.newDevice.score;
      flags.push("new_device");
    }

    // 5. Check for location changes
    if (
      transactionData.ip_address &&
      !(await isIPKnown(userId, transactionData.ip_address))
    ) {
      totalScore += FRAUD_THRESHOLDS.locationChange.score;
      flags.push("location_change");
    }

    // 6. Check for recent failed transactions
    const recentFailures = await Transaction.countDocuments({
      user_id: userId,
      status: "failed",
      timestamp: {
        $gte: new Date(Date.now() - 3600000), // Last hour
      },
    });

    if (recentFailures >= FRAUD_THRESHOLDS.multipleFailures.count) {
      totalScore += FRAUD_THRESHOLDS.multipleFailures.score;
      flags.push("multiple_failures");
    }

    // 7. Check for duplicate references (replay attack prevention)
    if (transactionData.reference) {
      const existingTxn = await Transaction.findOne({
        reference: transactionData.reference,
        status: "completed",
      });

      if (existingTxn) {
        totalScore += FRAUD_THRESHOLDS.duplicateReference.score;
        flags.push("duplicate_reference");
      }
    }

    // Determine risk level
    let riskLevel = "low";
    if (totalScore >= 75) riskLevel = "critical";
    else if (totalScore >= 50) riskLevel = "high";
    else if (totalScore >= 25) riskLevel = "medium";

    return {
      score: Math.min(totalScore, 100), // Cap at 100
      riskLevel,
      flags,
      requiresOTP: totalScore >= 30,
      requiresManualReview: totalScore >= 70,
      shouldBlock: totalScore >= 90,
    };
  } catch (error) {
    console.error("Fraud risk assessment error:", error.message);
    // Default to medium risk on error
    return {
      score: 30,
      riskLevel: "medium",
      flags: ["assessment_error"],
      requiresOTP: true,
      requiresManualReview: false,
      shouldBlock: false,
    };
  }
};

/**
 * Log suspicious activity
 * @param {string} userId - User ID
 * @param {string} reason - Fraud reason
 * @param {object} details - Additional details
 * @returns {Promise<object>} Created fraud log
 */
const logSuspiciousActivity = async (userId, reason, details = {}) => {
  try {
    const fraudLog = await FraudLog.create({
      user_id: userId,
      reason,
      risk_score: details.riskScore || 0,
      action_taken: details.actionTaken || "monitoring",
      transaction_reference: details.transactionReference,
      details: {
        previous_transactions_count: details.previousTransactionsCount,
        time_since_last_transaction: details.timeSinceLastTransaction,
        amount_variance: details.amountVariance,
        ip_address: details.ipAddress,
        device_info: details.deviceInfo,
        notes: details.notes,
      },
    });

    console.log(`⚠️ Fraud activity logged for user ${userId}: ${reason}`);
    return fraudLog;
  } catch (error) {
    console.error("Fraud logging error:", error.message);
    throw error;
  }
};

/**
 * Check if device is known to user
 * @param {string} userId - User ID
 * @param {string} deviceFingerprint - Device fingerprint
 * @returns {Promise<boolean>} True if device is known
 */
const isDeviceKnown = async (userId, deviceFingerprint) => {
  try {
    const knownDeviceTransaction = await Transaction.findOne({
      user_id: userId,
      device_fingerprint: deviceFingerprint,
      status: "completed",
    });

    return !!knownDeviceTransaction;
  } catch (error) {
    console.error("Device check error:", error.message);
    return false;
  }
};

/**
 * Check if IP is known to user
 * @param {string} userId - User ID
 * @param {string} ipAddress - IP address
 * @returns {Promise<boolean>} True if IP is known
 */
const isIPKnown = async (userId, ipAddress) => {
  try {
    const knownIPTransaction = await Transaction.findOne({
      user_id: userId,
      ip_address: ipAddress,
      status: "completed",
    });

    return !!knownIPTransaction;
  } catch (error) {
    console.error("IP check error:", error.message);
    return false;
  }
};

/**
 * Get fraud history for user
 * @param {string} userId - User ID
 * @param {number} limit - Max records to return
 * @returns {Promise<array>} Fraud logs
 */
const getUserFraudHistory = async (userId, limit = 10) => {
  try {
    const fraudLogs = await FraudLog.find({ user_id: userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select("-details.ip_address"); // Don't expose IP in response

    return fraudLogs;
  } catch (error) {
    console.error("Fraud history retrieval error:", error.message);
    throw error;
  }
};

/**
 * Get unresolved fraud issues
 * @param {number} limit - Max records to return
 * @returns {Promise<array>} Unresolved fraud logs
 */
const getUnresolvedFraudIssues = async (limit = 50) => {
  try {
    const unresolvedIssues = await FraudLog.find({ resolved: false })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate("user_id", "firstName lastName email");

    return unresolvedIssues;
  } catch (error) {
    console.error("Fraud issues retrieval error:", error.message);
    throw error;
  }
};

/**
 * Mark fraud issue as resolved
 * @param {string} fraudLogId - Fraud log ID
 * @param {string} resolvedBy - Admin ID or "system"
 * @param {string} notes - Resolution notes
 * @returns {Promise<object>} Updated fraud log
 */
const resolveFraudIssue = async (fraudLogId, resolvedBy, notes = "") => {
  try {
    const fraudLog = await FraudLog.findByIdAndUpdate(
      fraudLogId,
      {
        resolved: true,
        resolved_by: resolvedBy,
        resolution_notes: notes,
      },
      { new: true }
    );

    console.log(`✅ Fraud issue ${fraudLogId} resolved`);
    return fraudLog;
  } catch (error) {
    console.error("Fraud issue resolution error:", error.message);
    throw error;
  }
};

/**
 * Get fraud statistics
 * @param {string} period - "day", "week", "month"
 * @returns {Promise<object>} Fraud statistics
 */
const getFraudStatistics = async (period = "day") => {
  try {
    let dateFilter;
    switch (period) {
      case "week":
        dateFilter = new Date(Date.now() - 7 * 24 * 3600000);
        break;
      case "month":
        dateFilter = new Date(Date.now() - 30 * 24 * 3600000);
        break;
      default: // day
        dateFilter = new Date(Date.now() - 24 * 3600000);
    }

    const totalIncidents = await FraudLog.countDocuments({
      timestamp: { $gte: dateFilter },
    });

    const unresolvedIncidents = await FraudLog.countDocuments({
      timestamp: { $gte: dateFilter },
      resolved: false,
    });

    const blockedTransactions = await FraudLog.countDocuments({
      timestamp: { $gte: dateFilter },
      action_taken: "block",
    });

    const reasonBreakdown = await FraudLog.aggregate([
      { $match: { timestamp: { $gte: dateFilter } } },
      { $group: { _id: "$reason", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return {
      period,
      dateRange: {
        from: dateFilter,
        to: new Date(),
      },
      totalIncidents,
      unresolvedIncidents,
      blockedTransactions,
      reasonBreakdown: reasonBreakdown.map((item) => ({
        reason: item._id,
        count: item.count,
      })),
    };
  } catch (error) {
    console.error("Fraud statistics error:", error.message);
    throw error;
  }
};

module.exports = {
  assessFraudRisk,
  logSuspiciousActivity,
  isDeviceKnown,
  isIPKnown,
  getUserFraudHistory,
  getUnresolvedFraudIssues,
  resolveFraudIssue,
  getFraudStatistics,
  FRAUD_THRESHOLDS,
};
