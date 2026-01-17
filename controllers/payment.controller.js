require("dotenv").config();
const Flutterwave = require('flutterwave-node-v3');
const User = require("../models/user.model");
const { FlutterwaveTransaction } = require("../models/transaction.model");
const { verifyHMAC } = require("../utils/encryption.util");

// Initialize Flutterwave client safely
let flw;
if (process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY) {
  try {
    flw = new Flutterwave(process.env.FLUTTERWAVE_PUBLIC_KEY, process.env.FLUTTERWAVE_SECRET_KEY);
    console.log("✅ Flutterwave client initialized successfully");
  } catch (initErr) {
    console.error("❌ Failed to initialize Flutterwave client:", initErr.message);
    flw = null;
  }
} else {
  console.error("❌ FLUTTERWAVE_PUBLIC_KEY and FLUTTERWAVE_SECRET_KEY are not configured in environment variables");
  console.log("Please add them to your .env file to enable payments");
  flw = null;
}

// Initiate Payment
const initiatePayment = async (req, res) => {
  if (!flw) {
    return res.status(500).json({ message: "Payment service not initialized. Please configure Flutterwave keys." });
  }

  try {
    const { amount, currency, email, phone_number, name } = req.body;

    // Get user from token (assuming middleware sets req.user)
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const payload = {
      card_number: "5531886652142950",
      cvv: "564",
      expiry_month: "09",
      expiry_year: "32",
      currency: currency || "NGN",
      amount: amount,
      email: email || user.email,
      phone_number: phone_number,
      fullname: name || `${user.firstName} ${user.lastName}`,
      tx_ref: `tx-${Date.now()}`,
      redirect_url: "http://localhost:7145/payment/verify",
      enckey: process.env.FLUTTERWAVE_ENCRYPTION_KEY,
    };

    console.log("Initiating payment with payload:", payload); // Debug log
    const response = await flw.Charge.card(payload);
    console.log("Flutterwave response:", JSON.stringify(response, null, 2)); // Debug log
    if (response && response.meta && response.meta.authorization && response.meta.authorization.mode === 'pin') {
      return res.json({
        message: "PIN required",
        mode: 'pin',
        transactionId: response.data ? response.data.id : null
      });
    } else if (response && response.meta && response.meta.authorization && response.meta.authorization.mode === 'redirect') {
      return res.json({
        message: "Redirect to bank",
        mode: 'redirect',
        link: response.meta.authorization.redirect
      });
    } else {
      // OTP or other modes
      return res.json({
        message: "OTP or other verification required",
        mode: response && response.meta && response.meta.authorization ? response.meta.authorization.mode : 'unknown',
        transactionId: response && response.data ? response.data.id : null
      });
    }
  } catch (error) {
    console.error("Payment initiation error:", error);
    res.status(500).json({ message: "Payment initiation failed", error: error.message });
  }
};

// Verify Payment
const verifyPayment = async (req, res) => {
  if (!flw) {
    return res.status(500).json({ message: "Payment service not initialized. Please configure Flutterwave keys." });
  }

  try {
    const { transaction_id } = req.query;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const response = await flw.Transaction.verify({ id: transaction_id });
    
    if (response && response.data && response.data.status === "successful") {
      const userId = req.user.id;
      const txRef = response.data.tx_ref;
      const amount = response.data.amount;

      // Check for duplicate verification (idempotency)
      const existingFWTransaction = await FlutterwaveTransaction.findOne({
        flutterwave_reference: txRef,
        user_id: userId,
      });

      if (existingFWTransaction && existingFWTransaction.verification_status === "verified") {
        // Already verified - return success but don't double-credit
        return res.json({
          message: "Payment already verified",
          data: response.data,
          alreadyVerified: true,
        });
      }

      // Create/update Flutterwave transaction record
      const fwTransaction = await FlutterwaveTransaction.findOneAndUpdate(
        { flutterwave_reference: txRef, user_id: userId },
        {
          user_id: userId,
          amount,
          currency: response.data.currency || "NGN",
          verification_status: "verified",
          raw_response: response.data,
          flutterwave_transaction_id: transaction_id,
          verified_at: new Date(),
          webhook_signature_valid: true,
        },
        { upsert: true, new: true }
      );

      // Update user payment history
      await User.findByIdAndUpdate(userId, {
        $push: {
          paymentHistory: {
            transactionId: transaction_id,
            amount: response.data.amount,
            currency: response.data.currency,
            status: "successful",
            date: new Date()
          }
        }
      });

      // Note: Wallet crediting happens via OTP verification flow
      // The user will verify their OTP and then wallet is credited

      res.json({
        message: "Payment verified successfully. Please complete OTP verification to credit wallet.",
        data: response.data,
        transactionReference: txRef,
        nextStep: "otp_verification"
      });
    } else {
      // Verification failed
      const txRef = response?.data?.tx_ref;
      if (txRef) {
        await FlutterwaveTransaction.findOneAndUpdate(
          { flutterwave_reference: txRef, user_id: req.user.id },
          {
            verification_status: "failed",
            error_details: {
              message: "Payment verification failed",
              details: response?.data,
            },
          },
          { upsert: true }
        );
      }

      res.status(400).json({
        message: "Payment verification failed",
        data: response ? response.data : null
      });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      message: "Payment verification failed",
      error: error.message
    });
  }
};

