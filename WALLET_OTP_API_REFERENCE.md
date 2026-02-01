# Wallet OTP API Reference

Complete API documentation for wallet funding and OTP verification flow.

## Overview

The wallet OTP system uses a two-step process:
1. **Initiate Funding** - Create a transaction and send OTP to user's email
2. **Verify OTP** - Submit OTP code with the transaction reference to complete funding

---

## 1. Initiate Wallet Funding

### Endpoint
```
POST /api/wallet/fund
```

### Authentication
**Required:** Bearer token in Authorization header
```
Authorization: Bearer <JWT_TOKEN>
```

### Request Body
```json
{
  "amount": 5000,
  "email": "user@example.com"
}
```

### Request Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Amount to fund (NGN) |
| `email` | string | Yes | Email address (optional, can be different from registered email) |

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Wallet funding initiated. OTP sent to your email.",
  "transactionReference": "FUND-1705948200123-abc12345",
  "otpExpiresIn": 300,
  "otpSent": true,
  "fraudRiskLevel": "low",
  "requiresManualReview": false,
  "nextStep": "otp_verification",
  "warning": null
}
```

### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `transactionReference` | string | **🔴 IMPORTANT: Use this value for OTP verification** |
| `otpExpiresIn` | number | OTP expiration time in seconds (300 = 5 minutes) |
| `otpSent` | boolean | Whether OTP was successfully sent |
| `fraudRiskLevel` | string | Risk assessment: "low", "medium", "high" |
| `requiresManualReview` | boolean | Whether manual review is required |

### ❌ Common Errors

**400 - Bad Request**
```json
{
  "message": "Invalid funding amount",
  "details": "Amount must be between 100 and 5000000"
}
```

**404 - User Not Found**
```json
{
  "message": "User not found"
}
```

**500 - OTP Creation Failed**
```json
{
  "success": false,
  "message": "Failed to generate OTP",
  "details": "OTP creation error message"
}
```

---

## 2. Verify OTP for Wallet Funding

### Endpoints (Both work identically)
```
POST /api/wallet/verify-otp
POST /api/wallet/otp/verify
```

### Authentication
**Required:** Bearer token in Authorization header
```
Authorization: Bearer <JWT_TOKEN>
```

### Request Body
```json
{
  "otp": "603645",
  "transaction_reference": "FUND-1705948200123-abc12345"
}
```

### Request Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `otp` | string | Yes | 6-digit OTP code received via email |
| `transaction_reference` | string | Yes | **Transaction reference from /api/wallet/fund response** |

### ✅ What to Send (Step by Step)

**Step 1:** Call `/api/wallet/fund`
```javascript
const fundResponse = await axios.post('/api/wallet/fund', {
  amount: 5000,
  email: 'user@example.com'
});

// Extract transactionReference
const { transactionReference, otpExpiresIn } = fundResponse.data;
console.log('Transaction Reference:', transactionReference);
// Output: FUND-1705948200123-abc12345
```

**Step 2:** Wait for user to receive OTP email and enter it

**Step 3:** Call `/api/wallet/otp/verify` or `/api/wallet/verify-otp`
```javascript
const verifyResponse = await axios.post('/api/wallet/otp/verify', {
  otp: '603645',           // User enters this
  transaction_reference: transactionReference  // Use value from Step 1
});
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "OTP verified and wallet funded successfully",
  "newBalance": 50000,
  "transactionId": "TXN-1705948200123"
}
```

### ❌ Common Errors

**404 - Transaction Not Found**
```json
{
  "message": "Transaction not found or already processed",
  "hint": "Make sure you're using the transactionReference field from the initiate response, not otpId"
}
```
✅ **Fix:** Use the exact `transactionReference` value from the `/api/wallet/fund` response

**400 - Invalid OTP**
```json
{
  "message": "Invalid OTP. 2 attempts remaining."
}
```
✅ **Fix:** Check the OTP code, ensure it hasn't expired (5 minutes)

**400 - OTP Expired**
```json
{
  "message": "OTP has expired. Please request a new one."
}
```
✅ **Fix:** Call `/api/wallet/fund` again to get a new OTP

**400 - Too Many Attempts**
```json
{
  "message": "Maximum OTP attempts exceeded. Please try again after 15 minutes."
}
```
✅ **Fix:** Wait 15 minutes before retrying

---

## 3. Send OTP (Resend)

### Endpoint
```
POST /api/wallet/otp/send
```

### Authentication
**Required:** Bearer token

### Request Body
```json
{
  "purpose": "wallet_funding",
  "email": "user@example.com"
}
```

### Purpose Values
- `wallet_funding` - OTP for wallet funding
- `wallet_deduction` - OTP for wallet purchases

### Response (Success - 200)
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 300,
  "email": "user@example.com"
}
```

---

## 4. Get OTP Status

### Endpoint
```
GET /api/wallet/otp/status?purpose=wallet_funding
```

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `purpose` | string | Yes | "wallet_funding" or "wallet_deduction" |

