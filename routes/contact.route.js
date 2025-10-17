const express = require('express');
const { postContact } = require('../controllers/contact.controller');

const router = express.Router();

// POST /api/contact
router.post('/', postContact);

module.exports = router;