/**
 * Webhook endpoint for Flutterwave payment notifications
 * POST /payment/webhook
 * Webhook signature verification required
 */
const handleFlutterwaveWebhook = async (req, res) => {
  try {
    const hash = req.headers["verificationhash"];
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    const verifyHash = require("crypto")
      .createHmac("sha256", process.env.FLUTTERWAVE_SECRET_KEY)
      .update(body)
      .digest("hex");

    if (hash !== verifyHash) {
      console.error("❌ Invalid webhook signature");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { data } = req.body;
    if (!data || data.status !== "successful") {
      return res.json({ message: "Not a successful payment event" });
    }

    const txRef = data.tx_ref;
    const userId = data.customer?.id; // Should contain user ID in metadata

    // Check for duplicate webhook (idempotency)
    const existingTransaction = await FlutterwaveTransaction.findOne({
      flutterwave_reference: txRef,
      webhook_verified_at: { $exists: true },
    });

    if (existingTransaction) {
      console.log(`✅ Webhook already processed for ${txRef}`);
      return res.json({ message: "Webhook already processed" });
    }

    // Update Flutterwave transaction record
    await FlutterwaveTransaction.findOneAndUpdate(
      { flutterwave_reference: txRef },
      {
        verification_status: "verified",
        raw_response: data,
        webhook_signature_valid: true,
        webhook_verified_at: new Date(),
      },
      { upsert: true }
    );

    console.log(`✅ Webhook processed for transaction ${txRef}`);
    res.json({ message: "Webhook processed" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({
      message: "Webhook processing failed",
      error: error.message
    });
  }
};

// Complete Payment with Authorization Data (PIN, OTP, etc.)
const completePayment = async (req, res) => {
  if (!flw) {
    return res.status(500).json({ message: "Payment service not initialized. Please configure Flutterwave keys." });
  }

  try {
    const { transactionId, authorization } = req.body; // authorization: { mode: 'pin', pin: '1234' } or { mode: 'otp', otp: '123456' }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const payload = {
      otp: authorization.pin || authorization.otp, // Use pin or otp based on mode
      flw_ref: authorization.flw_ref || `FLW-${Date.now()}` // Add flw_ref if not provided
    };

    console.log("Completing payment with payload:", payload); // Debug log
    const response = await flw.Charge.validate(payload);
    console.log("Flutterwave validation response:", JSON.stringify(response, null, 2)); // Debug log

    if (response && response.status === 'success') {
      // Update user payment history
      const userId = req.user.id;
      await User.findByIdAndUpdate(userId, {
        $push: {
          paymentHistory: {
            transactionId: transactionId,
            amount: response.data ? response.data.amount : 0,
            currency: response.data ? response.data.currency : 'NGN',
            status: "successful",
            date: new Date()
          }
        }
      });

      res.json({ message: "Payment completed successfully", data: response.data });
    } else {
      res.status(400).json({ message: "Payment completion failed", data: response });
    }
  } catch (error) {
    console.error("Payment completion error:", error);
    res.status(500).json({ message: "Payment completion failed", error: error.message });
  }
};

// Get Payment History
const getPaymentHistory = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const userId = req.user.id;
    const user = await User.findById(userId).select('paymentHistory');
    res.json({ paymentHistory: user.paymentHistory || [] });
  } catch (error) {
    console.error("Get payment history error:", error);
    res.status(500).json({ message: "Failed to retrieve payment history" });
  }
};

module.exports = {
  initiatePayment,
  completePayment,
  verifyPayment,
  handleFlutterwaveWebhook,
  getPaymentHistory
};
