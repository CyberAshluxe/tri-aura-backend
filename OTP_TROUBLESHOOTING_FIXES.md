# OTP System - Troubleshooting & Fixes

## ✅ Issues Fixed

### 1. Email Service Failure (500 Error)

**Problem:** OTP endpoint was returning 500 error because Gmail SMTP authentication was failing.

**Solution:** Switched from nodemailer (Gmail) to **Resend** email service.

**Changes Made:**
- Updated `services/otp.service.js` to use Resend API
- Resend is already configured with `RESEND_API_KEY` in `.env`
- More reliable and production-ready than Gmail SMTP
- Better error handling and monitoring

**Before:**
```javascript
const nodemailer = require("nodemailer");
const emailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
```

**After:**
```javascript
const { Resend } = require("resend");
let emailClient;
if (process.env.RESEND_API_KEY) {
  emailClient = new Resend(process.env.RESEND_API_KEY);
}
```

### 2. Missing Error Logging

**Problem:** 500 errors weren't providing enough debug information.

**Solution:** Added comprehensive logging to both controller functions.

**Changes Made:**
- `sendWalletOTP()` - Now logs each step with emojis for visibility
- `getWalletOTPStatus()` - Now logs status checks
- Error stack traces now included in console output
- All errors now prefixed with ❌ for quick identification

**Example:**
```javascript
console.log(`📨 Sending OTP for user ${userId}, purpose: ${purpose}, email: ${email}`);
console.log(`✅ OTP created for user ${userId}`);
console.error("❌ Failed to send OTP email:", error.message);
```

### 3. Insufficient Error Handling

**Problem:** Some error scenarios weren't caught properly.

**Solution:** Added try-catch blocks for individual operations.

**Changes Made:**
- Wrapped `getOTPStatus()` call in try-catch
- Wrapped `createOTP()` call in try-catch
- Wrapped `sendOTPEmail()` call in try-catch
- Each returns specific error response to frontend

---

## 🔧 Testing the Fix

### 1. Send OTP Request
```bash
curl -X POST http://localhost:7145/api/wallet/otp/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "wallet_funding",
    "email": "test@example.com"
  }'
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to test@example.com",
  "expiresIn": 300,
  "otpId": "507f1f77bcf86cd799439011"
}
```

**Check Server Logs:**
```
📨 Sending OTP for user 507f1f77bcf86cd799439012, purpose: wallet_funding, email: test@example.com
✅ Resend email service initialized
✅ OTP created for user 507f1f77bcf86cd799439012
✅ OTP email sent to test@example.com via Resend
```

### 2. Check OTP Status
```bash
curl -X GET "http://localhost:7145/api/wallet/otp/status?purpose=wallet_funding" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
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

### 3. Verify OTP
```bash
curl -X POST http://localhost:7145/api/wallet/verify-otp \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "otp": "123456",
    "transaction_reference": "txn_abc123"
  }'
```

---

## 📊 Configuration Verification

### Check Resend API Key
```bash
# Verify RESEND_API_KEY is set in .env
echo $RESEND_API_KEY
# Should output: re_145L3ddi_J66do6LU57F2VMP3o6RnPA4Y (or similar)
```

### Verify Email Configuration
```bash
# Check .env has RESEND_API_KEY
grep RESEND_API_KEY .env
# Output: RESEND_API_KEY=re_145L3ddi_J66do6LU57F2VMP3o6RnPA4Y
```

---

## 🔍 Debugging Checklist

If you still get 500 errors:

- [ ] Check `RESEND_API_KEY` is set in `.env`
- [ ] Verify database connection (MongoDB)
- [ ] Check user exists in database
- [ ] Verify JWT token is valid
- [ ] Check server logs for exact error message
- [ ] Ensure `validatedData` is set by middleware
- [ ] Verify OTP service functions exist
- [ ] Check for console errors in terminal

### View Server Logs
```bash
# Start server with logging
node index.js

# Look for:
# ✅ Messages = Success
# ❌ Messages = Errors
# 📨 Messages = Operations
```

---

## 🚀 Next Steps

1. **Restart the server** to apply all changes
```bash
# Kill current process (Ctrl+C)
# Restart:
node index.js
```

2. **Test OTP endpoint** using curl commands above

3. **Check for email** - Should arrive within 1-2 minutes via Resend

4. **Monitor server logs** - Should see ✅ messages indicating success

5. **Frontend integration** - Frontend can now send OTP requests successfully

---

## 📝 Files Modified in This Fix

1. **services/otp.service.js**
   - Switched to Resend email service
   - Added email client configuration
   - Updated sendOTPEmail() to use Resend API
   - Better error handling and logging

2. **controllers/wallet.controller.js**
   - Enhanced sendWalletOTP() with better logging
   - Enhanced getWalletOTPStatus() with better logging
   - Added error stack traces
   - Improved error messages for debugging

---

## ✅ Success Indicators

After applying these fixes, you should see:

**In Server Logs:**
```
✅ Resend email service initialized
📨 Sending OTP for user [userId], purpose: wallet_funding, email: user@example.com
✅ OTP created for user [userId]
✅ OTP email sent to user@example.com via Resend
```

**In API Response:**
```json
{
  "success": true,
  "message": "OTP sent to user@example.com",
  "expiresIn": 300
}
```

**In Email Inbox:**
- Email arrives from `noreply@triora.com`
- Subject: `Your Wallet Funding OTP Code`
- Shows 6-digit OTP code

---

## 🔐 Security Notes

✅ **Plain OTPs:**
- Only displayed in email
- Never logged or stored in plain text
- Hash stored in database only

✅ **Resend Service:**
- Enterprise-grade email service
- Automatic retry on failure
- Built-in rate limiting
- Better deliverability than Gmail

✅ **Error Messages:**
- Don't expose sensitive details
- Safe to show to frontend users
- Full details logged on server only

---

## 📞 Still Having Issues?

1. Check server logs for exact error message
2. Verify all environment variables are set
3. Ensure database is connected
4. Check JWT token validity
5. Review the documentation in OTP_SYSTEM_DOCUMENTATION.md

---

**Last Updated:** January 17, 2026  
**Version:** 1.0.1 (Fixed)  
**Status:** ✅ Ready for Testing
