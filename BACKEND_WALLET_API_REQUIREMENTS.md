# Secure Wallet Payment System - Backend Implementation

## Overview

This document describes the complete implementation of a **secure, wallet-based payment system** integrated into the TRI-AURA e-commerce platform. The system prioritizes:

- **Transaction Integrity**: Atomic operations, idempotent webhooks, audit trails
- **Security**: Encryption, OTP verification, rate limiting, fraud detection
- **Compliance**: No card storage, NDPR-aligned, PCI-DSS principles
- **User Experience**: OTP-protected operations, real-time balance updates

---

## Architecture

### Database Schema

#### 1. **Wallets Table** (`models/wallet.model.js`)
```javascript
{
  user_id: ObjectId (unique, indexed),
  encrypted_balance: String,              // AES-256-CBC encrypted
  encryption_key: String,                 // Encryption metadata
  status: "active" | "frozen" | "suspended",
  fraud_risk_score: Number (0-100),
  last_update_timestamp: Date,
  version: Number,                        // Optimistic locking
  metadata: {
    ip_created: String,
    device_info: String,
    created_location: String
  },
  created_at: Date,
  updated_at: Date
}
```

**Key Features:**
- Balance is **encrypted** using AES-256-CBC with per-user encryption keys
- Wallet status controls transaction eligibility (frozen/suspended wallets cannot transact)
- Fraud risk score tracks suspicious activity patterns
- Version field enables optimistic locking for concurrent update prevention

#### 2. **Transactions Table** (`models/transaction.model.js`)
```javascript
{
  transaction_id: String (unique),
  user_id: ObjectId,
  type: "funding" | "purchase" | "refund" | "admin_adjustment",
  amount: Number,
  currency: "NGN",
  previous_balance: Number,               // Audit trail
  new_balance: Number,                    // Audit trail
  reference: String (indexed),            // Flutterwave ref or order ID
  status: "pending" | "completed" | "failed" | "reversed",
  source: "wallet" | "flutterwave" | "direct_payment" | "admin",
  order_id: ObjectId,
  fraud_risk_score: Number,
  fraud_flags: [String],                  // ["rapid_transactions", "unusual_amount", ...]
  ip_address: String,
  user_agent: String,
  device_fingerprint: String,
  timestamp: Date (indexed),
  metadata: {...}
}
```

**Key Features:**
- Full audit trail with balance snapshots
- Fraud flags recorded immutably for compliance
- Device and IP tracking for pattern analysis
- Status ensures only completed transactions affect wallet

#### 3. **OTP Verifications Table**
```javascript
{
  user_id: ObjectId,
  otp_hash: String,                       // SHA-256 hash (never plain OTP)
  purpose: "wallet_funding" | "wallet_deduction" | "sensitive_action",
  transaction_reference: String,
  expires_at: Date,                       // Default: 5 minutes
  attempts: Number,
  max_attempts: Number (default: 3),
  is_used: Boolean,
  used_at: Date,
  is_locked: Boolean,
  locked_until: Date,                     // 15 min lock after max attempts
  delivery_method: "email" | "sms" | "both"
}
```

**Key Features:**
- OTP is **never stored in plain text** - only SHA-256 hash stored
- One-time use enforcement prevents replay attacks
- Automatic expiration (5 minutes)
- Rate limiting and attempt tracking prevent brute force
- Delivery method tracking for multi-channel support

#### 4. **Flutterwave Transactions Table**
```javascript
{
  flutterwave_reference: String (unique),
  user_id: ObjectId,
  amount: Number,
  currency: String,
  verification_status: "pending" | "verified" | "failed" | "duplicate",
  raw_response: Object,                   // Full Flutterwave response
  flutterwave_transaction_id: String,
  wallet_transaction_id: ObjectId,        // Links to wallet transaction
  verified_at: Date,
  webhook_signature_valid: Boolean,
  webhook_verified_at: Date,
  idempotency_key: String,                // Prevent duplicate webhooks
  error_details: {...},
  created_at: Date
}
```

**Key Features:**
- Duplicate reference detection prevents replay attacks
- Idempotency key ensures webhook events are processed only once
- Webhook signature validation ensures authenticity
- Links to wallet transaction for traceability

