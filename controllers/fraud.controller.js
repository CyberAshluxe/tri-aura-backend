const { FraudLog } = require("../models/transaction.model");
const {
  getUnresolvedFraudIssues,
  resolveFraudIssue,
  getFraudStatistics,
  getUserFraudHistory,
} = require("../services/fraud.service");
const Wallet = require("../models/wallet.model");

/**
 * Admin Controller for Fraud & Wallet Management
 */

/**
 * Get unresolved fraud issues (admin only)
 * GET /api/admin/fraud/unresolved
 */
const getUnresolvedFraudIssues_handler = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const issues = await getUnresolvedFraudIssues(limit);

    res.json({
      success: true,
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("Get unresolved fraud issues error:", error.message);
    res.status(500).json({
      message: "Failed to retrieve unresolved fraud issues",
      details: error.message,
    });
  }
};

/**
 * Get fraud statistics
 * GET /api/admin/fraud/statistics
 */
const getFraudStats = async (req, res) => {
  try {
    const period = req.query.period || "day"; // day, week, month
    const stats = await getFraudStatistics(period);

    res.json({
      success: true,
      statistics: stats,
    });
  } catch (error) {
    console.error("Get fraud statistics error:", error.message);
    res.status(500).json({
      message: "Failed to retrieve fraud statistics",
      details: error.message,
    });
  }
};

/**
 * Resolve fraud issue (mark as reviewed by admin)
 * PUT /api/admin/fraud/:fraudLogId
 */
const resolveFraudIssue_handler = async (req, res) => {
  try {
    const { fraudLogId } = req.params;
    const { action, notes } = req.body;
    const adminId = req.user.id;

    // Validate action
    const validActions = ["approve", "block", "investigate"];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        message: "Invalid action. Must be: approve, block, or investigate",
      });
    }

    const fraudLog = await resolveFraudIssue(fraudLogId, adminId, notes);

    res.json({
      success: true,
      message: `Fraud issue ${action}ed`,
      fraudLog,
    });
  } catch (error) {
    console.error("Resolve fraud issue error:", error.message);
    res.status(500).json({
      message: "Failed to resolve fraud issue",
      details: error.message,
    });
  }
};

/**
 * Get user fraud history
 * GET /api/admin/fraud/user/:userId
 */
const getUserFraudHistory_handler = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const history = await getUserFraudHistory(userId, limit);

    res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error("Get user fraud history error:", error.message);
    res.status(500).json({
      message: "Failed to retrieve user fraud history",
      details: error.message,
    });
  }
};

/**
 * Freeze wallet (admin action)
 * POST /api/admin/wallet/:userId/freeze
 */
const freezeWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const wallet = await Wallet.findOneAndUpdate(
      { user_id: userId },
      {
        status: "frozen",
        last_updated_by: "admin",
        metadata: {
          ...this.metadata,
          frozen_by_admin: req.user.id,
          frozen_reason: reason,
          frozen_at: new Date(),
        },
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    res.json({
      success: true,
      message: "Wallet frozen successfully",
      wallet,
    });
  } catch (error) {
    console.error("Freeze wallet error:", error.message);
    res.status(500).json({
      message: "Failed to freeze wallet",
      details: error.message,
    });
  }
};

/**
 * Unfreeze wallet (admin action)
 * POST /api/admin/wallet/:userId/unfreeze
 */
const unfreezeWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const wallet = await Wallet.findOneAndUpdate(
      { user_id: userId },
      {
        status: "active",
        last_updated_by: "admin",
        metadata: {
          ...this.metadata,
          unfrozen_by_admin: req.user.id,
          unfreeze_reason: reason,
          unfrozen_at: new Date(),
        },
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    res.json({
      success: true,
      message: "Wallet unfrozen successfully",
      wallet,
    });
  } catch (error) {
    console.error("Unfreeze wallet error:", error.message);
    res.status(500).json({
      message: "Failed to unfreeze wallet",
      details: error.message,
    });
  }
};

/**
 * Get wallet details (admin only)
 * GET /api/admin/wallet/:userId
 */
const getWalletDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const wallet = await Wallet.findOne({ user_id: userId }).select(
      "-encryption_key"
    );

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    res.json({
      success: true,
      wallet: {
        userId: wallet.user_id,
        status: wallet.status,
        fraudRiskScore: wallet.fraud_risk_score,
        createdAt: wallet.created_at,
        updatedAt: wallet.updated_at,
        lastUpdated: wallet.last_update_timestamp,
        version: wallet.version,
      },
    });
  } catch (error) {
    console.error("Get wallet details error:", error.message);
    res.status(500).json({
      message: "Failed to retrieve wallet details",
      details: error.message,
    });
  }
};

module.exports = {
  getUnresolvedFraudIssues: getUnresolvedFraudIssues_handler,
  getFraudStats,
  resolveFraudIssue: resolveFraudIssue_handler,
  getUserFraudHistory: getUserFraudHistory_handler,
  freezeWallet,
  unfreezeWallet,
  getWalletDetails,
};
