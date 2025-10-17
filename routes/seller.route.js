const express = require('express');
const { getSignup, postRegister, getLogin, postLogin } = require('../controllers/seller.controller');

const router = express.Router();

// Signup
router.get('/signup', getSignup);
router.post('/register', postRegister);

// Login
router.get('/login', getLogin);
router.post('/login', postLogin);

module.exports = router;