#### 5. **Fraud Logs Table**
```javascript
{
  user_id: ObjectId,
  reason: String,  // ["rapid_transactions", "unusual_amount", "high_value_transaction", ...]
  risk_score: Number (0-100),
  action_taken: "monitoring" | "require_otp" | "block" | "manual_review" | "escalate",
  transaction_reference: String,
  details: {
    previous_transactions_count: Number,
    time_since_last_transaction: String,
    amount_variance: Number,
    ip_address: String,
    device_info: String,
    notes: String
  },
  resolved: Boolean,
  resolved_by: String (admin ID or "system"),
  resolution_notes: String,
  timestamp: Date
}
```

**Key Features:**
- Immutable fraud audit trail
- Admin resolution tracking
- Detailed context for fraud investigation
- Multi-flag support for complex fraud patterns

---

## API Endpoints

### Base URL
```
http://localhost:7145/api/wallet
```

### Authentication
All endpoints require Bearer token in Authorization header:
```
Authorization: Bearer <JWT_TOKEN>
```

---

### 1. Get Wallet Balance
**GET** `/balance`

**Rate Limit:** 20 requests/minute

**Response:**
```json
{
  "success": true,
  "balance": 150000,
  "currency": "NGN",
  "status": "active",
  "lastUpdated": "2025-01-16T10:30:00Z",
  "fraudRiskScore": 5
}
```

**Error Cases:**
- `404 Wallet not found` - User has no wallet
- `403 Wallet is frozen/suspended` - Cannot access frozen wallets

---

### 2. Get Transaction History
**GET** `/transactions?page=1&limit=20`

**Query Parameters:**
- `page` (default: 1) - Page number for pagination
- `limit` (default: 20, max: 50) - Records per page

**Rate Limit:** 20 requests/minute

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "transaction_id": "TXN-1705405200000-abc123def456",
      "type": "funding",
      "amount": 50000,
      "currency": "NGN",
      "previous_balance": 100000,
      "new_balance": 150000,
      "status": "completed",
      "source": "flutterwave",
      "reference": "tx-1705405200000",
      "timestamp": "2025-01-16T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

---

### 3. Initiate Wallet Funding
**POST** `/fund`

**Rate Limit:** 5 requests/hour

**Request Body:**
```json
{
  "amount": 50000,
  "email": "user@example.com",
  "phone_number": "+2348012345678",
  "name": "John Doe"
}
```

**Validation Rules:**
- `amount`: Must be between 100 and 10,000,000 NGN
- `email`: Valid email format
- `phone_number`: Optional, valid phone format if provided

**Response:**
```json
{
  "success": true,
  "message": "Wallet funding initiated. Please verify with OTP.",
  "transactionReference": "FUND-1705405200000-abc123def",
  "otpExpiresIn": 300,
  "fraudRiskLevel": "medium",
  "requiresManualReview": false,
  "nextStep": "otp_verification"
}
```

**Flow:**
1. **Fraud Assessment**: Transaction is scored for fraud risk
2. **OTP Generation**: 6-digit OTP generated and sent to email
3. **Transaction Created**: Pending transaction record created
4. **Manual Review**: If high risk, flagged for admin review

**Error Cases:**
- `400 Invalid request payload` - Validation failed
- `403 Wallet is frozen` - Cannot fund frozen wallet
- `429 Too many requests` - Rate limit exceeded

---

### 4. Verify OTP
**POST** `/verify-otp`

**Rate Limit:** 3 attempts/15 minutes

**Request Body:**
```json
{
  "otp": "123456",
  "transaction_reference": "FUND-1705405200000-abc123def"
}
```

**Validation Rules:**
- `otp`: Must be exactly 6 digits
- `transaction_reference`: Must match alphanumeric pattern [a-zA-Z0-9_-]{5,100}

**Response (Funding):**
```json
{
  "success": true,
  "message": "OTP verified and wallet funded successfully",
  "newBalance": 150000,
  "transactionId": "TXN-1705405200000-abc123def456"
}
```

