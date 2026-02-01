# Wallet Deduction 400 Error - FIX

## Problem
Your frontend was sending:
```javascript
POST /api/wallet/deduct
{
  "amount": 5000,
  "email": "user@example.com"  // ❌ WRONG FIELD
}
```

But the backend validation requires:
```javascript
POST /api/wallet/deduct
{
  "amount": 5000,        // ✅ Required
  "items": [             // ✅ Required - was MISSING
    {
      "name": "Purchase",
      "quantity": 1,
      "price": 5000
    }
  ],
  "notes": "optional"    // Optional
}
```

## Root Cause
In your `walletService.js`, the `initiateDeduction()` function was sending:
```javascript
const response = await apiClient.post('/api/wallet/deduct', {
  amount,  // ✅ Correct
  email,   // ❌ Wrong - backend doesn't expect this field
});
```

The backend validation fails because:
1. **Missing `items` field** - The validator explicitly requires `items` to be present and be an array
2. **Extra `email` field** - Backend doesn't use email for deduction (that's handled in OTP flow separately)

## Solution
Update your `walletService.js` functions:

### 1. Fix `initiateDeduction()` function:
```javascript
/**
 * ✅ FIXED VERSION
 */
export const initiateDeduction = async (amount, items = null) => {
  try {
    console.log('💸 [INITIATE DEDUCTION] Starting wallet deduction process...');
    console.log('📊 Amount:', amount);
    
    // Create default items array if not provided
    const itemsArray = items || [{
      name: 'Purchase',
      quantity: 1,
      price: amount,
    }];
    
    // ✅ CORRECT PAYLOAD - includes required 'items' field
    const response = await apiClient.post('/api/wallet/deduct', {
      amount,           // Required
      items: itemsArray, // ✅ Required - was missing!
    });
    
    console.log('✅ [INITIATE DEDUCTION] Response received:', response.data);
    
    // Extract transactionReference
    const responseData = response.data.data || response.data;
    const txRef = responseData?.transactionReference 
      || responseData?.transaction_reference;
    
    return {
      success: true,
      data: responseData,
      transactionReference: txRef,
      message: response.data.message,
      otpExpiresIn: responseData?.otpExpiresIn || 300,
    };
  } catch (error) {
    console.error('❌ [INITIATE DEDUCTION] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to initiate deduction',
      details: error.response?.data?.details,
    };
  }
};
```

### 2. Fix `initiateCheckout()` function:
```javascript
/**
 * ✅ FIXED VERSION
 */
export const initiateCheckout = async (amount, cartItems = null) => {
  try {
    console.log('🛒 [INITIATE CHECKOUT] Starting checkout...');
    
    // Create items array from cart or use default
    let items;
    if (cartItems && Array.isArray(cartItems) && cartItems.length > 0) {
      items = cartItems;  // Use actual cart items if provided
    } else {
      // Otherwise create default item
      items = [{
        name: 'Checkout Purchase',
        quantity: 1,
        price: amount,
      }];
    }
    
    // ✅ Now passing items array to initiateDeduction
    const deductionResponse = await initiateDeduction(amount, items);
    
    if (!deductionResponse.success) {
      return {
        success: false,
        error: deductionResponse.error,
        details: deductionResponse.details,
      };
    }
    
    return {
      success: true,
      data: deductionResponse.data,
      transactionReference: deductionResponse.transactionReference,
      message: deductionResponse.message,
      otpExpiresIn: 300,
    };
  } catch (error) {
    console.error('❌ [INITIATE CHECKOUT] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to initiate checkout',
    };
  }
};
```

## Key Changes

| Before | After |
|--------|-------|
| `email` parameter in payload | ❌ Removed - not needed for deduction |
| `items` field | ❌ Missing | ✅ Now required and provided |
| Default item | ❌ None | ✅ Auto-created if not provided |
| Parameter structure | `initiateDeduction(amount, email)` | ✅ `initiateDeduction(amount, items = null)` |

## Backend Validation (unchanged)
The backend in `utils/validation.util.js` expects:
```javascript
const validatePurchasePayload = (payload) => {
  const errors = [];

  if (!payload.amount) errors.push("amount is required");
  if (!payload.items) errors.push("items must be an array");  // ✅ This was failing

  // ... validation continues
};
```

## Example Items Format
You can send items like:
```javascript
// Simple checkout with one item
items = [{
  name: 'Product Purchase',
  quantity: 1,
  price: 5000,
}]

// Multiple items
items = [
  { name: 'Item 1', quantity: 1, price: 2000 },
  { name: 'Item 2', quantity: 2, price: 1500 },
]

// With more details
items = [
  {
    id: 'product-123',
    name: 'Blue Shirt',
    quantity: 1,
    price: 5000,
    sku: 'SHIRT-001',
  }
]
```

## Testing
Once you update `walletService.js`:

```javascript
// Before OTP verification step
const checkoutResult = await initiateCheckout(5000);

// Should now respond with:
// {
//   success: true,
//   transactionReference: "PURCHASE-1234567890-abc123",
//   message: "Wallet deduction initiated. OTP sent to your email.",
//   otpExpiresIn: 300,
//   data: { ... }
// }
```

## Summary
- ✅ Replace your `initiateDeduction()` and `initiateCheckout()` functions with the fixed versions
- ✅ The `items` array is now **required** and auto-generated if not provided
- ✅ The `email` field is no longer sent (OTP handling is separate)
- ✅ Your 400 error should now resolve to proper OTP flow

A fixed version of the relevant functions is provided in `WALLET_SERVICE_FIXED.js` in your workspace.
