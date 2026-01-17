# Wallet System - Developer Quick Reference

## 🚀 Getting Started

### 1. Installation
No additional npm packages needed - all dependencies already in `package.json`:
- `mongoose` - Database
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT auth
- `nodemailer` - Email OTP delivery
- `flutterwave-node-v3` - Payment gateway

### 2. Environment Variables
```bash
# Database
URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# JWT & Security
JWT_SECRET=your-secret-key-32-chars-minimum
ENCRYPTION_KEY=your-32-char-hex-encryption-key
WALLET_ENCRYPTION_PASSWORD=secure-password

# Email (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password  # NOT your regular password

# Flutterwave (from dashboard)
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-xxx
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxx
FLUTTERWAVE_ENCRYPTION_KEY=FLWSECK_TESTxxx
```

### 3. Start Server
```bash
npm install   # Install dependencies
node index.js # Start server
# Server running on port 7145
```

---

## 📁 File Structure Quick Reference

```
controllers/
  ├── wallet.controller.js      # Wallet operations (6 functions)
  ├── fraud.controller.js       # Admin fraud management (6 functions)
  └── payment.controller.js     # (Updated) Flutterwave integration

models/
  ├── wallet.model.js           # Wallet schema + methods
  └── transaction.model.js      # Transaction, OTP, Flutterwave, Fraud schemas

services/
  ├── otp.service.js            # OTP lifecycle management
  └── fraud.service.js          # Fraud detection & assessment

routes/
  ├── wallet.route.js           # Wallet API routes
  └── payment.route.js          # (Updated) Added webhook

utils/
  ├── encryption.util.js        # AES-256, SHA-256, HMAC
  ├── rate-limiting.util.js     # Rate limiting middleware
  └── validation.util.js        # Input validation & sanitization

├── BACKEND_WALLET_API_REQUIREMENTS.md   # Full API documentation
└── WALLET_IMPLEMENTATION_SUMMARY.md     # This guide
```

---

## 🔌 API Endpoints Summary

| Method | Endpoint | Purpose | Rate Limit |
|--------|----------|---------|-----------|
| GET | `/api/wallet/balance` | Get balance | 20/min |
| GET | `/api/wallet/transactions` | Transaction history | 20/min |
| POST | `/api/wallet/fund` | Initiate funding | 5/hour |
| POST | `/api/wallet/verify-otp` | Verify OTP | 3/15min |
| POST | `/api/wallet/deduct` | Purchase deduction | 10/min |
| GET | `/payment/verify` | Verify payment | 20/min |
| POST | `/payment/webhook` | Flutterwave webhook | Signature auth |

---

## 🔑 Authentication

All `/api/wallet` endpoints require:
```
Authorization: Bearer <JWT_TOKEN>
```

**Get JWT Token:**
1. Register: `POST /user/register`
2. Login: `POST /user/login` → Returns `token`
3. Use token in header

**Token Payload:**
```javascript
{
  id: "user_mongodb_id",
  email: "user@example.com",
  role: "user",
  iat: 1705405200,
  exp: 1705408800  // 1 hour expiry
}
```

---

## 💰 Wallet Balance Handling

### Get Balance (Decrypted)
```javascript
const wallet = await Wallet.findOne({ user_id: userId });
const balance = wallet.getBalance(ENCRYPTION_PASSWORD);
// Returns: 150000 (as number)
```

### Update Balance (Encrypted)
```javascript
await Wallet.updateBalanceAtomic(
  userId,
  newBalance,
  ENCRYPTION_PASSWORD,
  "user_action"  // or "system" or "admin"
);
```

### Never Access Encrypted Balance Directly
```javascript
// ❌ WRONG
const balance = wallet.encrypted_balance;

// ✅ CORRECT
const balance = wallet.getBalance(ENCRYPTION_PASSWORD);
```

---

## 🔐 Security Features

### Encryption
```javascript
const { encrypt, decrypt } = require("./utils/encryption.util");

// Balance encryption
const encrypted = encrypt("150000");      // Returns: "iv:encrypted"
const decrypted = decrypt(encrypted);    // Returns: "150000"
```