**Response (Purchase):**
```json
{
  "success": true,
  "message": "OTP verified and purchase completed",
  "newBalance": 100000,
  "transactionId": "TXN-1705405200000-xyz789uvw012"
}
```

**OTP Rules:**
- Valid for **5 minutes** only
- **One-time use** only (invalidated after verification)
- **Maximum 3 attempts** per OTP
- Locked for **15 minutes** after exceeding max attempts

**Error Cases:**
- `400 Invalid OTP` - Incorrect code (includes remaining attempts)
- `400 OTP has expired` - Exceeded 5-minute window
- `400 Maximum OTP attempts exceeded` - Locked for 15 minutes
- `404 Transaction not found` - Invalid or already processed reference

---

### 5. Deduct Wallet Balance (Purchase)
**POST** `/deduct`

**Rate Limit:** 10 requests/minute

**Request Body:**
```json
{
  "amount": 25000,
  "items": [
    {
      "id": "product-123",
      "name": "Product Name",
      "quantity": 2,
      "price": 12500
    }
  ],
  "notes": "Order reference or notes"
}
```

**Validation Rules:**
- `amount`: Must be between 100 and 10,000,000 NGN
- `items`: Must be a non-empty array
- `notes`: Optional, max 1000 characters

**Response (Low Risk - Auto Approved):**
```json
{
  "success": true,
  "message": "Purchase completed successfully",
  "newBalance": 125000,
  "transactionId": "TXN-1705405200000-xyz789uvw012"
}
```

**Response (High Risk - Requires OTP):**
```json
{
  "success": true,
  "message": "Fraud check required. OTP sent for verification.",
  "transactionReference": "PURCHASE-1705405200000-abc123def",
  "requiresOTP": true,
  "fraudRiskLevel": "high"
}
```

**Balance Validation:**
- Transaction rejected if `balance < amount`
- Failed transaction recorded for audit trail
- Wallet never goes negative

**Fraud Assessment:**
- Rapid transactions (>5 in 1 hour): **Requires OTP**
- Unusual amount (3x user average): **Requires OTP**
- High-value transaction (>500k): **Requires OTP** + Manual Review
- New device/location: **Flags transaction**
- Multiple recent failures: **Blocks transaction**

**Error Cases:**
- `400 Insufficient wallet balance` - Balance too low
- `403 Wallet is frozen` - Cannot transact
- `429 Too many requests` - Rate limit exceeded

---

### Flutterwave Integration Endpoints

#### Verify Flutterwave Payment
**GET** `/payment/verify?transaction_id=<FLUTTERWAVE_TRANSACTION_ID>`

**Response:**
```json
{
  "message": "Payment verified successfully. Please complete OTP verification to credit wallet.",
  "data": {
    "id": "5931620",
    "tx_ref": "tx-1705405200000",
    "amount": 50000,
    "currency": "NGN",
    "status": "successful"
  },
  "transactionReference": "tx-1705405200000",
  "nextStep": "otp_verification"
}
```

#### Flutterwave Webhook
**POST** `/payment/webhook`

**Headers:**
```
verificationhash: <FLUTTERWAVE_SIGNATURE>
```

**Request Body:**
```json
{
  "data": {
    "id": "5931620",
    "tx_ref": "tx-1705405200000",
    "amount": 50000,
    "currency": "NGN",
    "status": "successful",
    "customer": {
      "id": 1234,
      "email": "user@example.com"
    }
  }
}
```

**Key Features:**
- **Signature Verification**: HMAC-SHA256 validation prevents tampering
- **Idempotency**: Multiple webhook calls for same event processed only once
- **No Authentication**: Uses cryptographic signature instead of bearer token

---

## Security Implementation

### 1. Data Encryption
**File:** `utils/encryption.util.js`

#### Balance Encryption
```javascript
// Encrypt wallet balance
const encrypted = encrypt("150000"); // Returns: "iv_hex:encrypted_hex"

// Decrypt wallet balance
const balance = decrypt(encrypted); // Returns: "150000"
```

**Algorithm:** AES-256-CBC
- **Key Generation:** Uses `process.env.ENCRYPTION_KEY` or generates securely
- **IV:** Randomly generated for each encryption (16 bytes)
- **Prepended IV:** IV is prepended to ciphertext for decryption

