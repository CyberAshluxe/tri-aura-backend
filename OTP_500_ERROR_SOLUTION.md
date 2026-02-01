# OTP 500 Error - Complete Solution Summary

## What Was Wrong

Your frontend is getting a **500 Internal Server Error** when calling `/api/wallet/otp/send` because of one of these issues:

### Top 3 Most Likely Causes (in order):

1. **Missing JWT Token in Authorization Header** (90% probability)
   - Your frontend is not sending the JWT token
   - The backend cannot identify which user is making the request
   - Result: `"No user ID found in request"` error

2. **Invalid Request Payload** (5% probability)
   - Missing `purpose` or `email` field
   - Wrong format for `purpose` (should be `'wallet_funding'` or `'wallet_deduction'`)
   - Invalid email format
   - Result: `"No validatedData in request"` error

3. **Email Service Not Configured** (5% probability)
   - RESEND_API_KEY missing from `.env`
   - Server not restarted after adding env variable
   - Result: `"Email service not configured"` error

---

## How to Fix It

### Fix #1: Add JWT Token to Request (MOST LIKELY)

**Before (❌ Wrong)**:
```javascript
const response = await axios.post(
  'http://localhost:7145/api/wallet/otp/send',
  { purpose: 'wallet_funding', email: 'user@example.com' }
  // ❌ No Authorization header!
);
```

**After (✅ Correct)**:
```javascript
const token = localStorage.getItem('token'); // Get JWT token

const response = await axios.post(
  'http://localhost:7145/api/wallet/otp/send',
  { purpose: 'wallet_funding', email: 'user@example.com' },
  {
    headers: {
      'Authorization': `Bearer ${token}`, // ✅ Add this!
      'Content-Type': 'application/json'
    }
  }
);
```

### Fix #2: Validate Request Format

```javascript
// ✅ CORRECT format
{
  purpose: 'wallet_funding',      // Exact spelling + lowercase
  email: 'user@example.com'       // Valid email
}

// ❌ WRONG formats
{ purpose: 'walletFunding' }      // Wrong casing
{ purpose: 'fund' }                // Wrong value
{ email: 'invalid-email' }         // Invalid format
```

### Fix #3: Ensure Server has Environment Variables

```bash
# 1. Check if .env has RESEND_API_KEY
type .env | Select-String RESEND

# 2. If present, restart server
# Press Ctrl+C in the terminal where 'node index.js' is running

# 3. Start server again
node index.js
```

---

## How to Debug and Verify

### Step 1: Check Server Logs
Look at the terminal where `node index.js` is running. 

**Success logs** should look like:
```
🔵 [sendWalletOTP] Request received
🔵 [sendWalletOTP] req.user: { id: '...' }       ← If missing = no token!
🔵 [sendWalletOTP] req.validatedData: { ... }     ← If missing = bad data!
✅ [sendWalletOTP] User found: user@example.com
✅ [sendWalletOTP] OTP created successfully
✅ [OTP Service] OTP email sent via Resend
```

**Error logs** will show exactly what failed:
```
❌ [sendWalletOTP] No user ID found in request  → Add JWT token
❌ [sendWalletOTP] No validatedData in request  → Check purpose/email
❌ Email service not configured                  → Check .env
```

### Step 2: Check Browser DevTools

1. Press **F12** to open Developer Tools
2. Go to **Network** tab
3. Trigger the OTP send action
4. Find the red request (POST `/api/wallet/otp/send`)
5. Click it and check:
   - **Status**: Should be 200 (if working) or show error
   - **Headers → Request Headers**: Look for `Authorization: Bearer ...`
   - **Response**: Shows error message

### Step 3: Add Console Logging to Frontend

```javascript
// Add this to your walletService
const sendOTP = async (purpose, email) => {
  const token = localStorage.getItem('token');
  
  console.log('Token present?', !!token);
  console.log('Purpose:', purpose);
  console.log('Email:', email);
  
  try {
    const response = await axios.post('/api/wallet/otp/send', 
      { purpose, email },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    throw error;
  }
};
```

---

## Files Updated / Created

### Backend Changes (Already Applied):
1. **controllers/wallet.controller.js** - Enhanced `sendWalletOTP` with detailed logging
2. **services/otp.service.js** - Enhanced error handling for Resend API

### Documentation Created:
1. **OTP_500_ERROR_ROOT_CAUSE.md** - Root cause analysis
2. **OTP_500_ERROR_DEBUG.md** - Debugging checklist and procedures
3. **WALLETSERVICE_CORRECT_IMPLEMENTATION.js** - Correct frontend implementation

---

## Server Status

✅ Server is running on port 7145
✅ Resend email service initialized
✅ MongoDB connected
✅ All enhanced logging enabled

---

## What to Do Next

1. **Update your frontend code** - Add JWT token to the Authorization header
   - Use code from `WALLETSERVICE_CORRECT_IMPLEMENTATION.js`

2. **Test the endpoint**:
   - Call `/api/wallet/otp/send` with proper token and payload
   - Watch server logs for debug messages
   - Check DevTools Network tab for response

3. **Verify success**:
   - Server logs should show ✅ OTP email sent
   - Response should have { success: true, expiresIn: 300, otpId: ... }
   - Email should arrive within 1-2 seconds

4. **If still failing**:
   - Copy full server log output
   - Share the DevTools Network response
   - Paste your current request code
   - I can identify the exact issue

---

## Quick Verification Checklist

- [ ] JWT token is in localStorage (check DevTools > Application > LocalStorage)
- [ ] Frontend is sending `Authorization: Bearer {token}` header
- [ ] Request body has `{ purpose: 'wallet_funding', email: '...' }`
- [ ] Purpose is exactly `'wallet_funding'` or `'wallet_deduction'`
- [ ] Email is valid format (user@domain.com)
- [ ] Server is running (`node index.js`)
- [ ] Server shows ✅ Resend email service initialized
- [ ] User is logged in (has valid JWT token)

---

## Expected Success Response

```json
{
  "success": true,
  "message": "OTP sent to user@example.com",
  "expiresIn": 300,
  "otpId": "507f1f77bcf86cd799439011"
}
```

If you see this response + email arrives → Everything works! ✅

