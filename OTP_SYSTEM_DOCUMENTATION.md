# OTP (One-Time Password) System Documentation

## Overview
The TRI-AURA wallet system implements a secure, production-ready OTP (One-Time Password) flow for protecting sensitive wallet operations like funding and withdrawals. The OTP system uses:

- **6-digit numeric OTP** generated randomly
- **5-minute expiration** window
- **One-time use only** - OTP is marked as used after successful verification
- **SHA-256 hashing** for secure storage
- **Email delivery** via Resend service
- **Rate limiting** to prevent brute force attacks
- **Attempt tracking** with account lockout after 3 failed attempts

---

## Architecture

### Backend Components

#### 1. **OTP Model** (`models/transaction.model.js`)
```javascript
OTPVerification Schema:
- user_id: ObjectId (User reference)
- otp_hash: String (SHA-256 hashed OTP)
- purpose: Enum (wallet_funding | wallet_deduction | sensitive_action)
- transaction_reference: String (Optional, links to transaction)
- expires_at: Date (5 minutes from creation)
- attempts: Number (0-3)
- max_attempts: Number (default: 3)
- is_used: Boolean (marks OTP as consumed)
- is_locked: Boolean (locked after max attempts)
- locked_until: Date (15-minute lockout period)
- delivery_method: Enum (email | sms | both)
- created_at: Date
```

#### 2. **OTP Service** (`services/otp.service.js`)

**Key Functions:**

##### `generateOTP()`
- Generates a random 6-digit numeric OTP
- Returns: `string` (e.g., "123456")

##### `createOTP(userId, purpose, options)`
- Creates OTP record in database
- Hashes OTP using SHA-256 with userId as salt
- Invalidates previous OTPs for same purpose
- Parameters:
  - `userId`: User's MongoDB ObjectId
  - `purpose`: 'wallet_funding' | 'wallet_deduction' | 'sensitive_action'
  - `options`: { blockIfExists, transactionReference, deliveryMethod }
- Returns: `{ otp, otpId, expiresAt, expiresIn }`
- Throws: Error if OTP already exists and blockIfExists=true

##### `sendOTPEmail(email, otp, purpose)`
- Sends OTP via email using nodemailer (Gmail service)
- HTML-formatted email with security notices
- Parameters:
  - `email`: Recipient email address
  - `otp`: Plain OTP to display
  - `purpose`: Used for email subject line
- Returns: `boolean` (true if sent successfully)
- Throws: Error if email service fails

##### `verifyOTP(userId, plainOTP, purpose)`
- Verifies user-entered OTP against stored hash
- Checks expiration and attempt limits
- Locks account after 3 failed attempts (15-minute lockout)
- Parameters:
  - `userId`: User's MongoDB ObjectId
  - `plainOTP`: OTP entered by user
  - `purpose`: OTP purpose
- Returns: `{ success, message, otpId }`
- Throws: Error for invalid/expired/locked OTPs

##### `getOTPStatus(userId, purpose)`
- Retrieves OTP status for a specific purpose
- Parameters:
  - `userId`: User's MongoDB ObjectId
  - `purpose`: OTP purpose
- Returns: 
  ```javascript
  {
    exists: boolean,
    isValid: boolean,
    isLocked: boolean,
    attempts: number,
    maxAttempts: number,
    expiresAt: Date,
    expiresIn: number (seconds)
  }
  ```

##### `cleanupExpiredOTPs()`
- Deletes expired OTPs from database
- Should run periodically (recommend: every hour)
- Returns: Number of deleted records

---

## API Endpoints

### 1. Send OTP
**POST** `/api/wallet/otp/send`

**Authentication:** Required (Bearer JWT Token)

**Rate Limit:** 3 requests per minute per user

**Request Body:**
```json
{
  "purpose": "wallet_funding",
  "email": "user@example.com"
}
```