#### OTP Hashing
```javascript
// Hash OTP for storage
const otpHash = hashData("123456", userId); // Returns: sha256 hash

// Verify OTP
const isValid = verifyHash("123456", storedHash, userId); // Returns: boolean
```

**Algorithm:** SHA-256 with salt (userId)
- OTP is **never stored in plain text**
- Prevents database breaches from exposing OTPs

#### Webhook Signature Generation
```javascript
const signature = generateHMAC(webhookData, FLUTTERWAVE_SECRET_KEY);
const isValid = verifyHMAC(webhookData, receivedSignature, FLUTTERWAVE_SECRET_KEY);
```

**Algorithm:** HMAC-SHA256
- Prevents webhook tampering
- Uses timing-safe comparison to prevent timing attacks

---

### 2. Authentication & Authorization

**JWT Token Structure:**
```javascript
{
  id: "user_id",
  email: "user@example.com",
  role: "user" | "seller" | "admin",
  iat: 1705405200,
  exp: 1705408800 // 1 hour expiry
}
```

**Token Validation:**
- All wallet endpoints require `Authorization: Bearer <TOKEN>`
- Token is verified using `process.env.JWT_SECRET`
- Expired tokens rejected with `401 Unauthorized`
- Invalid tokens rejected with `401 Unauthorized`

---

### 3. Rate Limiting
**File:** `utils/rate-limiting.util.js`

**Per-Operation Rate Limits:**
```javascript
{
  general: 100/minute,           // General API calls
  wallet: 20/minute,             // Balance checks, history
  funding: 5/hour,               // Wallet top-up (strictest)
  purchase: 10/minute,           // Purchase/checkout
  otpVerification: 3/15min,      // OTP attempts (brute force protection)
  otpGeneration: 3/5min,         // OTP generation (prevent spam)
  sensitiveAction: 3/hour        // Password reset, etc.
}
```

**Implementation:**
- In-memory tracking (Redis recommended for production)
- Automatic cleanup of expired windows
- Response headers include:
  - `X-RateLimit-Limit`: Maximum allowed
  - `X-RateLimit-Remaining`: Requests left
  - `X-RateLimit-Reset`: Reset time ISO string

**Rate Limit Exceeded Response (429):**
```json
{
  "message": "Too many requests. Please try again later.",
  "resetTime": "2025-01-16T10:45:00Z",
  "retryAfter": 300
}
```

---

### 4. Input Validation & Sanitization
**File:** `utils/validation.util.js`

**Validation Functions:**
```javascript
isValidEmail(email)          // RFC 5322 simplified
isValidObjectId(id)          // MongoDB ObjectId format
isValidAmount(amount, min, max)
isValidOTP(otp)              // Exactly 6 digits
isValidPhone(phone)          // International format
isValidReference(reference)  // Alphanumeric + underscore/hyphen
```

**Sanitization:**
```javascript
// Remove HTML/script injection
const clean = sanitizeString(input);  // Removes: < > " ' &

// Recursively sanitize objects
const cleanObj = sanitizeObject(req.body);
```

**Payload Validation:**
```javascript
// Validate funding request
const validated = validateFundingPayload(req.body);
if (!validated) return 400 error;

// Validate OTP submission
const validated = validateOTPPayload(req.body);

// Validate purchase
const validated = validatePurchasePayload(req.body);
```

---

### 5. OTP Verification
**File:** `services/otp.service.js`

**OTP Lifecycle:**

```
1. User initiates action (fund/purchase)
   ↓
2. Fraud assessment performed
   ↓
3. OTP generated (6 random digits)
   ↓
4. OTP hashed and stored in database
   ↓
5. OTP sent to user email
   ↓
6. User submits OTP
   ↓
7. Hash comparison (no plain text)
   ↓
8. OTP marked as used (one-time only)
   ↓
9. Transaction processed (wallet updated)
```

**OTP Expiration Logic:**
```javascript
// Automatic cleanup of expired OTPs
await OTPVerification.deleteMany({
  expires_at: { $lt: new Date() },
  is_used: true
});
```

