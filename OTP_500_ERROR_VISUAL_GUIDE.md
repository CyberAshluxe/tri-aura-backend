# OTP 500 Error - Visual Debugging Guide

## What's Happening

```
Frontend                          Backend
--------                          -------
Request -----(no token)----->    500 Error ❌
"Send OTP"                        "No user ID found"
                                  Can't identify user!
```

## The Fix

```
Frontend                          Backend
--------                          -------
Request -----(with token)----->  ✅ Success!
"Send OTP"                        "User found"
                                  Create OTP
                                  Send email
                                  200 OK
```

---

## Request Breakdown

### Before (❌ Wrong)
```
POST /api/wallet/otp/send
Content-Type: application/json

{
  "purpose": "wallet_funding",
  "email": "user@example.com"
}

[NO AUTHORIZATION HEADER]
```

### After (✅ Correct)
```
POST /api/wallet/otp/send
Authorization: Bearer eyJhbGc...  ← ADD THIS!
Content-Type: application/json

{
  "purpose": "wallet_funding",
  "email": "user@example.com"
}
```

---

## Code Comparison

### Current Code (❌ Not Working)
```javascript
// walletService.js
export const sendOTP = async (purpose, email) => {
  const response = await axios.post(
    'http://localhost:7145/api/wallet/otp/send',
    { purpose, email }
    // ❌ Missing headers!
  );
  return response.data;
};
```

### Fixed Code (✅ Working)
```javascript
// walletService.js
export const sendOTP = async (purpose, email) => {
  const token = localStorage.getItem('token');  // ← GET TOKEN
  
  const response = await axios.post(
    'http://localhost:7145/api/wallet/otp/send',
    { purpose, email },
    {
      headers: {
        'Authorization': `Bearer ${token}`,    // ← SEND TOKEN
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
};
```

---

## Step-by-Step: How Backend Processes Request

### Without Token (❌ Error)
```
1. Request arrives at /api/wallet/otp/send
   └─ No Authorization header

2. Middleware checks for token
   └─ req.user = undefined
   └─ userId = undefined

3. Controller tries to use userId
   └─ userId is null/undefined
   └─ Can't identify user

4. Return 500 Error ❌
   └─ "No user ID found in request"
```

### With Token (✅ Success)
```
1. Request arrives at /api/wallet/otp/send
   └─ Authorization: Bearer <token>

2. Middleware verifies token
   └─ Token is valid
   └─ req.user = { id: "123", email: "user@..." }
   └─ userId = "123"

3. Controller uses userId
   └─ Find user in database
   └─ Create OTP record
   └─ Send email

4. Return 200 Success ✅
   └─ { success: true, expiresIn: 300, otpId: "..." }
```

---

## Browser DevTools Check

### Network Tab (F12 → Network)

#### ❌ Wrong (No Auth)
```
POST /api/wallet/otp/send    500 (Error)
Headers:
  Content-Type: application/json
  [No Authorization header]

Response:
{
  "message": "No authorization token provided"
}
```

#### ✅ Correct (With Auth)
```
POST /api/wallet/otp/send    200 (OK)
Headers:
  Authorization: Bearer eyJhbGc...
  Content-Type: application/json

Response:
{
  "success": true,
  "message": "OTP sent to user@example.com",
  "expiresIn": 300,
  "otpId": "507f1f77..."
}
```

---

## Console Output Comparison

### ❌ Error Case
```javascript
// Browser Console
❌ Error sending OTP: Request failed with status code 500
   Message: "No authorization token provided"
   
// Server Terminal
❌ [sendWalletOTP] No user ID found in request
```

### ✅ Success Case
```javascript
// Browser Console
📨 Sending OTP request...
✅ OTP sent successfully!
Response: {
  success: true,
  message: "OTP sent to user@example.com",
  expiresIn: 300
}

// Server Terminal
🔵 [sendWalletOTP] Request received
🔵 [sendWalletOTP] req.user: { id: '507f...' }
✅ [sendWalletOTP] User found: user@example.com
✅ [sendWalletOTP] OTP created successfully
✅ [OTP Service] OTP email sent via Resend
```

---

## Request Payload Validation

### Purpose Field
```
'wallet_funding' ✅      ← wallet funding
'wallet_deduction' ✅    ← purchase/deduction
'walletFunding' ❌       ← WRONG casing
'WALLET_FUNDING' ❌      ← WRONG casing
'fund' ❌                ← WRONG value
```

### Email Field
```
'user@example.com' ✅           ← valid
'john.doe@domain.co.uk' ✅      ← valid
'not-an-email' ❌               ← invalid
'user@' ❌                       ← incomplete
'@example.com' ❌               ← missing local part
```

---

## Token Storage & Retrieval

### Where Token is Stored
```
Browser Local Storage:
┌─────────────────────────────────┐
│ Key: 'token'                    │
│ Value: eyJhbGciOiJIUzI1NiIs... │
└─────────────────────────────────┘
```

### How to Get It
```javascript
// JavaScript
const token = localStorage.getItem('token');
console.log('Token:', token);
// Output: eyJhbGciOiJIUzI1NiIs...

// DevTools Console
localStorage.getItem('token')
// Output: eyJhbGciOiJIUzI1NiIs...
```

### Token Format
```
Authorization: Bearer <token>
                      ↑↑↑
                    Space required!
                    
Correct:  Bearer eyJhbGc...  ✅
Wrong:    BearereyJhbGc...   ❌
Wrong:    eyJhbGc...         ❌
```

---

## Middleware Flow

```
Request
  ↓
1. authenticateToken middleware
   ├─ Check for Authorization header
   ├─ Extract JWT token
   ├─ Verify token signature
   ├─ Decode token → req.user = { id, email, role }
   └─ Call next()
  ↓
2. Rate Limit middleware
   ├─ Check rate limit for user
   ├─ Increment counter
   └─ Call next()
  ↓
3. Validation middleware
   ├─ Check req.body has required fields
   ├─ Validate purpose enum
   ├─ Validate email format
   ├─ Set req.validatedData = { purpose, email }
   └─ Call next()
  ↓
4. Controller (sendWalletOTP)
   ├─ Get userId from req.user.id ← Token must be here!
   ├─ Get data from req.validatedData ← Validation must pass!
   ├─ Create OTP record
   ├─ Send email
   └─ Return response
```

---

## Error vs Success Flow

### Error Flow (Missing Token)
```
Request arrives
  ↓
authenticateToken checks for Authorization header
  ↓
Header not found!
  ↓
Return 401 Unauthorized
[Request never reaches controller]
```

### Success Flow (With Token)
```
Request arrives with Authorization header
  ↓
authenticateToken verifies token
  ↓
Token valid!
  ↓
req.user is set
  ↓
Validation middleware checks payload
  ↓
Payload valid!
  ↓
req.validatedData is set
  ↓
Controller runs with user data
  ↓
OTP created and email sent
  ↓
Return 200 with success response
```

---

## Quick Visual Reference

| Component | Status | Action |
|-----------|--------|--------|
| Token present | ❌ No | Add to Authorization header |
| Token valid | ⚠️ Check | Verify in localStorage |
| Payload format | ❌ Wrong | Use exact case/format |
| Email valid | ❌ Bad | Use user@domain.com format |
| Server running | ✅ Yes | Keep running on port 7145 |
| Resend configured | ✅ Yes | Already set in .env |

---

## One-Minute Fix

```javascript
// Find this code:
await axios.post('/api/wallet/otp/send', data)

// Replace with this:
const token = localStorage.getItem('token');
await axios.post('/api/wallet/otp/send', data, {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

Done! ✅

