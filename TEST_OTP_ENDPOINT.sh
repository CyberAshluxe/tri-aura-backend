#!/bin/bash

# Test OTP Send Endpoint
# This script tests the /api/wallet/otp/send endpoint

API_URL="http://localhost:7145"
JWT_TOKEN="YOUR_JWT_TOKEN_HERE"  # Replace with actual JWT token
USER_EMAIL="test@example.com"     # Replace with user's email

echo "=========================================="
echo "Testing OTP Send Endpoint"
echo "=========================================="
echo ""

# Test 1: Send OTP with valid data
echo "Test 1: Sending OTP for wallet_funding..."
curl -X POST "$API_URL/api/wallet/otp/send" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"purpose\": \"wallet_funding\",
    \"email\": \"$USER_EMAIL\"
  }" \
  -v

echo ""
echo ""

# Test 2: Send OTP with missing email
echo "Test 2: Attempting send without email (should fail)..."
curl -X POST "$API_URL/api/wallet/otp/send" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"purpose\": \"wallet_funding\"
  }" \
  -v

echo ""
echo ""

# Test 3: Send OTP with missing purpose
echo "Test 3: Attempting send without purpose (should fail)..."
curl -X POST "$API_URL/api/wallet/otp/send" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER_EMAIL\"
  }" \
  -v

echo ""
echo ""

# Test 4: Check OTP Status
echo "Test 4: Checking OTP status..."
curl -X GET "$API_URL/api/wallet/otp/status?purpose=wallet_funding" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -v

echo ""
echo "=========================================="
echo "Tests completed"
echo "=========================================="