**Attack Prevention:**
| Attack | Prevention |
|--------|-----------|
| Brute Force | 3 attempts max, 15-min lockout |
| Replay Attack | One-time use, marked as used |
| Expiration Bypass | Server-side expiry check (5 min) |
| Database Breach | Only hash stored, not plain OTP |
| Timing Attack | Timing-safe comparison for hash |

---

### 6. Fraud Detection & Prevention
**File:** `services/fraud.service.js`

**Fraud Scoring System (0-100):**

| Risk Factor | Score | Action |
|------------|-------|--------|
| Rapid transactions (5+/hour) | 20 | Monitor |
| Unusual amount (3x average) | 25 | Require OTP |
| New device | 15 | Monitor |
| High-value (>500k) | 30 | Manual review |
| Multiple failures | 35 | Block |
| Duplicate reference | 50 | **CRITICAL** |
| Location change | 20 | Monitor |

**Risk Levels:**
- **Low (0-24):** Auto-approve
- **Medium (25-49):** Require OTP
- **High (50-74):** Manual review + OTP
- **Critical (75+):** Block transaction

**Fraud Assessment Example:**
```javascript
const assessment = await assessFraudRisk({
  type: "purchase",
  amount: 150000,
  device_fingerprint: "user-agent",
  ip_address: "192.168.1.1"
}, userId);

// Returns:
{
  score: 45,           // Medium risk
  riskLevel: "medium",
  flags: ["rapid_transactions", "unusual_amount"],
  requiresOTP: true,
  requiresManualReview: false,
  shouldBlock: false
}
```

**Fraud Logging:**
```javascript
await logSuspiciousActivity(userId, "rapid_transactions", {
  riskScore: 20,
  actionTaken: "monitoring",
  transactionReference: "TXN-xxx",
  amount: 50000
});
```

---

## Business Logic Flows

### Add Funds Flow

```
┌─────────────────────────────────────────────────────────┐
│ User initiates wallet funding                          │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ Validate input      │
         │ - amount            │
         │ - email             │
         └─────────┬───────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ Assess fraud risk    │
         │ - rapid             │
         │ - unusual amount    │
         │ - high value        │
         └─────────┬───────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ Create pending      │
         │ transaction         │
         │ (status: pending)   │
         └─────────┬───────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ Generate OTP        │
         │ - 6 digits          │
         │ - Hash & store      │
         │ - 5 min expiry      │
         └─────────┬───────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ Send OTP via email  │
         └─────────┬───────────┘
                   │
                   ▼
     ┌─────────────────────────────┐
     │ User receives OTP email     │
     └──────────────┬──────────────┘
                    │
                    ▼
     ┌──────────────────────────────┐
     │ User submits OTP              │
     │ POST /api/wallet/verify-otp   │
     └──────────┬───────────────────┘
                │
                ▼
     ┌──────────────────────────────┐
     │ Verify OTP                    │
     │ - Check hash match            │
     │ - Check expiration            │
     │ - Check attempts              │
     └──────────┬───────────────────┘
                │
         ┌──────┴─────────┐
         │ Valid?         │
         └──┬──────────┬──┘
           Yes        No
            │          │
            ▼          ▼
         ┌──────┐  ┌──────────────────┐
         │Mark  │  │Increment attempts│
         │used  │  │Return error      │
         └──┬───┘  └──────────────────┘
            │
            ▼
    ┌────────────────────────────┐
    │ Update wallet balance      │
    │ - Decrypt current balance  │
    │ - Add amount               │
    │ - Encrypt new balance      │
    │ - Atomic update            │
    └─────────┬──────────────────┘
              │
              ▼
    ┌────────────────────────────┐
    │ Update transaction status  │
    │ status: pending → completed│
    │ new_balance: updated       │
    └─────────┬──────────────────┘
              │
              ▼
    ┌────────────────────────────┐
    │ Return success response    │
    │ - New balance              │
    │ - Transaction ID           │
    └────────────────────────────┘
```

### Purchase/Checkout Deduction Flow

