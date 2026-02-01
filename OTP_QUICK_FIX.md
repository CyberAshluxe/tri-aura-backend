# OTP 500 Error - Quick Reference Card

## The Problem
```
AxiosError: Request failed with status code 500
Error sending OTP
```

## The Solution (in order of likelihood)

### 1️⃣ Missing JWT Token (90% chance this is it!)

```javascript
// ❌ WRONG
axios.post('/api/wallet/otp/send', { purpose, email })

// ✅ CORRECT  
const token = localStorage.getItem('token');
axios.post('/api/wallet/otp/send', { purpose, email }, {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

### 2️⃣ Wrong Request Format (5% chance)

```javascript
// ✅ CORRECT format
{ 
  purpose: 'wallet_funding',      // ← exactly this
  email: 'user@example.com'       // ← valid email
}

// ❌ WRONG
{ purpose: 'walletFunding' }      // ← wrong casing
{ email: 'not-email' }             // ← invalid email
```

### 3️⃣ No Resend API Key (5% chance)

```bash
# Check .env
type .env | Select-String RESEND
# Should show: RESEND_API_KEY=re_...

# If not there, add it and restart:
# Press Ctrl+C and run: node index.js
```

---

## How to Verify It Works

### Check Server Logs
```
✅ OTP email sent via Resend (ID: ...)
```

### Check Response
```json
{
  "success": true,
  "message": "OTP sent to user@example.com",
  "expiresIn": 300
}
```

### Check Email
Email arrives in 1-2 seconds with 6-digit OTP code

---

## Debug: Copy & Paste

### Frontend Code
```javascript
const token = localStorage.getItem('token');
console.log('1. Token:', token ? '✅' : '❌ MISSING');

const headers = { 'Authorization': `Bearer ${token}` };
console.log('2. Headers:', headers);

const data = { purpose: 'wallet_funding', email: 'test@example.com' };
console.log('3. Data:', data);

axios.post('http://localhost:7145/api/wallet/otp/send', data, { headers })
  .then(r => console.log('✅ Response:', r.data))
  .catch(e => console.error('❌ Error:', e.response?.data || e.message));
```

### Server Terminal Check
Look for one of these:

**Success** ✅
```
✅ [sendWalletOTP] User found
✅ OTP email sent via Resend
```

**Error** ❌
```
❌ No user ID found          → Add JWT token
❌ No validatedData          → Check purpose/email  
❌ Email service not config  → Restart server
```

---

## 3-Step Fix

### Step 1: Update Frontend
Add `Authorization: Bearer ${token}` to request headers

### Step 2: Verify Request
Check DevTools Network tab that Authorization header is present

### Step 3: Check Server Logs
Should see ✅ OTP email sent via Resend

---

## Still Not Working?

1. Copy **entire server terminal output** (all the logs)
2. Copy **DevTools Network Response tab**
3. Show **your current request code**
4. Share those 3 things → Problem solved!

---

## Key Points to Remember

✅ Always send JWT token in Authorization header
✅ Purpose must be: `'wallet_funding'` or `'wallet_deduction'`
✅ Email must be valid: `user@domain.com`
✅ Server must be restarted if .env changed
✅ Server logs show exactly what went wrong
✅ DevTools Network tab shows the response

