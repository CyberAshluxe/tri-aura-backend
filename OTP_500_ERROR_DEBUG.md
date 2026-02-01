# OTP 500 Error - Debugging Checklist

## Error: AxiosError - Request failed with status code 500

This document helps you identify and fix the OTP endpoint 500 error.

---

## Step 1: Check Browser DevTools Network Tab

1. Open Chrome DevTools (F12)
2. Go to **Network** tab
3. **Reload the page** and trigger the OTP send action
4. Find the failed request (POST `/api/wallet/otp/send`)
5. Click on it and check:
   - **Status**: Should be 500
   - **Response Tab**: View the exact error message
   - **Headers Tab**: Verify Authorization header is present
   - **Request**: Check what data was sent

### Expected Success Response:
```json
{
  "success": true,
  "message": "OTP sent to user@example.com",
  "expiresIn": 300,
  "otpId": "507f1f77bcf86cd799439011"
}
```

### Common Error Responses:
```json
{
  "message": "Authentication required",
  "error": "No user ID in request"
}
```
```json
{
  "message": "Invalid request payload",
  "error": "Validation failed"
}
```
```json
{
  "message": "Failed to send OTP email",
  "details": "Email service not configured..."
}
```

---

## Step 2: Check Server Logs

Look at the terminal where `node index.js` is running. You should see logs like:

### Expected Logs (Success):
```
🔵 [sendWalletOTP] Request received
🔵 [sendWalletOTP] req.user: { id: '...' }
🔵 [sendWalletOTP] req.validatedData: { purpose: 'wallet_funding', email: 'user@example.com' }
✅ [sendWalletOTP] User found: user@example.com
📝 [sendWalletOTP] Creating OTP for purpose: wallet_funding
✅ [sendWalletOTP] OTP created successfully
📧 [sendWalletOTP] Sending OTP email to user@example.com
✅ [sendWalletOTP] OTP email sent to user@example.com for wallet_funding
```

### Common Error Logs and Fixes:

#### Issue 1: No User ID
```
❌ [sendWalletOTP] No user ID found in request
```
**Fix**: Frontend must send JWT token in Authorization header
```javascript
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json'
};
```

#### Issue 2: No validatedData
```
❌ [sendWalletOTP] No validatedData in request
```
**Fix**: Ensure request body has correct fields:
```javascript
const data = {
  purpose: 'wallet_funding',  // Required! Must be 'wallet_funding' or 'wallet_deduction'
  email: 'user@example.com'   // Required! Must be valid email
};
```

#### Issue 3: User Not Found
```
❌ [sendWalletOTP] User not found: [id]
```
**Fix**: Ensure JWT token is for a valid user that exists in database

#### Issue 4: OTP Creation Failed
```
❌ [sendWalletOTP] Failed to create OTP: [error message]
```
**Fix**: Check MongoDB connection and OTPVerification collection exists

#### Issue 5: Email Send Failed
```
❌ [sendWalletOTP] Failed to send OTP email: [error message]
```
**Fix**: Check that Resend API key is configured
```bash
# In terminal, verify:
echo $env:RESEND_API_KEY
# Should output: re_145L3ddi_J66do6LU57F2VMP3o6RnPA4Y
```

---

## Step 3: Verify Frontend Request Format

Your frontend code should look like this:

```javascript
// walletService.js or similar
export const sendOTP = async (purpose, email) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await axios.post(
    'http://localhost:7145/api/wallet/otp/send',
    {
      purpose: purpose,  // 'wallet_funding' or 'wallet_deduction'
      email: email       // valid email address
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
};
```

### Key Points:
- ✅ Authorization header must be present
- ✅ Must be `Bearer ${token}` format (with space)
- ✅ Purpose must be exactly 'wallet_funding' or 'wallet_deduction'
- ✅ Email must be valid format
- ✅ Content-Type must be 'application/json'

---

## Step 4: Test with curl (If using terminal)

Replace `YOUR_JWT_TOKEN` with an actual JWT token:

```bash
# Send OTP request
curl -X POST http://localhost:7145/api/wallet/otp/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "wallet_funding",
    "email": "test@example.com"
  }'

# Expected response:
# {
#   "success": true,
#   "message": "OTP sent to test@example.com",
#   "expiresIn": 300,
#   "otpId": "..."
# }
```

---

## Step 5: Validate Input Requirements

### Purpose Field:
- **Required**: Yes
- **Type**: String
- **Valid Values**: 
  - `'wallet_funding'` - For wallet funding operations
  - `'wallet_deduction'` - For purchase/deduction operations
- **Invalid Examples**: ❌ 'walletFunding', ❌ 'WALLET_FUNDING', ❌ 'fund'

### Email Field:
- **Required**: Yes
- **Type**: String
- **Format**: Valid email address
- **Valid Examples**: ✅ test@example.com, ✅ user+tag@domain.co.uk
- **Invalid Examples**: ❌ 'not-an-email', ❌ 'user@', ❌ '@example.com'

---

## Step 6: Check Environment Variables

Verify `.env` file has these variables:

```bash
# Windows PowerShell:
Get-Content .env | Select-String "RESEND"
# Should show: RESEND_API_KEY=re_145L3ddi_J66do6LU57F2VMP3o6RnPA4Y
```

---

## Step 7: Restart Server if Environment Changed

If you added/modified `.env`:

```bash
# Kill all node processes
Get-Process node | Stop-Process -Force

# Wait 2 seconds
Start-Sleep -Seconds 2

# Restart server
cd "c:\Users\HP\Desktop\LEVEL THREE\TRI-AURA\tri-aura"
node index.js
```

---

## Step 8: Check Rate Limiting

If you get 429 status with message "Too many requests":

- OTP Send endpoint: Max 3 requests per minute per user
- OTP Status endpoint: Max 10 requests per minute per user
- OTP Verify endpoint: Max 3 attempts per 15 minutes per user

**Solution**: Wait before retrying the same operation.

---

## Step 9: Enable Request Logging

Add this to your frontend code temporarily:

```javascript
// In walletService.js
export const sendOTP = async (purpose, email) => {
  const token = localStorage.getItem('token');
  
  console.log('=== OTP REQUEST ===');
  console.log('Token:', token ? 'Present' : 'Missing');
  console.log('Purpose:', purpose);
  console.log('Email:', email);
  
  try {
    const response = await axios.post(
      'http://localhost:7145/api/wallet/otp/send',
      { purpose, email },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('=== OTP RESPONSE ===');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
    
    return response.data;
  } catch (error) {
    console.error('=== OTP ERROR ===');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    throw error;
  }
};
```

Then check the browser console for detailed output.

---

## Summary: Most Common Fixes

| Error | Fix |
|-------|-----|
| 401 Unauthorized | Add JWT token to Authorization header |
| 400 Invalid payload | Check purpose and email fields are present |
| 500 Auth error | Restart server with fresh env vars |
| 500 Email error | Verify RESEND_API_KEY in .env |
| 429 Too many requests | Wait before retrying |

---

## Need Help?

1. Check server logs first (terminal output)
2. Check browser DevTools Network tab
3. Verify request format matches documentation
4. Ensure .env variables are set
5. Restart server after env changes