```
┌────────────────────────────────────────────────────────────┐
│ User initiates checkout with wallet payment               │
└──────────────────┬─────────────────────────────────────────┘
                   │
                   ▼
         ┌──────────────────────┐
         │ Validate input       │
         │ - amount             │
         │ - items array        │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Get wallet           │
         │ - Decrypt balance    │
         │ - Check status       │
         └──────────┬───────────┘
                    │
         ┌──────────┴──────────┐
         │ Sufficient?         │
         └────┬────────────┬───┘
             Yes           No
              │             │
              ▼             ▼
        ┌──────────┐  ┌──────────────────┐
        │Proceed   │  │Return error      │
        └────┬─────┘  │Insufficient      │
             │        │balance           │
             │        └──────────────────┘
             ▼
    ┌────────────────────────┐
    │ Assess fraud risk      │
    │ - Check patterns       │
    │ - Calculate score      │
    └────────┬───────────────┘
             │
    ┌────────┴─────────────────┐
    │ Risk level?              │
    └┬──────────┬────────────┬─┘
     │          │            │
    Low    Medium/High     Critical
     │          │            │
     │          ▼            ▼
     │    ┌──────────────┐ ┌──────────┐
     │    │Require OTP   │ │Block     │
     │    │+ Send email  │ │Return    │
     │    │+ Create ref  │ │error     │
     │    └────┬─────────┘ │403       │
     │         │           └──────────┘
     │         │
     ▼         ▼
  ┌──────────────────────────────┐
  │ Create pending transaction   │
  │ status: pending              │
  │ fraud_flags: [...]           │
  └────────┬─────────────────────┘
           │
           ▼
  ┌──────────────────────────────┐
  │ If OTP required:             │
  │ Wait for user verification   │
  │ POST /verify-otp             │
  └────────┬─────────────────────┘
           │
           ▼
  ┌──────────────────────────────┐
  │ Deduct from wallet (atomic)  │
  │ - new_balance = balance - amt│
  │ - Encrypt new balance        │
  │ - Database transaction       │
  └────────┬─────────────────────┘
           │
           ▼
  ┌──────────────────────────────┐
  │ Update transaction           │
  │ status: pending → completed  │
  │ new_balance: updated         │
  └────────┬─────────────────────┘
           │
           ▼
  ┌──────────────────────────────┐
  │ Return success               │
  │ - New balance                │
  │ - Transaction ID             │
  └──────────────────────────────┘
```

---

## Environment Variables Required

```bash
# Database
URI=mongodb+srv://...

# Server
PORT=7145

# JWT
JWT_SECRET=your-secret-key-min-32-chars

# Email (for OTP delivery)
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-password

# Encryption
ENCRYPTION_KEY=your-32-char-hex-key (optional, auto-generated)
WALLET_ENCRYPTION_PASSWORD=secure-password

# Flutterwave
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-...
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-...
FLUTTERWAVE_ENCRYPTION_KEY=FLWSECK_TEST-...
```

---

## Testing Guide

### 1. Create User Account
```bash
POST http://localhost:7145/user/register
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

### 2. Login & Get JWT Token
```bash
POST http://localhost:7145/user/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 3. Check Wallet Balance
```bash
GET http://localhost:7145/api/wallet/balance
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "balance": 0,
  "currency": "NGN",
  "status": "active"
}
```

### 4. Initiate Wallet Funding
```bash
POST http://localhost:7145/api/wallet/fund
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "amount": 50000,
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet funding initiated. Please verify with OTP.",
  "transactionReference": "FUND-1705405200000-abc123def",
  "otpExpiresIn": 300
}
```

### 5. Verify OTP
```bash
POST http://localhost:7145/api/wallet/verify-otp
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "otp": "123456",
  "transaction_reference": "FUND-1705405200000-abc123def"
}
```

### 6. Purchase with Wallet
```bash
POST http://localhost:7145/api/wallet/deduct
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "amount": 25000,
  "items": [
    {
      "id": "product-123",
      "name": "Product",
      "quantity": 2,
      "price": 12500
    }
  ]
}
```

---

## Monitoring & Admin Functions

### Get Unresolved Fraud Issues
```bash
GET http://localhost:7145/api/admin/fraud/unresolved
Authorization: Bearer <ADMIN_TOKEN>
```

