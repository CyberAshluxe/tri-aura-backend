# OTP Frontend Implementation - Working Example

This file shows you EXACTLY how to implement OTP sending in your frontend that will work with the backend.

## Option 1: Using Axios (Recommended)

```javascript
// walletService.js
import axios from 'axios';

const API_URL = 'http://localhost:7145'; // Change for production

/**
 * Send OTP for wallet operations
 * This is the function you need to call from your components
 */
export const sendWalletOTP = async (purpose, email) => {
  // Step 1: Get JWT token from localStorage
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new Error('Not logged in. Please login first.');
  }

  // Step 2: Create axios instance with token
  const axiosInstance = axios.create({
    baseURL: API_URL,
    headers: {
      'Authorization': `Bearer ${token}`,      // ← CRITICAL: Include token
      'Content-Type': 'application/json'
    }
  });

  // Step 3: Send request
  try {
    console.log('📨 Sending OTP...');
    
    const response = await axiosInstance.post('/api/wallet/otp/send', {
      purpose: purpose,  // 'wallet_funding' or 'wallet_deduction'
      email: email       // valid email address
    });

    console.log('✅ OTP sent successfully!');
    console.log('Response:', response.data);
    
    return response.data; // Returns { success, message, expiresIn, otpId }

  } catch (error) {
    console.error('❌ Error sending OTP:', error.response?.data || error.message);
    
    const errorMessage = error.response?.data?.message || 'Failed to send OTP';
    throw new Error(errorMessage);
  }
};

/**
 * Check OTP countdown status
 */
export const checkOTPStatus = async (purpose) => {
  const token = localStorage.getItem('token');

  if (!token) {
    throw new Error('Not logged in.');
  }

  const axiosInstance = axios.create({
    baseURL: API_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  });

  try {
    const response = await axiosInstance.get('/api/wallet/otp/status', {
      params: { purpose }
    });

    return response.data; // Returns { exists, isValid, isLocked, attempts, expiresIn }

  } catch (error) {
    console.error('❌ Error checking OTP status:', error.message);
    throw error;
  }
};
```

---

## Option 2: Using Fetch API

```javascript
// If you prefer native Fetch instead of Axios

export const sendWalletOTP = async (purpose, email) => {
  const token = localStorage.getItem('token');

  if (!token) {
    throw new Error('Not logged in');
  }

  try {
    const response = await fetch('http://localhost:7145/api/wallet/otp/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,     // ← CRITICAL
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        purpose: purpose,
        email: email
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send OTP');
    }

    const data = await response.json();
    console.log('✅ OTP sent:', data);
    
    return data;

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
};
```

---

## Using in React Component

```javascript
// OTPWallet.jsx - React component example
import React, { useState } from 'react';
import { sendWalletOTP, checkOTPStatus } from './walletService';

function OTPWallet() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expiresIn, setExpiresIn] = useState(null);

  const handleSendOTP = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Send OTP for wallet funding
      const result = await sendWalletOTP('wallet_funding', email);

      setSuccess(`✅ OTP sent to ${email}`);
      setExpiresIn(result.expiresIn);

      // Optional: Start countdown timer
      if (result.expiresIn) {
        startCountdown(result.expiresIn);
      }

    } catch (err) {
      setError(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const startCountdown = (seconds) => {
    const interval = setInterval(() => {
      setExpiresIn(s => {
        if (s <= 1) {
          clearInterval(interval);
          setError('OTP expired');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h2>Send OTP for Wallet Funding</h2>
      
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        style={{ padding: '10px', marginRight: '10px' }}
      />

      <button 
        onClick={handleSendOTP} 
        disabled={loading || !email}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        {loading ? 'Sending...' : 'Send OTP'}
      </button>

      {expiresIn && (
        <p style={{ color: '#007bff' }}>
          ⏱️ OTP expires in: <strong>{expiresIn}s</strong>
        </p>
      )}

      {error && (
        <p style={{ color: 'red' }}>
          {error}
        </p>
      )}

      {success && (
        <p style={{ color: 'green' }}>
          {success}
        </p>
      )}
    </div>
  );
}

export default OTPWallet;
```