### Hashing (OTP)
```javascript
const { hashData, verifyHash } = require("./utils/encryption.util");

// Hash OTP for storage
const otpHash = hashData("123456", userId);

// Verify OTP
const isValid = verifyHash("123456", otpHash, userId);
```

### HMAC (Webhook)
```javascript
const { generateHMAC, verifyHMAC } = require("./utils/encryption.util");

// Generate signature
const sig = generateHMAC(webhookBody, FLUTTERWAVE_SECRET_KEY);

// Verify signature
const isValid = verifyHMAC(webhookBody, receivedSig, FLUTTERWAVE_SECRET_KEY);
```

---

## 📧 OTP Management

### Generate OTP
```javascript
const { createOTP, sendOTPEmail } = require("./services/otp.service");

const otpResult = await createOTP(userId, "wallet_funding", {
  transactionReference: "FUND-xxx",
  deliveryMethod: "email"
});
// Returns: { otp: "123456", otpId, expiresAt, expiresIn }

await sendOTPEmail(userEmail, otpResult.otp, "wallet_funding");
```

### Verify OTP
```javascript
const { verifyOTP } = require("./services/otp.service");

const result = await verifyOTP(userId, "123456", "wallet_funding");
// Returns: { success: true, message, otpId }
// Throws error if: invalid, expired, locked, already used
```

### OTP Expiration
```javascript
const { getOTPStatus, cleanupExpiredOTPs } = require("./services/otp.service");

const status = await getOTPStatus(userId, "wallet_funding");
// Returns: {
//   exists: true,
//   isValid: true,
//   isLocked: false,
//   attempts: 1,
//   maxAttempts: 3,
//   expiresIn: 245  (seconds)
// }

await cleanupExpiredOTPs();  // Run periodically via cron
```

---

## 🚨 Fraud Detection

### Assess Risk
```javascript
const { assessFraudRisk } = require("./services/fraud.service");

const assessment = await assessFraudRisk({
  type: "funding",
  amount: 50000,
  device_fingerprint: req.headers["user-agent"],
  ip_address: req.ip
}, userId);
// Returns: {
//   score: 35,           // 0-100
//   riskLevel: "medium", // low, medium, high, critical
//   flags: ["rapid_transactions", "unusual_amount"],
//   requiresOTP: true,
//   requiresManualReview: false,
//   shouldBlock: false
// }
```

### Log Suspicious Activity
```javascript
const { logSuspiciousActivity } = require("./services/fraud.service");

await logSuspiciousActivity(userId, "rapid_transactions", {
  riskScore: 20,
  actionTaken: "monitoring",
  transactionReference: "TXN-xxx",
  amount: 50000,
  notes: "5 transactions in 1 hour"
});
```

### Get Fraud Statistics
```javascript
const { getFraudStatistics } = require("./services/fraud.service");

const stats = await getFraudStatistics("day");
// Returns: { period, dateRange, totalIncidents, unresolvedIncidents, reasonBreakdown }
```

---

## 🔄 Business Logic Patterns

### Funding Wallet
```javascript
// 1. Initiate (POST /api/wallet/fund)
→ Validate amount
→ Assess fraud risk
→ Create pending transaction
→ Generate & send OTP
→ Return transaction reference

// 2. Verify OTP (POST /api/wallet/verify-otp)
→ Find pending transaction
→ Verify OTP (check hash, expiry, attempts)
→ Update wallet balance (atomic)
→ Mark transaction as completed
→ Return new balance
```

### Purchase from Wallet
```javascript
// 1. Initiate (POST /api/wallet/deduct)
→ Validate amount & items
→ Check sufficient balance
→ Assess fraud risk
→ If low risk: deduct immediately + log
→ If high risk: create pending + send OTP

// 2. If OTP required (POST /api/wallet/verify-otp)
→ Verify OTP
→ Deduct balance (atomic)
→ Mark transaction as completed
→ Return new balance
```

---

## 🧪 Testing Endpoints

### 1. Register User
```bash
curl -X POST http://localhost:7145/user/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:7145/user/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
# Returns: { token: "eyJhbGc..." }
```

### 3. Check Balance
```bash
curl -X GET http://localhost:7145/api/wallet/balance \
  -H "Authorization: Bearer <TOKEN>"
```

### 4. Fund Wallet
```bash
curl -X POST http://localhost:7145/api/wallet/fund \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50000,
    "email": "john@example.com"
  }'
```

