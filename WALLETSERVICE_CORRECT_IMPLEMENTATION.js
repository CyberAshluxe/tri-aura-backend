// walletService.js - Correct Implementation

import axios from 'axios';

// Create axios instance with proper configuration
const API_BASE_URL = 'http://localhost:7145'; // Change to your API URL in production

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Send OTP for wallet operations
 * 
 * @param {string} purpose - 'wallet_funding' or 'wallet_deduction'
 * @param {string} email - User's email address
 * @returns {Promise} Response with { success, message, expiresIn, otpId }
 * @throws {Error} If request fails
 * 
 * @example
 * try {
 *   const result = await sendOTP('wallet_funding', 'user@example.com');
 *   console.log('OTP sent! Expires in:', result.expiresIn);
 * } catch (error) {
 *   console.error('Failed to send OTP:', error.message);
 * }
 */
export const sendOTP = async (purpose, email) => {
  try {
    // Step 1: Get JWT token from localStorage
    const token = localStorage.getItem('token');
    
    if (!token) {
      throw new Error('Not authenticated. Please login first.');
    }

    // Step 2: Validate input
    if (!purpose || !email) {
      throw new Error('Purpose and email are required');
    }

    if (purpose !== 'wallet_funding' && purpose !== 'wallet_deduction') {
      throw new Error(`Invalid purpose: ${purpose}. Must be 'wallet_funding' or 'wallet_deduction'`);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email: ${email}`);
    }

    // Step 3: Prepare request headers
    const headers = {
      'Authorization': `Bearer ${token}`, // ← CRITICAL: Must include token
      'Content-Type': 'application/json',
    };

    // Step 4: Prepare request body
    const data = {
      purpose,  // 'wallet_funding' | 'wallet_deduction'
      email,    // valid email address
    };

    // Step 5: Log request details (for debugging)
    console.log('📨 Sending OTP request...');
    console.log('  Purpose:', purpose);
    console.log('  Email:', email);
    console.log('  Token:', token ? 'Present (length: ' + token.length + ')' : 'Missing');

    // Step 6: Make API request
    const response = await api.post('/api/wallet/otp/send', data, { headers });

    // Step 7: Handle success response
    console.log('✅ OTP sent successfully!');
    console.log('  Response:', response.data);

    return response.data;

  } catch (error) {
    // Step 8: Handle errors
    console.error('❌ Error sending OTP:', error.message);

    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const errorData = error.response.data;

      console.error('  Status:', status);
      console.error('  Error response:', errorData);

      // Map status codes to user-friendly messages
      switch (status) {
        case 400:
          throw new Error(errorData.message || 'Invalid request. Check purpose and email.');
        case 401:
          throw new Error('Authentication failed. Please login again.');
        case 429:
          throw new Error('Too many requests. Please wait before trying again.');
        case 500:
          throw new Error(
            errorData.message || 
            'Server error. Check that the email service is configured correctly.'
          );
        default:
          throw new Error(errorData.message || `Error: ${status}`);
      }
    } else if (error.request) {
      // Request made but no response
      console.error('  No response from server');
      throw new Error('Cannot reach server. Is the server running?');
    } else {
      // Error in request setup
      throw error;
    }
  }
};

/**
 * Check OTP countdown status
 * 
 * @param {string} purpose - 'wallet_funding' or 'wallet_deduction'
 * @returns {Promise} Response with { exists, isValid, isLocked, attempts, maxAttempts, expiresIn }
 * @throws {Error} If request fails
 * 
 * @example
 * try {
 *   const status = await getOTPStatus('wallet_funding');
 *   if (status.exists && status.isValid) {
 *     console.log('OTP expires in:', status.expiresIn, 'seconds');
 *   }
 * } catch (error) {
 *   console.error('Failed to check OTP status:', error.message);
 * }
 */
export const getOTPStatus = async (purpose) => {
  try {
    // Get JWT token
    const token = localStorage.getItem('token');
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Prepare headers
    const headers = {
      'Authorization': `Bearer ${token}`,
    };

    // Make request
    const response = await api.get('/api/wallet/otp/status', {
      params: { purpose },
      headers,
    });

    return response.data;

  } catch (error) {
    console.error('❌ Error checking OTP status:', error.message);
    throw error;
  }
};

/**
 * Verify OTP
 * 
 * @param {string} otp - 6-digit OTP code
 * @param {string} transactionReference - Transaction reference from OTP send response
 * @returns {Promise} Response with verification result
 * @throws {Error} If verification fails
 * 
 * @example
 * try {
 *   const result = await verifyOTP('123456', 'txn_abc123');
 *   console.log('OTP verified!', result);
 * } catch (error) {
 *   console.error('Invalid OTP:', error.message);
 * }
 */
export const verifyOTP = async (otp, transactionReference) => {
  try {
    const token = localStorage.getItem('token');
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const data = {
      otp,
      transaction_reference: transactionReference,
    };

    const response = await api.post('/api/wallet/verify-otp', data, { headers });

    console.log('✅ OTP verified successfully!');
    return response.data;

  } catch (error) {
    console.error('❌ OTP verification failed:', error.message);
    throw error;
  }
};

// Usage example for a React component:
/*
import { useState } from 'react';
import { sendOTP, getOTPStatus } from './walletService';

function OTPSender() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSendOTP = async () => {
    try {
      setLoading(true);
      setError('');
      
      const result = await sendOTP('wallet_funding', email);
      
      setSuccess(`OTP sent to ${email}. Expires in ${result.expiresIn} seconds.`);
      
      // Optionally: Start countdown timer
      // checkOTPStatus('wallet_funding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input 
        value={email} 
        onChange={(e) => setEmail(e.target.value)} 
        placeholder="your@email.com" 
      />
      <button onClick={handleSendOTP} disabled={loading}>
        {loading ? 'Sending...' : 'Send OTP'}
      </button>
      
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </div>
  );
}
*/

export default api;