**Valid Purposes:**
- `wallet_funding` - For funding wallet
- `wallet_deduction` - For purchase/withdrawal

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent to user@example.com",
  "expiresIn": 300,
  "otpId": "507f1f77bcf86cd799439011"
}
```

**Response (Error - OTP Already Exists):**
```json
{
  "message": "OTP already sent. Please check your email.",
  "expiresIn": 245,
  "attempts": 0
}
```

**Possible Errors:**
- `401` - Unauthorized (missing/invalid token)
- `400` - Invalid purpose or email format
- `404` - User not found
- `429` - OTP already sent (retry after expiration)
- `500` - Email service failure

---

### 2. Get OTP Status
**GET** `/api/wallet/otp/status`

**Authentication:** Required (Bearer JWT Token)

**Rate Limit:** 10 requests per minute per user

**Query Parameters:**
```
?purpose=wallet_funding
```

**Response (Valid OTP Exists):**
```json
{
  "success": true,
  "purpose": "wallet_funding",
  "exists": true,
  "isValid": true,
  "isLocked": false,
  "attempts": 0,
  "maxAttempts": 3,
  "expiresAt": "2024-01-17T15:35:00.000Z",
  "expiresIn": 245
}
```

**Response (No OTP):**
```json
{
  "success": true,
  "purpose": "wallet_funding",
  "exists": false
}
```

**Possible Errors:**
- `401` - Unauthorized
- `400` - Missing/invalid purpose parameter
- `500` - Database error

---

### 3. Verify OTP (Existing Endpoint)
**POST** `/api/wallet/verify-otp`

**Authentication:** Required (Bearer JWT Token)

**Rate Limit:** 3 attempts per 15 minutes per user

**Request Body:**
```json
{
  "otp": "123456",
  "transaction_reference": "txn_abc123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP verified and wallet funded successfully",
  "newBalance": 5000,
  "transactionId": "507f1f77bcf86cd799439012"
}
```

**Response (Invalid OTP):**
```json
{
  "message": "Invalid OTP. 2 attempts remaining."
}
```

**Response (Account Locked):**
```json
{
  "message": "Maximum OTP attempts exceeded. Please try again after 15 minutes."
}
```

**Possible Errors:**
- `401` - Unauthorized
- `400` - Invalid OTP format (must be 6 digits)
- `404` - Transaction not found
- `429` - Too many attempts
- `500` - Verification error

---

## Security Features

### 1. **OTP Hashing**
```javascript
// OTP is hashed using SHA-256 with userId as salt
const otpHash = hashData(plainOTP, userId);
// Never stored in plain text in database
// Plain OTP only returned to frontend for delivery
```

### 2. **One-Time Use**
```javascript
// After successful verification, OTP is marked as used
otpRecord.is_used = true;
otpRecord.used_at = new Date();
await otpRecord.save();
// Prevents OTP reuse
```

### 3. **Expiration Handling**
```javascript
// OTP expires in 5 minutes
expires_at: new Date(Date.now() + 5 * 60 * 1000)