### 5. Verify OTP
```bash
curl -X POST http://localhost:7145/api/wallet/verify-otp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "otp": "123456",
    "transaction_reference": "FUND-1705405200000-abc123def"
  }'
```

### 6. Make Purchase
```bash
curl -X POST http://localhost:7145/api/wallet/deduct \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 25000,
    "items": [{"id": "prod-1", "name": "Product", "quantity": 2, "price": 12500}]
  }'
```

---

## ⚠️ Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Invalid token` | Token expired or invalid | Re-login to get new token |
| `400 OTP has expired` | >5 minutes passed | Initiate funding again to get new OTP |
| `400 Invalid OTP` | Wrong code | Check email, try again (3 attempts) |
| `400 Insufficient balance` | Not enough funds | Fund wallet first |
| `429 Too many requests` | Rate limit exceeded | Wait for reset time in response |
| `403 Wallet is frozen` | Admin action | Contact support |
| `500 Failed to decrypt` | Encryption password mismatch | Check ENCRYPTION_KEY env var |

---

## 📊 Database Queries

### Get User's Wallet
```javascript
const wallet = await Wallet.findOne({ user_id: userId });
if (wallet) {
  const balance = wallet.getBalance(ENCRYPTION_PASSWORD);
}
```

### Get Transaction History
```javascript
const transactions = await Transaction.find({ user_id: userId })
  .sort({ timestamp: -1 })
  .limit(20);
```

### Get Fraud Logs
```javascript
const fraudLogs = await FraudLog.find({ user_id: userId })
  .sort({ timestamp: -1 })
  .limit(10);
```

### Get OTP Status
```javascript
const otp = await OTPVerification.findOne({
  user_id: userId,
  purpose: "wallet_funding",
  is_used: false
});
```

---

## 🛠️ Maintenance Tasks

### Daily
- Monitor fraud logs for unresolved issues
- Check for failed transaction patterns

### Weekly
- Review high-risk transactions
- Analyze fraud statistics by reason
- Resolve flagged fraud cases

### Monthly
- Audit encryption key rotation (if needed)
- Review rate limiting thresholds
- Analyze user payment patterns

### Scheduled
```javascript
// Run daily cleanup of expired OTPs
cron.schedule('0 0 * * *', async () => {
  await require('./services/otp.service').cleanupExpiredOTPs();
});
```

---

## 🚀 Deployment Checklist

- [ ] All environment variables set in production `.env`
- [ ] ENCRYPTION_KEY is 32+ random bytes
- [ ] WALLET_ENCRYPTION_PASSWORD is secure
- [ ] EMAIL credentials valid and tested
- [ ] Flutterwave keys correct for production
- [ ] MongoDB connection string verified
- [ ] HTTPS/TLS enabled
- [ ] Webhook URL publicly accessible
- [ ] Rate limits appropriate for traffic
- [ ] Admin user account created
- [ ] Monitoring alerts configured
- [ ] Backup strategy in place

---

## 📚 Full Documentation

For complete details, see:
- **API Specification:** `BACKEND_WALLET_API_REQUIREMENTS.md`
- **Implementation Guide:** `WALLET_IMPLEMENTATION_SUMMARY.md`
- **Source Code:** Individual files with JSDoc comments

---

## ❓ FAQs

**Q: Can I disable rate limiting?**  
A: No, it's built into routes. Adjust thresholds in `utils/rate-limiting.util.js` instead.

**Q: How do I get the user's decrypted balance?**  
A: `const balance = wallet.getBalance(ENCRYPTION_PASSWORD);`

**Q: Can users fund with multiple payment methods?**  
A: Currently only Flutterwave. Extensible to add more gateways.

**Q: How are transactions made immutable?**  
A: Transactions are never updated, only created. Status can change pending→completed, but financial amounts never change.

**Q: Can I change OTP expiration time?**  
A: Yes, in `services/otp.service.js` line ~30: `new Date(Date.now() + 5 * 60 * 1000)` (5 minutes)

**Q: How do I investigate a fraud case?**  
A: Use `GET /api/admin/fraud/user/:userId` to see user's fraud history with full context.

---

**Last Updated:** January 16, 2026  
**Version:** 1.0.0
