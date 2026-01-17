/**
 * Input Validation Utilities
 * Prevents injection attacks and ensures data integrity
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
};

/**
 * Validate MongoDB ObjectId
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid ObjectId format
 */
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Validate amount (positive number)
 * @param {number|string} amount - Amount to validate
 * @param {number} min - Minimum allowed amount
 * @param {number} max - Maximum allowed amount
 * @returns {boolean} True if valid amount
 */
const isValidAmount = (amount, min = 100, max = 10000000) => {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num >= min && num <= max;
};

/**
 * Validate OTP format (6 digits)
 * @param {string} otp - OTP to validate
 * @returns {boolean} True if valid OTP format
 */
const isValidOTP = (otp) => {
  return /^\d{6}$/.test(String(otp));
};

/**
 * Validate phone number (basic validation)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate transaction reference format
 * @param {string} reference - Transaction reference
 * @returns {boolean} True if valid reference format
 */
const isValidReference = (reference) => {
  // Allow alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]{5,100}$/.test(reference);
};

/**
 * Sanitize string input (prevent injection)
 * @param {string} input - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .replace(/[<>\"'&]/g, (char) => {
      const escapeMap = {
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
        "&": "&amp;",
      };
      return escapeMap[char];
    })
    .substring(0, 1000); // Limit length
};

/**
 * Sanitize object recursively (prevent injection in nested objects)
 * @param {object} obj - Object to sanitize
 * @returns {object} Sanitized object
 */
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key
    const cleanKey = sanitizeString(key);

    // Sanitize value based on type
    if (typeof value === "string") {
      sanitized[cleanKey] = sanitizeString(value);
    } else if (typeof value === "object" && value !== null) {
      sanitized[cleanKey] = sanitizeObject(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      sanitized[cleanKey] = value;
    }
    // Skip null, undefined, functions
  }
  return sanitized;
};

/**
 * Validate and extract wallet funding payload
 * @param {object} payload - Raw request payload
 * @returns {object|null} Validated payload or null if invalid
 */
const validateFundingPayload = (payload) => {
  const errors = [];

  // Check required fields
  if (!payload.amount) errors.push("amount is required");
  if (!payload.email) errors.push("email is required");

  // Validate amount
  if (payload.amount && !isValidAmount(payload.amount)) {
    errors.push("Invalid amount format or value");
  }

  // Validate email
  if (payload.email && !isValidEmail(payload.email)) {
    errors.push("Invalid email format");
  }

  // Validate phone if provided
  if (payload.phone_number && !isValidPhone(payload.phone_number)) {
    errors.push("Invalid phone number format");
  }

  if (errors.length > 0) {
    return null;
  }

  return {
    amount: parseFloat(payload.amount),
    email: sanitizeString(payload.email),
    phone_number: sanitizeString(payload.phone_number || ""),
    name: sanitizeString(payload.name || ""),
  };
};

/**
 * Validate OTP verification payload
 * @param {object} payload - Raw request payload
 * @returns {object|null} Validated payload or null if invalid
 */
const validateOTPPayload = (payload) => {
  const errors = [];

  if (!payload.otp) errors.push("otp is required");
  if (!payload.transaction_reference)
    errors.push("transaction_reference is required");

  if (payload.otp && !isValidOTP(payload.otp)) {
    errors.push("OTP must be 6 digits");
  }

  if (payload.transaction_reference && !isValidReference(payload.transaction_reference)) {
    errors.push("Invalid transaction reference format");
  }

  if (errors.length > 0) {
    return null;
  }

  return {
    otp: sanitizeString(payload.otp),
    transaction_reference: sanitizeString(payload.transaction_reference),
  };
};

/**
 * Validate purchase/deduction payload
 * @param {object} payload - Raw request payload
 * @returns {object|null} Validated payload or null if invalid
 */
const validatePurchasePayload = (payload) => {
  const errors = [];

  if (!payload.amount) errors.push("amount is required");
  if (!payload.items) errors.push("items is required");

  if (payload.amount && !isValidAmount(payload.amount)) {
    errors.push("Invalid amount format or value");
  }

  if (payload.items && !Array.isArray(payload.items)) {
    errors.push("items must be an array");
  }

  if (errors.length > 0) {
    return null;
  }

  return {
    amount: parseFloat(payload.amount),
    items: sanitizeObject(payload.items || []),
    notes: sanitizeString(payload.notes || ""),
  };
};

/**
 * Validate Flutterwave webhook payload
 * @param {object} payload - Webhook payload
 * @returns {object|null} Validated payload or null if invalid
 */
const validateFlutterwaveWebhook = (payload) => {
  const errors = [];

  if (!payload.data) errors.push("Webhook data missing");
  if (!payload.data?.tx_ref) errors.push("Transaction reference missing");
  if (!payload.data?.id) errors.push("Flutterwave transaction ID missing");

  if (errors.length > 0) {
    return null;
  }

  return {
    transaction_id: payload.data.id,
    tx_ref: sanitizeString(payload.data.tx_ref),
    status: sanitizeString(payload.data.status || ""),
    amount: parseFloat(payload.data.amount || 0),
    currency: sanitizeString(payload.data.currency || "NGN"),
    customer: sanitizeObject(payload.data.customer || {}),
    metadata: sanitizeObject(payload.data.metadata || {}),
  };
};

/**
 * Validation middleware factory
 * @param {function} validateFn - Validation function
 * @returns {function} Express middleware
 */
const createValidationMiddleware = (validateFn) => {
  return (req, res, next) => {
    const validated = validateFn(req.body);
    if (!validated) {
      return res.status(400).json({
        message: "Invalid request payload",
        details: "Request validation failed",
      });
    }
    req.validatedData = validated;
    next();
  };
};

module.exports = {
  isValidEmail,
  isValidObjectId,
  isValidAmount,
  isValidOTP,
  isValidPhone,
  isValidReference,
  sanitizeString,
  sanitizeObject,
  validateFundingPayload,
  validateOTPPayload,
  validatePurchasePayload,
  validateFlutterwaveWebhook,
  createValidationMiddleware,
};
