# Security Implementation Guide
**Priority**: Critical Path to Production  
**Target**: Complete security gap fixes

---

## 1. AUTHORIZATION MIDDLEWARE (HIGH PRIORITY)

Create new file: `middleware/authorization.middleware.js`

```javascript
/**
 * Role-Based Authorization Middleware
 * Ensures users can only access endpoints appropriate for their role
 */

const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${req.user.role}` 
      });
    }

    next();
  };
};

/**
 * Resource Owner Verification Middleware
 * Ensures users can only modify their own resources
 */
const authorizeResourceOwner = (resourceField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    const resourceId = req.body[resourceField] || req.params[resourceField];
    
    // Admin can modify any resource
    if (req.user.role === 'admin') {
      return next();
    }

    // Regular users can only modify their own resources
    if (String(req.user.id) !== String(resourceId)) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only modify your own resources" 
      });
    }

    next();
  };
};

/**
 * Multi-role Authorization with conditions
 */
const authorizeWithCondition = (rolesAndConditions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    const userRole = req.user.role;
    const condition = rolesAndConditions[userRole];

    if (!condition) {
      return res.status(403).json({ 
        success: false, 
        message: `Role '${userRole}' is not authorized for this action` 
      });
    }

    if (typeof condition === 'function' && !condition(req)) {
      return res.status(403).json({ 
        success: false, 
        message: "Access condition not met" 
      });
    }

    next();
  };
};

module.exports = {
  authorizeRole,
  authorizeResourceOwner,
  authorizeWithCondition
};
```

### Usage in Routes

```javascript
const { authorizeRole, authorizeResourceOwner } = require("../middleware/authorization.middleware");

// Admin only endpoint
router.post("/admin/users", 
  authenticateToken,
  authorizeRole('admin'),
  adminController.getAllUsers
);

// Admin or seller viewing their own wallet
router.get("/wallet/:userId",
  authenticateToken,
  authorizeResourceOwner('userId'),
  getWalletBalance
);

// Admin or user with conditions
router.post("/withdraw",
  authenticateToken,
  authorizeRole('user', 'seller'),
  withdrawFunds
);
```

---

## 2. AUDIT LOGGING SYSTEM (MEDIUM PRIORITY)

### Create Audit Log Model: `models/audit.model.js`

```javascript
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  // What action was performed
  action: {
    type: String,
    enum: [
      'LOGIN',
      'LOGOUT',
      'REGISTER',
      'PASSWORD_CHANGE',
      'FAILED_LOGIN',
      'FAILED_OTP',
      'WALLET_FUND',
      'WALLET_DEDUCT',
      'TRANSACTION_CREATED',
      'TRANSACTION_COMPLETED',
      'TRANSACTION_FAILED',
      'ADMIN_ACCESS',
      'DATA_EXPORT',
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      'SUSPICIOUS_ACTIVITY',
      'PAYMENT_INITIATED',
      'PAYMENT_COMPLETED',
      'PAYMENT_FAILED',
      'REFUND_ISSUED',
    ],
    required: true,
    index: true,
  },

  // Who performed the action
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true,
  },
  user_email: String,
  user_role: String,

  // What resource was affected
  resource_type: {
    type: String,
    enum: ['USER', 'TRANSACTION', 'WALLET', 'ADMIN', 'PAYMENT', 'OTP'],
    index: true,
  },
  resource_id: {
    type: String,
    index: true,
  },

  // Status and result
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'PARTIAL'],
    default: 'SUCCESS',
    index: true,
  },

  // Request details
  ip_address: String,
  user_agent: String,
  method: String, // GET, POST, PUT, DELETE
  endpoint: String,
  request_body: mongoose.Schema.Types.Mixed, // Log inputs (sanitize sensitive data)
  response_status: Number,

  // Details about what happened
  details: {
    description: String,
    error_message: String,
    changes: mongoose.Schema.Types.Mixed, // What was changed
    old_value: mongoose.Schema.Types.Mixed,
    new_value: mongoose.Schema.Types.Mixed,
  },

  // Security and context
  severity: {
    type: String,
    enum: ['INFO', 'WARNING', 'CRITICAL'],
    default: 'INFO',
    index: true,
  },
  device_fingerprint: String,
  session_id: String,

  // Timing
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  duration_ms: Number, // How long the action took

  // Metadata
  tags: [String], // For custom filtering
  compliance_relevant: Boolean, // For audit compliance
},
{ 
  timestamps: true,
  collection: 'auditLogs',
  // Prevent modification after creation
  strict: 'throw'
});

