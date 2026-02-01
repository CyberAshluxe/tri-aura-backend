# OTP System Quick Reference

## 🔐 Key Components

### Service Functions (`services/otp.service.js`)
```javascript
generateOTP()                    // → "123456"
createOTP(userId, purpose)       // → { otp, otpId, expiresAt, expiresIn }
sendOTPEmail(email, otp)         // → true/false
verifyOTP(userId, otp, purpose)  // → { success, otpId }
getOTPStatus(userId, purpose)    // → { exists, isValid, attempts... }
cleanupExpiredOTPs()             // → deleted count
```

---

## 📡 API Endpoints

### Send OTP
```
POST /api/wallet/otp/send
Authorization: Bearer {JWT_TOKEN}

{
  "purpose": "wallet_funding",
  "email": "user@example.com"
}

Response: { success, message, expiresIn, otpId }
```

### Get OTP Status
```
GET /api/wallet/otp/status?purpose=wallet_funding
Authorization: Bearer {JWT_TOKEN}

Response: { exists, isValid, attempts, maxAttempts, expiresIn... }
```

### Verify OTP
```
POST /api/wallet/verify-otp
Authorization: Bearer {JWT_TOKEN}

{
  "otp": "123456",
  "transaction_reference": "txn_abc123"
}

Response: { success, newBalance, transactionId }
```

---

## 🔑 Security Rules

| Feature | Implementation |
|---------|-----------------|
| **Hashing** | SHA-256 with userId salt |
| **Storage** | Hashed only (never plain) |
| **Expiry** | 5 minutes |
| **One-time Use** | Marked as used after verification |
| **Attempt Limit** | 3 failures → 15-min lockout |
| **Rate Limit** | Send: 3/min, Verify: 3/15min |

---

## 🎯 Common Workflows

### 1. Send OTP Flow
```
sendOTPEmail()
  ↓
frontend receives expiresIn
  ↓
start countdown timer
  ↓
user enters OTP
```

### 2. Verify OTP Flow
```
verifyOTP()
  ↓
check hash ✓
  ↓
check expiry ✓
  ↓
check attempts ✓
  ↓
mark as used
  ↓
process transaction
```

### 3. Error Handling
```
Invalid OTP → attempts++, throw error
Expired OTP → mark as used, throw error
Locked → 15-min wait, throw error
```

---

## 💾 Database Schema

```javascript
{
  user_id: ObjectId,
  otp_hash: String,
  purpose: "wallet_funding" | "wallet_deduction",
  expires_at: Date,
  attempts: 0-3,
  is_used: boolean,
  is_locked: boolean,
  locked_until: Date,
  created_at: Date
}
```

---

## ✅ Validation

```javascript
// OTP: 6 digits only
/^\d{6}$/

// Purpose: enum
"wallet_funding" | "wallet_deduction"

// Email: standard format
/^[^\s@]+@[^\s@]+\.[^\s@]+$/
```

---

## 🚨 Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 400 | Invalid input | Check format |
| 401 | No auth token | Login |
| 404 | OTP not found | Send new OTP |
| 429 | Rate limited | Wait |
| 500 | Server error | Retry |

---

## 📱 Frontend Example

```javascript
// Send OTP
const sendOTP = async (purpose, email) => {
  const res = await fetch('/api/wallet/otp/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ purpose, email })
  });
  return res.json();
};

// Check Status
const checkStatus = async (purpose) => {
  const res = await fetch(`/api/wallet/otp/status?purpose=${purpose}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
};

// Verify OTP
const verifyOTP = async (otp, ref) => {
  const res = await fetch('/api/wallet/verify-otp', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ otp, transaction_reference: ref })
  });
  return res.json();
};
```

---

## 🔧 Configuration

```env
# Required
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=app-password
JWT_SECRET=your-secret

# Optional (defaults shown)
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=3
OTP_LOCKOUT_MINUTES=15
```

---

## 🧪 Quick Test

```bash
# Send OTP
curl -X POST http://localhost:7145/api/wallet/otp/send \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purpose":"wallet_funding","email":"test@example.com"}'

# Check Status
curl -X GET "http://localhost:7145/api/wallet/otp/status?purpose=wallet_funding" \
  -H "Authorization: Bearer JWT_TOKEN"

# Verify (replace OTP with actual)
curl -X POST http://localhost:7145/api/wallet/verify-otp \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"otp":"123456","transaction_reference":"txn_123"}'
```

---

## 📋 Checklist for Implementation

- [ ] OTP service configured in environment
- [ ] Email credentials valid in .env
- [ ] MongoDB indexes created
- [ ] Rate limiting configured
- [ ] Error handling implemented in UI
- [ ] OTP countdown timer displayed
- [ ] Attempt counter shown to user
- [ ] Resend OTP button available
- [ ] Account lockout message visible
- [ ] Tests passing locally
- [ ] Tested in staging environment

---

## 🔒 Security Checklist

- [ ] OTP never logged in plain text
- [ ] HTTPS enforced in production
- [ ] JWT token in Authorization header
- [ ] CSRF protection enabled
- [ ] SQL injection prevention (using Mongoose)
- [ ] Rate limiting active on all endpoints
- [ ] Attempt lockout after 3 failures
- [ ] Automatic OTP expiration
- [ ] One-time use enforcement
- [ ] No OTP in response logs

---

## 📞 Support Scenarios

**User didn't receive OTP:**
1. Check email spam folder
2. Verify email address is correct
3. Resend OTP via `/api/wallet/otp/send`

**User locked out after wrong attempts:**
1. Wait 15 minutes
2. Try again
3. Admin can reset in DB if urgent

**OTP expired:**
1. Request new OTP
2. Re-enter new OTP
3. Complete operation

---

## 📊 Monitoring

Monitor these metrics:
- OTP send success rate
- OTP verification success rate
- Failed attempt count (track >2 failures)
- Email delivery failures
- Average time to verify OTP
- Account lockout frequency

---

**Last Updated:** January 17, 2026  
**Version:** 1.0
