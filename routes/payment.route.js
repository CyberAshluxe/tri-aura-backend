const express = require('express');
const {
  initiatePayment,
  completePayment,
  verifyPayment,
  getPaymentHistory
} = require('../controllers/payment.controller');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ message: "Invalid authorization header" });

  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const router = express.Router();

// Test payment page (no auth required for testing)
router.get('/test', (req, res) => {
  const publicKey = process.env.FLUTTERWAVE_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).send('Flutterwave public key not configured');
  }
  res.render('payment_test', { publicKey });
});

// Payment callback for test page
router.get('/test/callback', (req, res) => {
  res.send(`
    <h1>Payment Callback</h1>
    <p>Transaction ID: ${req.query.transaction_id || 'N/A'}</p>
    <p>Status: ${req.query.tx_ref ? 'Completed' : 'Unknown'}</p>
    <a href="/payment/test">Back to Test Page</a>
  `);
});

// All payment routes require authentication
router.use(authenticateToken);

// Initiate payment
router.post('/initiate', initiatePayment);

// Complete payment with authorization data (PIN, OTP, etc.)
router.post('/complete', completePayment);

// Verify payment (callback from Flutterwave)
router.get('/verify', verifyPayment);

// Get payment history
router.get('/history', getPaymentHistory);

module.exports = router;