// Frontend should display countdown
// Backend checks expiration on verification
```

### 4. **Attempt Limiting**
```javascript
// Maximum 3 incorrect attempts
if (otpRecord.attempts >= otpRecord.max_attempts) {
  otpRecord.is_locked = true;
  otpRecord.locked_until = new Date(Date.now() + 15 * 60 * 1000);
  // User locked for 15 minutes
}
```

### 5. **Previous OTP Invalidation**
```javascript
// When new OTP is created, old ones for same purpose are marked as used
await OTPVerification.updateMany(
  { user_id: userId, purpose, is_used: false },
  { is_used: true, used_at: new Date() }
);
```

### 6. **Rate Limiting**
- Send OTP: 3 attempts per minute
- Check Status: 10 requests per minute
- Verify OTP: 3 attempts per 15 minutes

### 7. **Email Security**
- OTP never logged in plain text
- Email validation before sending
- HTML email with security notices
- No sensitive data in email subject

---

## Frontend Integration

### Example React Implementation

#### 1. Send OTP
```javascript
// WalletContext.jsx
const sendOTP = async (purpose, email) => {
  try {
    const response = await axios.post(
      'http://localhost:7145/api/wallet/otp/send',
      { purpose, email },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    return response.data; // { success, message, expiresIn, otpId }
  } catch (error) {
    console.error('Failed to send OTP:', error.response.data);
    throw error;
  }
};
```

#### 2. Get OTP Status
```javascript
// Poll for OTP expiration countdown
const checkOTPStatus = async (purpose) => {
  try {
    const response = await axios.get(
      `http://localhost:7145/api/wallet/otp/status?purpose=${purpose}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get OTP status:', error);
    throw error;
  }
};
```

#### 3. Verify OTP
```javascript
const verifyOTP = async (otp, transactionReference) => {
  try {
    const response = await axios.post(
      'http://localhost:7145/api/wallet/verify-otp',
      { otp, transaction_reference: transactionReference },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('OTP verification failed:', error);
    throw error;
  }
};
```

#### 4. OTP Verification UI Component
```javascript
// OTPVerificationModal.jsx
const [otp, setOTP] = useState('');
const [timeLeft, setTimeLeft] = useState(300);
const [attempts, setAttempts] = useState(0);

useEffect(() => {
  const timer = setInterval(() => {
    setTimeLeft(prev => prev - 1);
  }, 1000);
  return () => clearInterval(timer);
}, []);

const handleSubmit = async () => {
  try {
    await verifyOTP(otp, transactionRef);
    // Success - close modal, refresh wallet
  } catch (error) {
    if (error.response?.status === 429) {
      // Account locked - show retry message
    }
    setAttempts(prev => prev + 1);
  }
};

return (
  <div>
    <input 
      type="text" 
      maxLength="6" 
      value={otp}
      onChange={(e) => setOTP(e.target.value)}
      placeholder="Enter 6-digit OTP"
    />
    <p>Expires in: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</p>
    <button onClick={handleSubmit}>Verify OTP</button>
    {attempts > 0 && <p>{3 - attempts} attempts remaining</p>}
  </div>
);
```

---

## Workflow Examples

### Example 1: Wallet Funding Flow
```
1. User initiates wallet funding
   POST /api/wallet/fund
   { amount: 5000, email: "user@example.com" }

2. Backend:
   - Creates transaction record (status: pending)
   - Creates OTP and hashes it
   - Sends OTP to email
   - Returns transaction_reference

3. Frontend:
   - Shows OTP verification modal with countdown
   - User enters OTP from email
   - Calls POST /api/wallet/verify-otp

4. Backend:
   - Verifies OTP against hash
   - Checks expiration and attempts
   - Marks OTP as used
   - Updates wallet balance (atomically)
   - Marks transaction as completed
   - Returns new balance

5. Frontend:
   - Shows success message
   - Updates wallet UI
   - Closes modal
```

### Example 2: Error Handling - Invalid OTP
```
1. User enters incorrect OTP
2. Backend:
   - Verifies hash (fails)
   - Increments attempts (1/3)
   - Returns error with remaining attempts

3. Frontend:
   - Shows error: "Invalid OTP. 2 attempts remaining."
   - User can retry

4. After 3 failures:
   - Backend locks account for 15 minutes
   - Frontend shows: "Too many attempts. Try again later."
```

### Example 3: Handling OTP Expiration
```
1. OTP expires (5 minutes passed)
2. User tries to verify expired OTP
3. Backend:
   - Checks expiration timestamp
   - Returns error: "OTP has expired"

4. Frontend:
   - Shows message: "OTP expired. Request a new one."
   - Button: "Send New OTP"

5. User clicks button -> Go to Step 1
```

---

## Database Cleanup

### Setup Periodic Cleanup (Recommended: Daily)

**In your cron job or scheduled task:**
```javascript
// Run daily at 2 AM
const cron = require('node-cron');
const { cleanupExpiredOTPs } = require('./services/otp.service');

cron.schedule('0 2 * * *', async () => {
  try {
    const deleted = await cleanupExpiredOTPs();
    console.log(`Cleaned up ${deleted} expired OTPs`);
  } catch (error) {
    console.error('OTP cleanup failed:', error);
  }
});
```

---

## Validation Rules

### OTP Format Validation
```javascript
// OTP must be exactly 6 digits
/^\d{6}$/.test(otp) // Valid: "123456"
// Invalid: "12345", "abcdef", "123456789"
```

### Purpose Validation
```javascript
// Must be one of:
['wallet_funding', 'wallet_deduction', 'sensitive_action']
```

### Email Validation
```javascript
// Standard email format
/^[^\s@]+@[^\s@]+\.[^\s@]+$/
```

---

## Environment Variables Required

```env
# Email Service
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-specific-password

# JWT
JWT_SECRET=your-jwt-secret

# MongoDB
URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# OTP Configuration (Optional)
OTP_EXPIRY_MINUTES=5          # Default: 5
OTP_MAX_ATTEMPTS=3             # Default: 3
OTP_LOCKOUT_MINUTES=15         # Default: 15
```

---

## Error Messages Reference

| Status | Message | Solution |
|--------|---------|----------|
| 400 | OTP must be 6 digits | Re-enter OTP - must be exactly 6 numbers |
| 400 | Invalid purpose | Purpose must be 'wallet_funding' or 'wallet_deduction' |
| 401 | No authorization token provided | Login again, add Authorization header |
| 404 | Transaction not found | Transaction expired or already processed |
| 404 | No valid OTP found | Request new OTP via /api/wallet/otp/send |
| 429 | OTP already sent | Wait for OTP to expire or check email |
| 429 | Maximum OTP attempts exceeded | Wait 15 minutes before retrying |
| 500 | Failed to send OTP | Email service error - try again later |

---

## Testing the OTP System

### 1. Test OTP Generation
```bash
curl -X POST http://localhost:7145/api/wallet/otp/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "wallet_funding",
    "email": "test@example.com"
  }'
```

### 2. Test OTP Status Check
```bash
curl -X GET "http://localhost:7145/api/wallet/otp/status?purpose=wallet_funding" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test OTP Verification
```bash
curl -X POST http://localhost:7145/api/wallet/verify-otp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "otp": "123456",
    "transaction_reference": "txn_abc123"
  }'
```

---

## Best Practices

1. ✅ **Always use HTTPS** in production
2. ✅ **Store JWT tokens securely** (HttpOnly cookies)
3. ✅ **Never log plain OTPs** anywhere
4. ✅ **Implement CSRF protection** for state-changing operations
5. ✅ **Validate OTP format** on frontend before submission
6. ✅ **Show countdown timer** to user
7. ✅ **Implement retry logic** with exponential backoff
8. ✅ **Monitor failed OTP attempts** for suspicious activity
9. ✅ **Clean up expired OTPs** regularly
10. ✅ **Test email delivery** in staging environment

---

## Troubleshooting

### Issue: OTP Email Not Sending
**Causes:**
- Gmail SMTP not configured correctly
- App password incorrect
- "Less secure apps" disabled in Gmail

**Solution:**
1. Generate App Password in Google Account settings
2. Use App Password (not regular password) in `EMAIL_PASS`
3. Enable "Less secure app access" or use OAuth2

### Issue: OTP Verification Always Fails
**Causes:**
- Clock skew (server/database time mismatch)
- Encryption key mismatch
- Database transaction timeout

**Solution:**
1. Sync server time with NTP
2. Verify `WALLET_ENCRYPTION_PASSWORD` is set
3. Increase transaction timeout in MongoDB

### Issue: OTP Locked After Invalid Attempts
**Solution:**
- User must wait 15 minutes
- Admin can manually unlock in database:
  ```javascript
  db.otpverifications.updateOne(
    { user_id: ObjectId("...") },
    { $set: { is_locked: false } }
  )
  ```

---

## Performance Optimization

### Database Indexes
The system uses these indexes for performance:
```javascript
otpSchema.index({ expires_at: 1 });
otpSchema.index({ user_id: 1, purpose: 1, is_used: 1 });
otpSchema.index({ created_at: 1 });
```

### Recommended Queries
- Check valid OTP: Uses compound index (user_id, purpose, is_used)
- Cleanup expired: Uses expires_at index
- User history: Uses created_at index

---

## Compliance & Security Standards

✅ **OWASP Top 10 Protection:**
- Injection prevention via input validation
- Broken authentication via JWT + OTP
- Sensitive data exposure via hashing
- Rate limiting for brute force protection

✅ **GDPR Compliance:**
- Automatic OTP deletion after expiration
- PII minimization (no logging of OTP/email)
- User deletion cascades to OTP records

✅ **PCI DSS:**
- Secure password storage for email auth
- Transaction reference tracking
- Audit trails via transaction logs

---

## Support & Contact

For issues or questions about the OTP system:
1. Check this documentation
2. Review error logs on server
3. Check MongoDB for OTP records
4. Contact: [support email]

---

**Last Updated:** January 17, 2026  
**Version:** 1.0.0  
**Status:** Production Ready
