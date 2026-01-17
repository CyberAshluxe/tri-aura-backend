require("dotenv").config();
const Wallet = require("../models/wallet.model");
const {
  Transaction,
  FlutterwaveTransaction,
  FraudLog,
} = require("../models/transaction.model");
const User = require("../models/user.model");
const {
  createOTP,
  sendOTPEmail,
  verifyOTP,
  getOTPStatus,
} = require("../services/otp.service");
const {
  assessFraudRisk,
  logSuspiciousActivity,
} = require("../services/fraud.service");
const { encrypt, decrypt } = require("../utils/encryption.util");

/**
 * Wallet Controller
 * Handles wallet operations: balance retrieval, funding, deduction, OTP verification
 */

// Use a secure encryption password (in production, use a key management service)
const ENCRYPTION_PASSWORD = process.env.WALLET_ENCRYPTION_PASSWORD || "default-wallet-key";

/**
 * Get wallet balance for authenticated user
 * GET /api/wallet/balance
 */
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    const wallet = await Wallet.findOne({ user_id: userId });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    if (wallet.status !== "active") {
      return res.status(403).json({
        message: `Wallet is ${wallet.status}. Operations not allowed.`,
      });
    }

    // Decrypt balance
    const balance = wallet.getBalance(ENCRYPTION_PASSWORD);

    res.json({
      success: true,
      balance: balance,
      currency: "NGN",
      status: wallet.status,
      lastUpdated: wallet.last_update_timestamp,
      fraudRiskScore: wallet.fraud_risk_score,
    });
  } catch (error) {
    console.error("Get wallet balance error:", error.message);
    res.status(500).json({
      message: "Failed to retrieve wallet balance",
      details: error.message,
    });
  }
};

/**
 * Get transaction history for authenticated user
 * GET /api/wallet/transactions
 */
const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user_id: userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "-device_fingerprint -ip_address -user_agent -metadata.ip_address"
      ); // Exclude sensitive info

    const total = await Transaction.countDocuments({ user_id: userId });

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get transaction history error:", error.message);
    res.status(500).json({
      message: "Failed to retrieve transaction history",
      details: error.message,
    });
  }
};

/**
 * Initiate wallet funding
 * POST /api/wallet/fund
 * Requires: amount, email
 */
