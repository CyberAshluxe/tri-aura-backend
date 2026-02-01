# OTP 500 Error - Root Cause Analysis & Solutions

## Problem Summary
Frontend receives `AxiosError: Request failed with status code 500` when calling `/api/wallet/otp/send`

## Why You're Getting 500 Error

The 500 error could be caused by **one of these issues**:

### 1. **Missing JWT Authentication Token** ⛔ MOST LIKELY
**Symptom**: Server logs show:
```
❌ [sendWalletOTP] No user ID found in request
```

**Cause**: Frontend is not sending the JWT token in the Authorization header

**Solution**: 
```javascript
// In your walletService.js
const sendOTP = async (purpose, email) => {
  const token = localStorage.getItem('token'); // ← Get token
  
  if (!token) {
    throw new Error('Not authenticated. Please login first.');
  }

  const response = await axios.post(
    'http://localhost:7145/api/wallet/otp/send',
    { purpose, email },
    {
      headers: {
        'Authorization': `Bearer ${token}`, // ← Send token!
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data;
};
```

---

### 2. **Invalid Request Payload** ⛔ SECOND LIKELY
**Symptom**: Server logs show:
```
❌ [sendWalletOTP] No validatedData in request
```

**Cause**: `purpose` or `email` field missing or invalid

**Solution - Valid Request Format**:
```javascript
// ✅ CORRECT
const data = {
  purpose: 'wallet_funding',      // ← Exact spelling required
  email: 'user@example.com'       // ← Must be valid email
};

// ❌ WRONG - These will fail:
{ purpose: 'walletFunding' }     // Wrong casing
{ purpose: 'fund' }              // Wrong value
{ email: 'not-an-email' }        // Invalid email
{ email: 'user@' }               // Incomplete email
```

---

### 3. **Email Service Not Configured** ⛔ LESS LIKELY (Already Fixed)
**Symptom**: Server logs show:
```
❌ [OTP Service] Email service not configured. RESEND_API_KEY missing.
```

**Cause**: Environment variable `RESEND_API_KEY` not loaded

**Solution**:
```bash
# Verify .env has the key
type .env | Select-String RESEND

# Should output:
# RESEND_API_KEY=re_145L3ddi_J66do6LU57F2VMP3o6RnPA4Y

# If missing, add it to .env and restart server
# Restart with: Ctrl+C in server terminal, then: node index.js
```

---

### 4. **Resend API Call Failed** ⛔ POSSIBLE
**Symptom**: Server logs show:
```
❌ [OTP Service] Resend API call failed: ...
```

**Cause**: Resend API key is invalid or API endpoint is down

**Solution**:
```bash
# Check API key format
echo $env:RESEND_API_KEY
# Should start with: re_

# If invalid, get a new key from: https://resend.com/api-keys
# Update .env and restart server
```

---

## How to Find the Real Cause

### Step 1: Check Server Logs (Most Important)
Look at the terminal where `node index.js` is running. The logs will tell you exactly what failed.

**Expected success logs**:
```
🔵 [sendWalletOTP] Request received
🔵 [sendWalletOTP] req.user: { id: '507f1f77bcf86cd799439011' }
🔵 [sendWalletOTP] req.validatedData: { purpose: 'wallet_funding', email: 'user@example.com' }
✅ [sendWalletOTP] User found: user@example.com
📝 [sendWalletOTP] Creating OTP for purpose: wallet_funding
✅ [sendWalletOTP] OTP created successfully
📧 [sendWalletOTP] Sending OTP email to user@example.com
✅ [OTP Service] OTP email sent to user@example.com via Resend (ID: ...)
```

### Step 2: Check Browser DevTools
1. Press **F12** to open DevTools
2. Go to **Network** tab
3. Trigger the OTP send action
4. Click on the red request (POST /api/wallet/otp/send)
5. Check **Response** tab for error message

### Step 3: Verify Request Headers
In DevTools Network tab, click the failed request and check **Headers** section:
- Should have: `Authorization: Bearer eyJhbGc...` (very long string)
- If missing → Add token to request
- If invalid → Token expired, login again

---

## Quick Fixes Checklist

- [ ] Server is running (`node index.js` in terminal)
- [ ] Frontend is sending `Authorization: Bearer {token}` header
- [ ] Request body has `purpose` and `email` fields
- [ ] Purpose is exactly `'wallet_funding'` or `'wallet_deduction'`
- [ ] Email is valid format (user@example.com)
- [ ] User is logged in (has valid JWT token)
- [ ] RESEND_API_KEY is in `.env`
- [ ] Server was restarted after editing `.env`

---

## Testing with curl

If you want to test the endpoint directly, use a real JWT token:

```bash
# Get your JWT token first (from browser DevTools Network tab)
$token = "YOUR_REAL_JWT_TOKEN_HERE"

# Send OTP
curl -X POST http://localhost:7145/api/wallet/otp/send `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d @{ purpose='wallet_funding'; email='test@example.com' } | ConvertTo-Json
```

---

## Success Indicators

When it works, you should see:

**Browser Console**:
```
Status: 200
{
  success: true,
  message: "OTP sent to user@example.com",
  expiresIn: 300,
  otpId: "507f1f77bcf86cd799439011"
}
```

**Server Terminal**:
```
🔵 [sendWalletOTP] Request received
✅ [sendWalletOTP] User found: user@example.com
✅ [sendWalletOTP] OTP created successfully
✅ [OTP Service] OTP email sent via Resend (ID: abc123)
```

**Email**: OTP arrives in user's inbox within 1-2 seconds

---

## Still Having Issues?

1. **Share server logs** → Copy output from terminal where `node index.js` runs
2. **Share DevTools response** → Right-click failed request → Copy response
3. **Share request format** → Show your fetch/axios code
4. **Check .env** → Verify all keys are present

The server logs are the most helpful for debugging! They show exactly where the request fails.

