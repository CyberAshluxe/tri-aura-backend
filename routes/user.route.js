const express = require('express');
const {
  getSignup,
  postRegister,
  getSignIn,
  postLogin,
  postSignIn,
  getProfile,
  getDashboard,
  postGoogleAuth  // Add this
} = require('../controllers/user.controller');

const router = express.Router();

// Signup
router.get('/signup', getSignup);
router.post('/register', postRegister);

// Signin
router.get('/signin', getSignIn);
router.post('/login', postLogin);
router.post('/signin', postSignIn);

// Profile
router.get('/profile', getProfile);

// Dashboard
router.get('/dashboard', getDashboard);

// Google OAuth (ADD THIS LINE)
router.post('/google-auth', postGoogleAuth);

module.exports = router;
