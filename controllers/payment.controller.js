require("dotenv").config();
const Flutterwave = require('flutterwave-node-v3');
const User = require("../models/user.model");

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
      // Update user payment history if needed
      const userId = req.user.id;
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

      res.json({ message: "Payment verified successfully", data: response.data });
    } else {
      res.status(400).json({ message: "Payment verification failed", data: response ? response.data : null });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ message: "Payment verification failed", error: error.message });
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
  getPaymentHistory
};
