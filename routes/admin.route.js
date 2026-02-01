const express = require('express');
const { getSignup, postRegister, getLogin, postLogin, getDashboard } = require('../controllers/admin.controller');
const adminAuthMiddleware = require('../middleware/admin-auth.middleware');

// Authentication middleware (from JWT)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Token missing" });
  }

  const jwt = require("jsonwebtoken");
  jwt.verify(token, process.env.JWT_SECRET || "fallback_secret", (err, user) => {
    if (err) {
      console.log("❌ Token verification failed:", err.message);
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

const router = express.Router();

// ===== PUBLIC ROUTES (No authentication required) =====
// Signup
router.get('/signup', getSignup);
router.post('/register', postRegister);

// Login
router.get('/login', getLogin);
router.post('/login', postLogin);

// ===== PROTECTED ROUTES (Must be logged in AND be admin) =====
// Dashboard - ONLY authenticated admins can access
router.get('/dashboard', authenticateToken, adminAuthMiddleware, getDashboard);

module.exports = router;