// Create indexes for common queries
auditLogSchema.index({ user_id: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resource_id: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 }); // For retention policies

module.exports = mongoose.model("AuditLog", auditLogSchema);
```

### Create Audit Service: `services/audit.service.js`

```javascript
const AuditLog = require("../models/audit.model");

/**
 * Log an action to the audit trail
 */
const logAction = async (auditData) => {
  try {
    const {
      action,
      user_id,
      user_email,
      user_role,
      resource_type,
      resource_id,
      status = 'SUCCESS',
      ip_address,
      user_agent,
      method,
      endpoint,
      request_body,
      response_status,
      details = {},
      severity = 'INFO',
      device_fingerprint,
      session_id,
      duration_ms,
      tags = [],
      compliance_relevant = false,
    } = auditData;

    // Sanitize request body to remove sensitive data
    const sanitizedBody = sanitizeRequestBody(request_body);

    const auditLog = await AuditLog.create({
      action,
      user_id,
      user_email,
      user_role,
      resource_type,
      resource_id,
      status,
      ip_address,
      user_agent,
      method,
      endpoint,
      request_body: sanitizedBody,
      response_status,
      details,
      severity,
      device_fingerprint,
      session_id,
      duration_ms,
      tags,
      compliance_relevant,
      timestamp: new Date(),
    });

    console.log(`📋 [Audit] ${action} by ${user_email || 'Anonymous'} - ${status}`);
    return auditLog;
  } catch (error) {
    console.error("❌ Audit log creation error:", error.message);
    // Don't throw - audit failures shouldn't crash the app
  }
};

/**
 * Get audit logs with filtering
 */
const getAuditLogs = async (filters = {}, limit = 100, skip = 0) => {
  try {
    const {
      user_id,
      action,
      resource_type,
      severity,
      startDate,
      endDate,
      status,
    } = filters;

    const query = {};

    if (user_id) query.user_id = user_id;
    if (action) query.action = action;
    if (resource_type) query.resource_type = resource_type;
    if (severity) query.severity = severity;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await AuditLog.countDocuments(query);

    return {
      logs,
      total,
      limit,
      skip,
      pages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error("Error retrieving audit logs:", error.message);
    throw error;
  }
};

/**
 * Sanitize request body to remove sensitive data
 */
const sanitizeRequestBody = (body) => {
  if (!body) return null;

  const sensitiveFields = [
    'password',
    'pin',
    'otp',
    'cvv',
    'card_number',
    'token',
    'apiKey',
    'secret',
    'authorization',
  ];

  const sanitized = JSON.parse(JSON.stringify(body)); // Deep copy

  const sanitizeObj = (obj) => {
    for (const key in obj) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '***REDACTED***';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObj(obj[key]);
      }
    }
  };

  sanitizeObj(sanitized);
  return sanitized;
};

/**
 * Create middleware to automatically log actions
 */
const createAuditMiddleware = () => {
  return (req, res, next) => {
    // Store original response.json
    const originalJson = res.json;

    // Override response.json to capture response
    res.json = function(data) {
      const startTime = req.startTime || Date.now();
      const duration = Date.now() - startTime;

      // Log only for significant actions (POST, PUT, DELETE)
      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        logAction({
          action: req.auditAction || req.method,
          user_id: req.user?.id,
          user_email: req.user?.email,
          user_role: req.user?.role,
          resource_type: req.auditResource,
          resource_id: req.auditResourceId,
          status: res.statusCode >= 200 && res.statusCode < 300 ? 'SUCCESS' : 'FAILURE',
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          method: req.method,
          endpoint: req.originalUrl,
          request_body: req.body,
          response_status: res.statusCode,
          severity: res.statusCode >= 400 ? 'WARNING' : 'INFO',
          details: {
            description: `${req.method} ${req.originalUrl}`,
            response: data,
          },
          duration_ms: duration,
        }).catch(err => console.error("Failed to log action:", err));
      }

      // Call original json
      return originalJson.call(this, data);
    };

    // Track start time
    req.startTime = Date.now();
    next();
  };
};