const initiateWalletFunding = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { amount, email } = req.validatedData;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure wallet exists
    let wallet = await Wallet.findOne({ user_id: userId }).session(session);
    if (!wallet) {
      wallet = await Wallet.create([{
        user_id: userId,
        encrypted_balance: encrypt("0"),
        encryption_key: ENCRYPTION_PASSWORD,
        status: "active",
      }], { session });
      wallet = wallet[0];
    }

    if (wallet.status !== "active") {
      await session.abortTransaction();
      return res.status(403).json({
        message: `Wallet is ${wallet.status}. Cannot fund at this time.`,
      });
    }

    // Assess fraud risk before processing
    const fraudAssessment = await assessFraudRisk(
      {
        type: "funding",
        amount,
        device_fingerprint: req.headers["user-agent"],
        ip_address: req.ip,
      },
      userId
    );

    // Create pending transaction record
    const transactionRef = `FUND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const transaction = await Transaction.create([{
      transaction_id: `TXN-${Date.now()}`,
      user_id: userId,
      type: "funding",
      amount,
      currency: "NGN",
      previous_balance: wallet.getBalance(ENCRYPTION_PASSWORD),
      new_balance: wallet.getBalance(ENCRYPTION_PASSWORD), // Will update after verification
      reference: transactionRef,
      status: "pending",
      source: "flutterwave",
      fraud_risk_score: fraudAssessment.score,
      fraud_flags: fraudAssessment.flags,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      device_fingerprint: req.headers["user-agent"],
    }], { session });

    // If high risk, log and require additional verification
    if (fraudAssessment.requiresManualReview) {
      await logSuspiciousActivity(userId, "high_value_transaction", {
        riskScore: fraudAssessment.score,
        actionTaken: "manual_review",
        transactionReference: transactionRef,
        amount,
      });
    }

    await session.commitTransaction();

    // Generate OTP for wallet funding
    const otpResult = await createOTP(userId, "wallet_funding", {
      transactionReference: transactionRef,
    });

    // Send OTP via email
    try {
      await sendOTPEmail(email, otpResult.otp, "wallet_funding");
    } catch (emailError) {
      console.error("Failed to send OTP email:", emailError.message);
      // Continue anyway, OTP is generated
    }

    res.json({
      success: true,
      message: "Wallet funding initiated. Please verify with OTP.",
      transactionReference: transactionRef,
      otpExpiresIn: otpResult.expiresIn,
      fraudRiskLevel: fraudAssessment.riskLevel,
      requiresManualReview: fraudAssessment.requiresManualReview,
      nextStep: "otp_verification",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Wallet funding initiation error:", error.message);
    res.status(500).json({
      message: "Failed to initiate wallet funding",
      details: error.message,
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Verify OTP for wallet operations
 * POST /api/wallet/verify-otp
 * Requires: otp, transaction_reference
 */
const verifyWalletOTP = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp, transaction_reference } = req.validatedData;

    // Get the pending transaction
    const transaction = await Transaction.findOne({
      user_id: userId,
      reference: transaction_reference,
      status: "pending",
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Transaction not found or already processed",
      });
    }

    // Verify OTP
    const otpVerification = await verifyOTP(userId, otp, transaction.type === "funding" ? "wallet_funding" : "wallet_deduction");

    // OTP verified - now process the transaction
    if (transaction.type === "funding") {
      // Process wallet funding
      const wallet = await Wallet.findOne({ user_id: userId });
      const currentBalance = wallet.getBalance(ENCRYPTION_PASSWORD);
      const newBalance = currentBalance + transaction.amount;

      // Update wallet with new balance (atomic operation)
      await Wallet.updateBalanceAtomic(
        userId,
        newBalance,
        ENCRYPTION_PASSWORD,
        "user_action"
      );

      // Update transaction as completed
      transaction.status = "completed";
      transaction.new_balance = newBalance;
      await transaction.save();

      res.json({
        success: true,
        message: "OTP verified and wallet funded successfully",
        newBalance,
        transactionId: transaction.transaction_id,
      });
    } else if (transaction.type === "purchase") {
      // Process wallet deduction
      const wallet = await Wallet.findOne({ user_id: userId });
      const currentBalance = wallet.getBalance(ENCRYPTION_PASSWORD);

      if (currentBalance < transaction.amount) {
        return res.status(400).json({
          message: "Insufficient wallet balance",
          currentBalance,
          required: transaction.amount,
        });
      }

      const newBalance = currentBalance - transaction.amount;

      // Update wallet with new balance (atomic operation)
      await Wallet.updateBalanceAtomic(
        userId,
        newBalance,
        ENCRYPTION_PASSWORD,
        "user_action"
      );

      // Update transaction as completed
      transaction.status = "completed";
      transaction.new_balance = newBalance;
      await transaction.save();

      res.json({
        success: true,
        message: "OTP verified and purchase completed",
        newBalance,
        transactionId: transaction.transaction_id,
      });
    }
  } catch (error) {
    console.error("OTP verification error:", error.message);
    res.status(400).json({
      message: "OTP verification failed",
      details: error.message,
    });
  }
};

/**
 * Credit wallet after Flutterwave payment verification
 * POST /api/wallet/credit (Internal - called by payment verification)
 */
const creditWalletFromFlutterwave = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { userId, amount, flutterwaveRef, transactionId } = req.body;

    // Verify Flutterwave transaction exists
    const flwTransaction = await FlutterwaveTransaction.findOne({
      flutterwave_reference: flutterwaveRef,
      verification_status: "verified",
    }).session(session);

    if (!flwTransaction) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Flutterwave transaction not found or not verified",
      });
    }

    // Check for duplicate credit (idempotency)
    if (flwTransaction.wallet_transaction_id) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Wallet already credited for this payment",
        transactionId: flwTransaction.wallet_transaction_id,
      });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ user_id: userId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Wallet not found" });
    }

    // Get current balance
    const previousBalance = wallet.getBalance(ENCRYPTION_PASSWORD);
    const newBalance = previousBalance + amount;

    // Update wallet
    wallet.setBalance(newBalance, ENCRYPTION_PASSWORD);
    wallet.last_updated_by = "system";
    await wallet.save({ session });

    // Create transaction record
    const transaction = await Transaction.create([{
      transaction_id: transactionId,
      user_id: userId,
      type: "funding",
      amount,
      currency: "NGN",
      previous_balance: previousBalance,
      new_balance: newBalance,
      reference: flutterwaveRef,
      status: "completed",
      source: "flutterwave",
      fraud_risk_score: 0,
      fraud_flags: [],
      metadata: {
        payment_method: "flutterwave",
      },
    }], { session });

    // Link Flutterwave transaction to wallet transaction
    flwTransaction.wallet_transaction_id = transaction[0]._id;
    await flwTransaction.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Wallet credited successfully",
      transactionId: transaction[0]._id,
      newBalance,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Wallet credit error:", error.message);
    res.status(500).json({
      message: "Failed to credit wallet",
      details: error.message,
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Deduct wallet balance for purchase
 * POST /api/wallet/deduct
 * Requires: amount, items
 */
const deductWalletBalance = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { amount, items, notes } = req.validatedData;

    // Get wallet
    const wallet = await Wallet.findOne({ user_id: userId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Wallet not found" });
    }

    if (wallet.status !== "active") {
      await session.abortTransaction();
      return res.status(403).json({
        message: `Wallet is ${wallet.status}. Cannot process transaction.`,
      });
    }

    // Check balance
    const currentBalance = wallet.getBalance(ENCRYPTION_PASSWORD);
    if (currentBalance < amount) {
      // Create failed transaction record
      await Transaction.create([{
        transaction_id: `TXN-${Date.now()}`,
        user_id: userId,
        type: "purchase",
        amount,
        currency: "NGN",
        previous_balance: currentBalance,
        new_balance: currentBalance,
        status: "failed",
        source: "wallet",
        fraud_risk_score: 0,
        fraud_flags: [],
        ip_address: req.ip,
        metadata: {
          failure_reason: "insufficient_balance",
          items: items,
        },
      }], { session });

      await session.abortTransaction();
      return res.status(400).json({
        message: "Insufficient wallet balance",
        currentBalance,
        required: amount,
        shortfall: amount - currentBalance,
      });
    }

    // Assess fraud risk
    const fraudAssessment = await assessFraudRisk(
      {
        type: "purchase",
        amount,
        device_fingerprint: req.headers["user-agent"],
        ip_address: req.ip,
      },
      userId
    );

    // Create pending transaction
    const transactionRef = `PURCHASE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const transaction = await Transaction.create([{
      transaction_id: `TXN-${Date.now()}`,
      user_id: userId,
      type: "purchase",
      amount,
      currency: "NGN",
      previous_balance: currentBalance,
      new_balance: currentBalance - amount,
      reference: transactionRef,
      status: "pending",
      source: "wallet",
      fraud_risk_score: fraudAssessment.score,
      fraud_flags: fraudAssessment.flags,
      order_details: { items },
      ip_address: req.ip,
      device_fingerprint: req.headers["user-agent"],
      metadata: {
        notes: notes,
      },
    }], { session });

    // If high risk, require OTP
    if (fraudAssessment.requiresOTP) {
      const otpResult = await createOTP(userId, "wallet_deduction", {
        transactionReference: transactionRef,
      });

      const user = await User.findById(userId);
      try {
        await sendOTPEmail(user.email, otpResult.otp, "wallet_deduction");
      } catch (emailError) {
        console.error("OTP email send error:", emailError.message);
      }

      await session.commitTransaction();
      return res.json({
        success: true,
        message: "Fraud check required. OTP sent for verification.",
        transactionReference: transactionRef,
        requiresOTP: true,
        fraudRiskLevel: fraudAssessment.riskLevel,
      });
    }

    // Low risk - process immediately
    const newBalance = currentBalance - amount;
    wallet.setBalance(newBalance, ENCRYPTION_PASSWORD);
    wallet.last_updated_by = "user_action";
    await wallet.save({ session });

    transaction[0].status = "completed";
    transaction[0].new_balance = newBalance;
    await transaction[0].save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Purchase completed successfully",
      newBalance,
      transactionId: transaction[0]._id,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Wallet deduction error:", error.message);
    res.status(500).json({
      message: "Failed to process purchase",
      details: error.message,
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Create wallet for new user (called during user registration)
 * Internal endpoint
 */
const createUserWallet = async (userId) => {
  try {
    const existingWallet = await Wallet.findOne({ user_id: userId });
    if (existingWallet) {
      return existingWallet;
    }

    const wallet = await Wallet.create({
      user_id: userId,
      encrypted_balance: encrypt("0"),
      encryption_key: ENCRYPTION_PASSWORD,
      status: "active",
    });

    console.log(`✅ Wallet created for user ${userId}`);
    return wallet;
  } catch (error) {
    console.error("Wallet creation error:", error.message);
    throw error;
  }
};

module.exports = {
  getWalletBalance,
  getTransactionHistory,
  initiateWalletFunding,
  verifyWalletOTP,
  creditWalletFromFlutterwave,
  deductWalletBalance,
  createUserWallet,
};