### Get Fraud Statistics
```bash
GET http://localhost:7145/api/admin/fraud/statistics?period=day
Authorization: Bearer <ADMIN_TOKEN>
```

### Freeze User Wallet
```bash
POST http://localhost:7145/api/admin/wallet/{userId}/freeze
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "reason": "Suspicious activity detected"
}
```

### Unfreeze Wallet
```bash
POST http://localhost:7145/api/admin/wallet/{userId}/unfreeze
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "reason": "Manual review completed, account cleared"
}
```

---

## Compliance & Security Checklist

✅ **Data Protection**
- Wallet balance encrypted (AES-256-CBC)
- OTP hashed, never stored plain
- No card data stored
- PII masked in logs

✅ **Transaction Integrity**
- Atomic wallet updates (MongoDB sessions)
- Immutable transaction audit trail
- Balance snapshots (previous/new)
- Double-spend prevention

✅ **Fraud Prevention**
- Risk-based scoring system
- OTP verification for high-risk
- Rate limiting per operation
- Device/IP tracking
- Duplicate transaction detection

✅ **Webhook Security**
- HMAC-SHA256 signature verification
- Idempotency keys
- One-time processing guarantee
- Signature timing-safe comparison

✅ **API Security**
- JWT authentication on all endpoints
- Rate limiting (per operation type)
- Input validation & sanitization
- HTTPS-only in production
- Error message sanitization (no stack traces)

✅ **Audit & Compliance**
- Complete transaction logs
- Fraud incident tracking
- Admin action logging
- User activity timeline
- NDPR-compliant data handling

---

## Deployment Checklist

- [ ] Set all environment variables in production `.env`
- [ ] Use secure encryption key (32+ random bytes)
- [ ] Enable HTTPS/TLS in production
- [ ] Configure MongoDB backup strategy
- [ ] Set up email service for OTP delivery
- [ ] Configure Flutterwave webhook URL
- [ ] Set up monitoring for fraud logs
- [ ] Configure admin access controls
- [ ] Test all payment flows in production environment
- [ ] Document API for client integration
- [ ] Set up incident response procedures

---

## File Structure

```
tri-aura/
├── models/
│   ├── wallet.model.js              # Wallet schema with encryption
│   ├── transaction.model.js         # Transaction, OTP, Flutterwave, Fraud schemas
│   ├── user.model.js                # (existing)
│   └── ...
├── controllers/
│   ├── wallet.controller.js         # Wallet operations
│   ├── fraud.controller.js          # Admin fraud management
│   ├── payment.controller.js        # Updated with Flutterwave webhook
│   └── ...
├── services/
│   ├── otp.service.js               # OTP generation, verification, email
│   ├── fraud.service.js             # Fraud detection & assessment
│   └── ...
├── routes/
│   ├── wallet.route.js              # Wallet API endpoints
│   ├── payment.route.js             # (updated with webhook)
│   └── ...
├── utils/
│   ├── encryption.util.js           # AES-256, hashing, HMAC
│   ├── rate-limiting.util.js        # Rate limiting middleware
│   ├── validation.util.js           # Input validation & sanitization
│   └── ...
├── index.js                         # Main server (updated with wallet routes)
└── .env                             # Environment variables
```

---

## Support & Troubleshooting

### Common Issues

**Issue:** OTP not received
- Check email configuration in `.env`
- Verify EMAIL_USER and EMAIL_PASS are correct
- Check spam folder
- Ensure user email is correct

**Issue:** Wallet balance not updating
- Verify encryption password matches
- Check database connection
- Look for transaction status (must be "completed")
- Check fraud logs for blocks

**Issue:** Rate limit exceeded
- Implement exponential backoff in client
- Check rate limit headers in response
- Use retry-after header value

**Issue:** Flutterwave webhook not processing
- Verify webhook signature configuration
- Check webhook URL is publicly accessible
- Ensure FLUTTERWAVE_SECRET_KEY is correct
- Look for duplicate processing (idempotency key)

---

**Version:** 1.0.0  
**Last Updated:** January 16, 2026  
**Maintainer:** Backend Development Team