module.exports = {
  logAction,
  getAuditLogs,
  sanitizeRequestBody,
  createAuditMiddleware,
};
```

### Integration in index.js

```javascript
// Add to main index.js
const { createAuditMiddleware } = require("./services/audit.service");

// Apply audit middleware to all requests
app.use(createAuditMiddleware());

// Example: Add audit endpoint for admins
app.get("/admin/audit-logs", authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { user_id, action, severity, startDate, endDate } = req.query;
    const { logs, total, pages } = await getAuditLogs(
      { user_id, action, severity, startDate, endDate },
      req.query.limit || 50,
      req.query.skip || 0
    );

    res.json({
      success: true,
      data: logs,
      total,
      pages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

---

## 3. SECURE CORS CONFIGURATION (HIGH PRIORITY)

Update `index.js`:

```javascript
const cors = require('cors');
const helmet = require('helmet');

// Define allowed origins
const allowedOrigins = [
  'https://triora-six.vercel.app',
  'https://yourdomain.com',
  process.env.FRONTEND_URL, // From env
];

// Development only
if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
}

// Configure CORS
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://triora-six.vercel.app'],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
}));

// HTTPS redirect
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}
```

---

## 4. PAYMENT TOKENIZATION (CRITICAL PRIORITY)

Create: `services/payment-tokenization.service.js`

```javascript
const Flutterwave = require('flutterwave-node-v3');
const { encrypt, decrypt } = require('../utils/encryption.util');

let flw;
if (process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY) {
  flw = new Flutterwave(
    process.env.FLUTTERWAVE_PUBLIC_KEY,
    process.env.FLUTTERWAVE_SECRET_KEY
  );
}

/**
 * Create a payment token from card details
 * NEVER store raw card data - always tokenize
 */
const tokenizeCard = async (cardData) => {
  try {
    if (!flw) {
      throw new Error('Flutterwave not initialized');
    }

    // Validate card data
    const { cardNumber, cvv, expiryMonth, expiryYear } = cardData;
    
    if (!cardNumber || !cvv || !expiryMonth || !expiryYear) {
      throw new Error('Incomplete card information');
    }

    // Create token request
    const tokenPayload = {
      card_number: cardNumber,
      cvv: cvv,
      expiry_month: expiryMonth,
      expiry_year: expiryYear,
    };

    // Call Flutterwave tokenization API
    const response = await flw.Card.create_token(tokenPayload);

    if (response && response.status === 'success') {
      return {
        success: true,
        token: response.data.token,
        card_last_4: cardNumber.slice(-4),
        card_type: detectCardType(cardNumber),
      };
    } else {
      throw new Error('Tokenization failed: ' + (response?.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('❌ Card tokenization error:', error.message);
    throw error;
  }
};

/**
 * Create a payment using a token (not raw card data)
 */
const initiateTokenizedPayment = async (userId, paymentData) => {
  try {
    if (!flw) {
      throw new Error('Flutterwave not initialized');
    }

    const { token, amount, currency, email } = paymentData;

    if (!token || !amount || !email) {
      throw new Error('Missing required payment data');
    }

    // Use token instead of raw card data
    const payload = {
      token: token,
      currency: currency || 'NGN',
      amount: amount,
      email: email,
      tx_ref: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      redirect_url: `${process.env.API_URL}/payment/verify`,
    };

    const response = await flw.Charge.card(payload);

    if (response.status === 'success') {
      return {
        success: true,
        transactionId: response.data.id,
        status: response.data.status,
        authUrl: response.data.auth_url,
      };
    } else {
      throw new Error('Payment initiation failed: ' + response.message);
    }
  } catch (error) {
    console.error('❌ Tokenized payment error:', error.message);
    throw error;
  }
};

/**
 * Store encrypted token (NOT card data)
 */
const storePaymentToken = async (userId, token, cardLast4, cardType) => {
  try {
    const PaymentToken = require('../models/payment-token.model');

    const encryptedToken = encrypt(token);

    const savedToken = await PaymentToken.create({
      user_id: userId,
      token: encryptedToken, // Encrypted
      card_last_4: cardLast4,
      card_type: cardType,
      is_default: false,
      created_at: new Date(),
    });

    return savedToken;
  } catch (error) {
    console.error('❌ Error storing payment token:', error.message);
    throw error;
  }
};

/**
 * Retrieve and decrypt stored token
 */
const getPaymentToken = async (tokenId) => {
  try {
    const PaymentToken = require('../models/payment-token.model');
    const stored = await PaymentToken.findById(tokenId);

    if (!stored) {
      throw new Error('Token not found');
    }

    // Decrypt token before returning (only in memory)
    const decryptedToken = decrypt(stored.token);

    return {
      token: decryptedToken,
      card_last_4: stored.card_last_4,
      card_type: stored.card_type,
    };
  } catch (error) {
    console.error('❌ Error retrieving payment token:', error.message);
    throw error;
  }
};

/**
 * Detect card type from number
 */
const detectCardType = (cardNumber) => {
  const patterns = {
    visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    mastercard: /^5[1-5][0-9]{14}$/,
    amex: /^3[47][0-9]{13}$/,
    discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cardNumber.replace(/\s/g, ''))) {
      return type;
    }
  }

  return 'unknown';
};

module.exports = {
  tokenizeCard,
  initiateTokenizedPayment,
  storePaymentToken,
  getPaymentToken,
  detectCardType,
};
```

### Create Payment Token Model: `models/payment-token.model.js`

```javascript
const mongoose = require('mongoose');

const paymentTokenSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Encrypted token - NEVER raw card data
  token: {
    type: String,
    required: true,
  },
  // Last 4 digits for display only
  card_last_4: String,
  card_type: String, // visa, mastercard, amex
  is_default: {
    type: Boolean,
    default: false,
  },
  // Expiry tracking
  expires_at: Date,
  is_active: {
    type: Boolean,
    default: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
  // Audit
  last_used: Date,
  use_count: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

module.exports = mongoose.model('PaymentToken', paymentTokenSchema);
```

### Update Payment Controller

```javascript
// Replace initiatePayment in payment.controller.js

const initiatePayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cardNumber, cvv, expiryMonth, expiryYear, amount, currency, email } = req.body;

    // Step 1: Tokenize the card
    const tokenResult = await tokenizeCard({
      cardNumber,
      cvv,
      expiryMonth,
      expiryYear,
    });

    if (!tokenResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Card tokenization failed',
      });
    }

    // Step 2: Store encrypted token
    await storePaymentToken(
      userId,
      tokenResult.token,
      tokenResult.card_last_4,
      tokenResult.card_type
    );

    // Step 3: Initiate payment using token (NOT raw card)
    const paymentResult = await initiateTokenizedPayment(userId, {
      token: tokenResult.token,
      amount,
      currency,
      email,
    });

    return res.json({
      success: true,
      transactionId: paymentResult.transactionId,
      status: paymentResult.status,
      authUrl: paymentResult.authUrl,
    });

  } catch (error) {
    console.error('Payment error:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { initiatePayment };
```

---

## Installation & Dependencies

Add to `package.json`:

```bash
npm install helmet
npm install express-rate-limit  # Consider migrating from in-memory
npm install redis  # For production rate limiting
npm install winston  # For structured logging
```

---

## Testing Checklist

- [ ] Test authorization middleware blocks unauthorized users
- [ ] Test role-based access control on admin endpoints
- [ ] Test audit logs are created for all transactions
- [ ] Test CORS only allows whitelisted origins
- [ ] Test payment tokenization doesn't store raw cards
- [ ] Test encrypted token storage
- [ ] Test rate limiting prevents brute force
- [ ] Test input validation on all endpoints
- [ ] Test audit log export functionality
- [ ] Test security headers are present

---

## Deployment Checklist

```bash
# 1. Install new dependencies
npm install helmet express-rate-limit redis

# 2. Create new files
- middleware/authorization.middleware.js
- services/audit.service.js
- services/payment-tokenization.service.js
- models/audit.model.js
- models/payment-token.model.js

# 3. Update configuration
- Update index.js with CORS, Helmet, audit middleware
- Update payment controller to use tokenization
- Update routes with authorization middleware

# 4. Environment variables
FRONTEND_URL=https://yourdomain.com
API_URL=https://api.yourdomain.com
NODE_ENV=production
ENCRYPTION_KEY=<secure-random-key>

# 5. Database migrations
# Run audit log schema creation
# Run payment token schema creation

# 6. Testing
npm test

# 7. Deploy
git push
```
