const express = require('express');
const { getSignup, postRegister, getLogin, postLogin, getDashboard } = require('../controllers/admin.controller');

const router = express.Router();

// Signup
router.get('/signup', getSignup);
router.post('/register', postRegister);

// Login
router.get('/login', getLogin);
router.post('/login', postLogin);

// Dashboard
router.get('/dashboard', getDashboard);

module.exports = router;