### Response (Success - 200)
```json
{
  "success": true,
  "purpose": "wallet_funding",
  "hasPendingOTP": true,
  "expiresIn": 245,
  "attemptsRemaining": 2,
  "isLocked": false
}
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Initiates Wallet Funding                            │
│    POST /api/wallet/fund                                    │
│    Body: { amount: 5000, email: 'user@example.com' }        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌─────────────────────────┐
                │ Response includes:      │
                │ transactionReference    │
                │ otpExpiresIn: 300       │
                └─────────────────────────┘
                            │
                            ▼
            ┌──────────────────────────────────────┐
            │ OTP sent to user's email             │
            │ User receives and reads OTP code     │
            └──────────────────────────────────────┘
                            │
                            ▼
        ┌─────────────────────────────────────────────────┐
        │ 2. User Submits OTP for Verification            │
        │    POST /api/wallet/verify-otp                  │
        │    Body: {                                      │
        │      otp: "603645",                             │
        │      transaction_reference:                     │
        │        "FUND-1705948200123-abc12345"            │
        │    }                                            │
        └─────────────────────────────────────────────────┘
                            │
                            ▼
                ┌─────────────────────────┐
                │ ✅ Wallet Funded        │
                │ Balance Updated         │
                │ Transaction Complete    │
                └─────────────────────────┘
```

---

## Frontend Implementation Checklist

- [ ] Store `transactionReference` from Step 1 response
- [ ] **Never** use `otpId` for verification (use `transactionReference`)
- [ ] Implement 5-minute countdown timer for OTP expiration
- [ ] Show remaining attempts to user (starts at 3)
- [ ] Handle 15-minute lockout on max attempts exceeded
- [ ] Show fraud risk level to user if "high"
- [ ] Implement retry logic with exponential backoff
- [ ] Log transaction ID on successful funding

---

## Error Handling Guide

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Missing/Invalid token | Ensure JWT token is valid and not expired |
| 403 Forbidden | Wallet is inactive | Contact support to reactivate wallet |
| 404 Not Found (transaction) | Wrong transaction_reference | Use exact value from /api/wallet/fund response |
| 400 Invalid OTP | Wrong code or expired | Check email, OTP expires in 5 minutes |
| 429 Too Many Requests | Rate limit exceeded | Wait before retrying |
| 500 Server Error | Backend issue | Check server logs, retry after 30s |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/wallet/fund` | 10 requests | per minute |
| `/api/wallet/verify-otp` | 3 attempts | per 15 minutes |
| `/api/wallet/otp/send` | 3 requests | per minute |
| `/api/wallet/otp/status` | 10 requests | per minute |

---

## Security Best Practices

1. **Never log OTP** - Don't store or display OTP in console logs
2. **Use HTTPS only** - All requests must be over HTTPS in production
3. **Validate email** - Ensure email format before sending
4. **Implement CSRF** - Use CSRF tokens on the frontend
5. **Timeout sessions** - Session expires after 24 hours
6. **Monitor fraud** - Track multiple failed OTP attempts
7. **Secure storage** - Store JWT tokens in httpOnly cookies (not localStorage)

---

## Examples

### cURL
```bash
# Step 1: Initiate funding
curl -X POST http://localhost:7145/api/wallet/fund \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "email": "user@example.com"}'

# Step 2: Verify OTP
curl -X POST http://localhost:7145/api/wallet/verify-otp \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"otp": "603645", "transaction_reference": "FUND-1705948200123-abc12345"}'
```

### JavaScript (Axios)
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:7145',
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

// Step 1: Initiate funding
const { data: fundData } = await api.post('/api/wallet/fund', {
  amount: 5000,
  email: 'user@example.com'
});

const { transactionReference } = fundData;

// Step 2: Verify OTP
const { data: verifyData } = await api.post('/api/wallet/otp/verify', {
  otp: userEnteredOTP,
  transaction_reference: transactionReference
});

console.log('Funding successful!', verifyData);
```

### TypeScript (React)
```typescript
interface WalletFundRequest {
  amount: number;
  email: string;
}

interface WalletFundResponse {
  success: boolean;
  transactionReference: string;
  otpExpiresIn: number;
  otpSent: boolean;
}

interface OTPVerifyRequest {
  otp: string;
  transaction_reference: string;
}

interface OTPVerifyResponse {
  success: boolean;
  newBalance: number;
  transactionId: string;
}

// Usage
const fundWallet = async (amount: number, email: string) => {
  const response = await axios.post<WalletFundResponse>(
    '/api/wallet/fund',
    { amount, email }
  );
  return response.data;
};

const verifyOTP = async (otp: string, ref: string) => {
  const response = await axios.post<OTPVerifyResponse>(
    '/api/wallet/otp/verify',
    { otp, transaction_reference: ref }
  );
  return response.data;
};
```

---

## Support

For issues or questions:
1. Check the error handling guide above
2. Review logs: `/logs/wallet.log`
3. Contact backend team with transaction ID

Last Updated: January 22, 2026