---

## Using with React Context API

If you're using context for state management:

```javascript
// WalletContext.jsx
import React, { createContext, useState, useCallback } from 'react';
import { sendWalletOTP, checkOTPStatus } from './walletService';

export const WalletContext = createContext();

export function WalletProvider({ children }) {
  const [otpStatus, setOtpStatus] = useState(null);
  const [otpError, setOtpError] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const handleSendOTP = useCallback(async (purpose, email) => {
    try {
      setOtpLoading(true);
      setOtpError(null);

      const result = await sendWalletOTP(purpose, email);
      
      setOtpStatus({
        exists: true,
        isValid: true,
        expiresIn: result.expiresIn,
        otpId: result.otpId,
        message: result.message
      });

      return result;

    } catch (error) {
      setOtpError(error.message);
      throw error;
    } finally {
      setOtpLoading(false);
    }
  }, []);

  const handleCheckStatus = useCallback(async (purpose) => {
    try {
      const status = await checkOTPStatus(purpose);
      setOtpStatus(status);
      return status;
    } catch (error) {
      setOtpError(error.message);
    }
  }, []);

  return (
    <WalletContext.Provider value={{
      otpStatus,
      otpError,
      otpLoading,
      sendOTP: handleSendOTP,
      checkStatus: handleCheckStatus
    }}>
      {children}
    </WalletContext.Provider>
  );
}

// Usage in component:
// const { sendOTP, otpStatus, otpLoading } = useContext(WalletContext);
// await sendOTP('wallet_funding', 'user@example.com');
```

---

## Testing in Browser Console

Copy & paste this in DevTools Console:

```javascript
// 1. Check if you're logged in
console.log('Token:', localStorage.getItem('token') ? '✅' : '❌');

// 2. Send OTP
fetch('http://localhost:7145/api/wallet/otp/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    purpose: 'wallet_funding',
    email: 'test@example.com'  // Change to real email
  })
})
.then(r => r.json())
.then(data => console.log('✅ Response:', data))
.catch(e => console.error('❌ Error:', e));
```

---

## Checklist Before Testing

- [ ] Backend server is running (`node index.js`)
- [ ] You are logged in (have JWT token in localStorage)
- [ ] Code includes `Authorization: Bearer ${token}` header
- [ ] Purpose is `'wallet_funding'` or `'wallet_deduction'`
- [ ] Email is valid (user@domain.com)
- [ ] RESEND_API_KEY is in .env
- [ ] Browser DevTools Console shows request

---

## Expected Results

### Browser Console Output (Success)
```
📨 Sending OTP...
✅ OTP sent successfully!
Response: {
  success: true,
  message: "OTP sent to user@example.com",
  expiresIn: 300,
  otpId: "507f1f77bcf86cd799439011"
}
```

### Server Terminal Output (Success)
```
🔵 [sendWalletOTP] Request received
✅ [sendWalletOTP] User found: user@example.com
✅ [sendWalletOTP] OTP created successfully
✅ [OTP Service] OTP email sent via Resend (ID: ...)
```

### Email (Success)
OTP code arrives in inbox within 1-2 seconds

---

## Common Mistakes to Avoid

```javascript
// ❌ WRONG: Missing header
axios.post('/api/wallet/otp/send', data)

// ✅ CORRECT: Include header
axios.post('/api/wallet/otp/send', data, {
  headers: { 'Authorization': `Bearer ${token}` }
})

// ❌ WRONG: Wrong purpose format
{ purpose: 'walletFunding' }

// ✅ CORRECT: Exact format
{ purpose: 'wallet_funding' }

// ❌ WRONG: No token
fetch('/api/wallet/otp/send', { ... })

// ✅ CORRECT: Include token
fetch('/api/wallet/otp/send', {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

---

## If It Still Doesn't Work

1. Open DevTools (F12)
2. Go to Network tab
3. Send OTP
4. Click the failed request
5. Share:
   - Status code (should be 200 on success, 500 if error)
   - Response body (error message)
   - Request headers (should have Authorization)

That will help diagnose the exact issue!

