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

    let wallet = await Wallet.findOne({ user_id: userId });
    
    // Auto-create wallet if it doesn't exist
    if (!wallet) {
      try {
        // Create encrypted zero balance using setBalance method pattern
        const tempWallet = new Wallet({
          user_id: userId,
          encrypted_balance: "0",
          encryption_key: ENCRYPTION_PASSWORD,
          status: "active",
        });
        // Use the setBalance method to properly encrypt
        tempWallet.setBalance(0, ENCRYPTION_PASSWORD);
        wallet = await tempWallet.save();
        console.log(`✅ Auto-created wallet for user ${userId}`);
      } catch (walletCreateErr) {
        console.error("Failed to auto-create wallet:", walletCreateErr.message);
        return res.status(500).json({
          message: "Failed to create wallet",
          details: walletCreateErr.message,
        });
      }
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
  let session;
  try {
    // Get session from mongoose connection
    const mongoose = require("mongoose");
    session = await mongoose.startSession();
    session.startTransaction();

    const userId = req.user.id;
    const { amount, email } = req.validatedData;

    console.log(`🔵 [initiateWalletFunding] Starting wallet funding for user ${userId}`);
    console.log(`🔵 [initiateWalletFunding] Amount: ${amount}, Email: ${email}`);

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      await session.abortTransaction();
      await session.endSession();
      console.error(`❌ User not found: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`✅ User found: ${user.email}`);

    // Ensure wallet exists
    let wallet = await Wallet.findOne({ user_id: userId }).session(session);
    if (!wallet) {
      console.log(`📝 Creating new wallet for user ${userId}`);
      wallet = await Wallet.create([{
        user_id: userId,
        encrypted_balance: encrypt("0"),
        encryption_key: ENCRYPTION_PASSWORD,
        status: "active",
      }], { session });
      wallet = wallet[0];
      console.log(`✅ Wallet created: ${wallet._id}`);
    } else {
      console.log(`✅ Existing wallet found: ${wallet._id}`);
    }

    if (wallet.status !== "active") {
      await session.abortTransaction();
      await session.endSession();
      console.error(`❌ Wallet status is ${wallet.status}`);
      return res.status(403).json({
        message: `Wallet is ${wallet.status}. Cannot fund at this time.`,
      });
    }

    console.log(`✅ Wallet status is active, proceeding with fraud assessment`);

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

    console.log(`✅ Fraud assessment completed - Score: ${fraudAssessment.score}, Level: ${fraudAssessment.riskLevel}`);

    // Create pending transaction record
    const transactionRef = `FUND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`📝 [initiateWalletFunding] Creating transaction with reference: ${transactionRef}`);
    
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
    
    console.log(`✅ [initiateWalletFunding] Transaction created with ID: ${transaction[0]._id}`);

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
    let otpResult;
    try {
      console.log(`📝 [initiateWalletFunding] Creating OTP for wallet funding, user: ${userId}`);
      otpResult = await createOTP(userId, "wallet_funding", {
        transactionReference: transactionRef,
      });
      console.log(`✅ [initiateWalletFunding] OTP created successfully. OTP ID: ${otpResult.otpId}`);
    } catch (otpError) {
      console.error(`❌ [initiateWalletFunding] OTP creation failed:`, otpError.message);
      console.error(`❌ [initiateWalletFunding] Stack:`, otpError.stack);
      await session.abortTransaction();
      await session.endSession();
      return res.status(500).json({
        success: false,
        message: "Failed to generate OTP",
        details: otpError.message,
      });
    }

    // Send OTP via email
    let emailSent = false;
    try {
      console.log(`📧 [initiateWalletFunding] Sending OTP email to: ${user.email}`);
      await sendOTPEmail(user.email, otpResult.otp, "wallet_funding");
      console.log(`✅ [initiateWalletFunding] OTP email sent successfully to ${user.email}`);
      emailSent = true;
    } catch (emailError) {
      console.error(`❌ [initiateWalletFunding] OTP email send failed:`, emailError.message);
      console.error(`❌ [initiateWalletFunding] Email error type:`, emailError.constructor.name);
      console.error(`❌ [initiateWalletFunding] Email error stack:`, emailError.stack);
      console.warn(`⚠️ [initiateWalletFunding] OTP was created but email delivery failed. User must request resend.`);
    }

    res.json({
      success: true,
      message: emailSent ? "Wallet funding initiated. OTP sent to your email." : "Wallet funding initiated. OTP generated but email send failed. Please request to resend OTP.",
      transactionReference: transactionRef,
      otpExpiresIn: otpResult.expiresIn,
      otpSent: emailSent,
      fraudRiskLevel: fraudAssessment.riskLevel,
      requiresManualReview: fraudAssessment.requiresManualReview,
      nextStep: "otp_verification",
      warning: !emailSent ? "Email delivery failed. Check your email or request OTP resend." : null,
    });
  } catch (error) {
    console.error("❌ Wallet funding initiation error:", error.message);
    console.error("Stack trace:", error.stack);
    try {
      await session.abortTransaction();
    } catch (sessionError) {
      console.error("Error aborting transaction:", sessionError.message);
    }
    res.status(500).json({
      message: "Failed to initiate wallet funding",
      details: error.message,
    });
  } finally {
    try {
      await session.endSession();
    } catch (sessionError) {
      console.error("Error ending session:", sessionError.message);
    }
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
    let { otp, transaction_reference } = req.validatedData;
    const { ObjectId } = require("mongoose").Types;
    const { OTPVerification } = require("../models/transaction.model");

    console.log(`🔵 [verifyWalletOTP] Looking for transaction with reference: ${transaction_reference}`);
    console.log(`🔵 [verifyWalletOTP] User ID: ${userId}`);

    // First, try to find the transaction
    let transaction = await Transaction.findOne({
      user_id: userId,
      reference: transaction_reference,
      status: "pending",
    });

    let otpPurpose = "wallet_funding"; // Default purpose - changed from wallet_deduction

    // If no transaction found and reference looks like an ObjectId, it might be an otpId
    if (!transaction && ObjectId.isValid(transaction_reference)) {
      console.log(`🔍 [verifyWalletOTP] No transaction found. Checking if reference is an OTP ID...`);
      
      const otpRecord = await OTPVerification.findById(transaction_reference);
      
      if (otpRecord) {
        console.log(`✅ [verifyWalletOTP] Found OTP record with ID: ${otpRecord._id}`);
        console.log(`✅ [verifyWalletOTP] OTP purpose: ${otpRecord.purpose}`);
        otpPurpose = otpRecord.purpose;
        
        // If OTP has a transaction_reference, try to find the transaction
        if (otpRecord.transaction_reference) {
          console.log(`🔍 [verifyWalletOTP] OTP has stored transaction_reference: ${otpRecord.transaction_reference}`);
          transaction = await Transaction.findOne({
            user_id: userId,
            reference: otpRecord.transaction_reference,
            status: "pending",
          });
          
          if (transaction) {
            console.log(`✅ [verifyWalletOTP] Found transaction using OTP's stored reference!`);
          }
        }
      }
    }

    // Verify OTP first (regardless of whether transaction exists)
    console.log(`🔍 [verifyWalletOTP] Verifying OTP for purpose: ${otpPurpose}`);
    const otpVerification = await verifyOTP(userId, otp, otpPurpose);
    console.log(`✅ [verifyWalletOTP] OTP verified successfully`);

    // If no transaction exists after OTP verification, that's OK for standalone OTP verification
    if (!transaction) {
      console.log(`⚠️ [verifyWalletOTP] No associated transaction found, but OTP is valid`);
      return res.json({
        success: true,
        message: "OTP verified successfully",
        otpId: otpVerification.otpId,
        purpose: otpPurpose,
      });
    }
    
    console.log(`✅ [verifyWalletOTP] Transaction found: ${transaction._id}`);

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
      let otpResult;
      try {
        console.log(`📝 [deductWalletBalance] Creating OTP for wallet deduction, user: ${userId}`);
        otpResult = await createOTP(userId, "wallet_deduction", {
          transactionReference: transactionRef,
        });
        console.log(`✅ [deductWalletBalance] OTP created successfully. OTP ID: ${otpResult.otpId}`);
      } catch (otpError) {
        console.error(`❌ [deductWalletBalance] OTP creation failed:`, otpError.message);
        console.error(`❌ [deductWalletBalance] Stack:`, otpError.stack);
        await session.abortTransaction();
        await session.endSession();
        return res.status(500).json({
          success: false,
          message: "Failed to generate OTP for fraud verification",
          details: otpError.message,
        });
      }

      const user = await User.findById(userId);
      let emailSent = false;
      try {
        console.log(`📧 [deductWalletBalance] Sending OTP email to: ${user.email}`);
        await sendOTPEmail(user.email, otpResult.otp, "wallet_deduction");
        console.log(`✅ [deductWalletBalance] OTP email sent successfully to ${user.email}`);
        emailSent = true;
      } catch (emailError) {
        console.error(`❌ [deductWalletBalance] OTP email send failed:`, emailError.message);
        console.error(`❌ [deductWalletBalance] Email error type:`, emailError.constructor.name);
        console.error(`❌ [deductWalletBalance] Email error stack:`, emailError.stack);
        console.warn(`⚠️ [deductWalletBalance] OTP was created but email delivery failed.`);
      }

      await session.commitTransaction();
      return res.json({
        success: true,
        message: emailSent ? "Fraud check required. OTP sent for verification." : "Fraud check required. OTP generated but email send failed. Please request to resend OTP.",
        transactionReference: transactionRef,
        requiresOTP: true,
        otpSent: emailSent,
        fraudRiskLevel: fraudAssessment.riskLevel,
        warning: !emailSent ? "Email delivery failed. Check your email or request OTP resend." : null,
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

/**
 * Send OTP for wallet operation
 * POST /api/wallet/otp/send
 * Body: { purpose, email }
 * purpose: 'wallet_funding' | 'wallet_deduction'
 */
const sendWalletOTP = async (req, res) => {
  try {
    console.log("🔵 [sendWalletOTP] Request received");
    console.log("🔵 [sendWalletOTP] req.user:", req.user);
    console.log("🔵 [sendWalletOTP] req.validatedData:", req.validatedData);
    console.log("🔵 [sendWalletOTP] req.body:", req.body);
    
    const userId = req.user?.id;
    if (!userId) {
      console.error("❌ [sendWalletOTP] No user ID found in request");
      return res.status(401).json({
        message: "Authentication required",
        error: "No user ID in request"
      });
    }
    
    // Validate request has validatedData
    if (!req.validatedData) {
      console.error("❌ [sendWalletOTP] No validatedData in request");
      console.error("❌ [sendWalletOTP] req.body was:", req.body);
      return res.status(400).json({
        message: "Invalid request payload",
        error: "Validation failed"
      });
    }

    const { purpose, email } = req.validatedData;
    console.log(`📨 [sendWalletOTP] Sending OTP for user ${userId}, purpose: ${purpose}, email: ${email}`);

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      console.error(`❌ [sendWalletOTP] User not found: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }
    console.log(`✅ [sendWalletOTP] User found: ${user.email}`);

    // Check if user already has a pending OTP for this purpose
    let existingOTP;
    try {
      existingOTP = await getOTPStatus(userId, purpose);
      console.log(`✅ [sendWalletOTP] OTP status checked:`, existingOTP);
    } catch (err) {
      console.error("❌ [sendWalletOTP] Error checking existing OTP:", err.message);
      existingOTP = { exists: false };
    }

    if (existingOTP.exists && existingOTP.isValid) {
      console.log(`⏱️ [sendWalletOTP] OTP already exists for user ${userId}`);
      return res.status(429).json({
        message: "OTP already sent. Please check your email.",
        expiresIn: existingOTP.expiresIn,
        attempts: existingOTP.attempts,
      });
    }

    // Create OTP
    let otpResult;
    try {
      console.log(`📝 [sendWalletOTP] Creating OTP for purpose: ${purpose}`);
      otpResult = await createOTP(userId, purpose, {
        blockIfExists: false,
      });
      console.log(`✅ [sendWalletOTP] OTP created successfully. otpResult:`, otpResult);
    } catch (otpError) {
      console.error("❌ [sendWalletOTP] Failed to create OTP:", otpError.message);
      console.error("❌ [sendWalletOTP] Stack trace:", otpError.stack);
      return res.status(500).json({
        message: "Failed to create OTP",
        details: otpError.message,
      });
    }

    // Send OTP via email
    try {
      console.log(`📧 [sendWalletOTP] Sending OTP email to ${email}`);
      await sendOTPEmail(email, otpResult.otp, purpose);
      console.log(`✅ [sendWalletOTP] OTP email sent to ${email} for ${purpose}`);
    } catch (emailError) {
      console.error("❌ [sendWalletOTP] Failed to send OTP email:", emailError.message);
      console.error("❌ [sendWalletOTP] Email error stack:", emailError.stack);
      return res.status(500).json({
        message: "Failed to send OTP email",
        details: emailError.message,
      });
    }

    res.json({
      success: true,
      message: `OTP sent to ${email}`,
      expiresIn: otpResult.expiresIn, // 300 seconds = 5 minutes
      otpId: otpResult.otpId,
      transactionReference: otpResult.otpId, // Use otpId as transactionReference for verification
    });
  } catch (error) {
    console.error("❌ Send OTP error:", error.message);
    console.error("Stack:", error.stack);
    res.status(500).json({
      message: "Failed to send OTP",
      details: error.message,
    });
  }
};

/**
 * Get OTP status
 * GET /api/wallet/otp/status
 * Query params: purpose
 */
const getWalletOTPStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { purpose } = req.query;

    console.log(`🔍 Checking OTP status for user ${userId}, purpose: ${purpose}`);

    if (!purpose) {
      return res.status(400).json({
        message: "purpose query parameter is required",
      });
    }

    // Validate purpose
    const validPurposes = ["wallet_funding", "wallet_deduction"];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({
        message: "Invalid OTP purpose",
        validPurposes,
      });
    }

    let otpStatus;
    try {
      otpStatus = await getOTPStatus(userId, purpose);
      console.log(`✅ OTP status retrieved: exists=${otpStatus.exists}, isValid=${otpStatus.isValid}`);
    } catch (err) {
      console.error("Error getting OTP status:", err.message);
      throw err;
    }

    res.json({
      success: true,
      purpose,
      ...otpStatus,
    });
  } catch (error) {
    console.error("❌ Get OTP status error:", error.message);
    console.error("Stack:", error.stack);
    res.status(500).json({
      message: "Failed to get OTP status",
      details: error.message,
    });
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
  sendWalletOTP,
  getWalletOTPStatus,
};
