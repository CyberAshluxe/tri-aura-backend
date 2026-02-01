/**
 * OTP Endpoint Diagnostic Test
 * Tests both /api/wallet/fund and /api/wallet/otp/send endpoints
 */

require("dotenv").config();
const axios = require("axios");
const jwt = require("jsonwebtoken");

const API_URL = "http://localhost:7145";
const JWT_SECRET = process.env.JWT_SECRET;

// Create a test token
const testToken = jwt.sign(
  { id: "68f1ecd7be14d3d20a7d81c4" }, // Example user ID from your logs
  JWT_SECRET,
  { expiresIn: "1h" }
);

console.log("🔍 OTP ENDPOINT DIAGNOSTIC TEST");
console.log("================================\n");
console.log(`📝 Test Token: ${testToken.substring(0, 50)}...\n`);

// Test 1: Check /api/wallet/otp/send endpoint
async function testOTPSendEndpoint() {
  console.log("TEST 1: POST /api/wallet/otp/send");
  console.log("----------------------------------");

  try {
    const response = await axios.post(
      `${API_URL}/api/wallet/otp/send`,
      {
        purpose: "wallet_funding",
        email: "ashluxe124@gmail.com",
      },
      {
        headers: {
          Authorization: `Bearer ${testToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ SUCCESS - OTP Send Endpoint Working");
    console.log(`📧 Response:`, JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log("❌ FAILED - OTP Send Endpoint Error");
    console.log(`📋 Status: ${error.response?.status}`);
    console.log(`📋 Message: ${error.response?.data?.message || error.message}`);
    console.log(
      `📋 Details:`,
      JSON.stringify(error.response?.data, null, 2)
    );
    return false;
  }
}

// Test 2: Check /api/wallet/fund endpoint (full flow)
async function testWalletFundEndpoint() {
  console.log("\n\nTEST 2: POST /api/wallet/fund (Full Flow)");
  console.log("------------------------------------------");

  try {
    const response = await axios.post(
      `${API_URL}/api/wallet/fund`,
      {
        amount: 1000,
        email: "ashluxe124@gmail.com",
      },
      {
        headers: {
          Authorization: `Bearer ${testToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ SUCCESS - Wallet Fund Endpoint Working");
    console.log(`📋 Response:`, JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log("❌ FAILED - Wallet Fund Endpoint Error");
    console.log(`📋 Status: ${error.response?.status}`);
    console.log(`📋 Message: ${error.response?.data?.message || error.message}`);
    console.log(
      `📋 Details:`,
      JSON.stringify(error.response?.data, null, 2)
    );
    return false;
  }
}

// Test 3: Check OTP Status endpoint
async function testOTPStatusEndpoint() {
  console.log("\n\nTEST 3: GET /api/wallet/otp/status");
  console.log("-----------------------------------");

  try {
    const response = await axios.get(
      `${API_URL}/api/wallet/otp/status?purpose=wallet_funding`,
      {
        headers: {
          Authorization: `Bearer ${testToken}`,
        },
      }
    );

    console.log("✅ SUCCESS - OTP Status Endpoint Working");
    console.log(`📋 Response:`, JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log("❌ FAILED - OTP Status Endpoint Error");
    console.log(`📋 Status: ${error.response?.status}`);
    console.log(`📋 Message: ${error.response?.data?.message || error.message}`);
    console.log(
      `📋 Details:`,
      JSON.stringify(error.response?.data, null, 2)
    );
    return false;
  }
}

// Test 4: Check if Resend is configured
async function testResendConfiguration() {
  console.log("\n\nTEST 4: Resend Configuration Check");
  console.log("-----------------------------------");

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log("❌ RESEND_API_KEY not configured in .env");
    return false;
  }

  console.log(`✅ RESEND_API_KEY configured: ${resendKey.substring(0, 10)}...`);

  // Try to validate with Resend API
  try {
    const response = await axios.get("https://api.resend.com/emails", {
      headers: {
        Authorization: `Bearer ${resendKey}`,
      },
    });
    console.log("✅ Resend API is accessible");
    return true;
  } catch (error) {
    console.log(
      `⚠️  Resend API check: ${error.response?.status || error.message}`
    );
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log("\n📌 SYSTEM STATUS CHECK");
  console.log("======================");
  console.log(`🖥️  API URL: ${API_URL}`);
  console.log(`✅ JWT_SECRET: ${JWT_SECRET ? "Configured" : "NOT CONFIGURED"}`);
  console.log(
    `✅ RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "Configured" : "NOT CONFIGURED"}\n`
  );

  await testResendConfiguration();
  await testOTPSendEndpoint();
  await testWalletFundEndpoint();
  await testOTPStatusEndpoint();

  console.log("\n\n✅ DIAGNOSTIC TEST COMPLETE");
  console.log("============================\n");
}

// Run the test
runAllTests().catch(console.error);
