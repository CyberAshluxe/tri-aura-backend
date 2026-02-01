/**
 * Detailed OTP & Wallet Fund Debug Test
 * Shows exact errors from /api/wallet/fund endpoint
 */

require("dotenv").config();
const axios = require("axios");
const jwt = require("jsonwebtoken");

const API_URL = "http://localhost:7145";
const JWT_SECRET = process.env.JWT_SECRET;

// Create a test token
const testToken = jwt.sign(
  { id: "68f1ecd7be14d3d20a7d81c4" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

console.log("🔍 DETAILED DEBUG TEST\n");
console.log("======================\n");

async function testWalletFundWithDebug() {
  console.log("TEST: POST /api/wallet/fund (With Full Debug)");
  console.log("---------------------------------------------\n");

  const payload = {
    amount: 1000,
    email: "ashluxe124@gmail.com",
  };

  console.log("📤 Request Payload:");
  console.log(JSON.stringify(payload, null, 2));
  console.log("\n📤 Request Headers:");
  console.log(`Authorization: Bearer ${testToken.substring(0, 30)}...`);
  console.log(`Content-Type: application/json\n`);

  try {
    const response = await axios.post(`${API_URL}/api/wallet/fund`, payload, {
      headers: {
        Authorization: `Bearer ${testToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ SUCCESS\n");
    console.log("📥 Response Status:", response.status);
    console.log("📥 Response Data:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log("❌ FAILED\n");
    console.log("📥 Error Status:", error.response?.status);
    console.log("📥 Error Message:", error.response?.data?.message);
    console.log("📥 Error Details:");
    console.log(JSON.stringify(error.response?.data, null, 2));

    if (error.message) {
      console.log("\n🔧 Low-level Error:");
      console.log(error.message);
    }

    // Show request that was sent
    console.log("\n📋 Request Config:");
    console.log(`URL: ${error.config?.url}`);
    console.log(`Method: ${error.config?.method}`);
    console.log(`Data: ${error.config?.data}`);
  }
}

async function testOTPSendStandalone() {
  console.log("\n\nTEST: POST /api/wallet/otp/send (Standalone)");
  console.log("----------------------------------------------\n");

  const payload = {
    purpose: "wallet_funding",
    email: "ashluxe124@gmail.com",
  };

  console.log("📤 Request Payload:");
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${API_URL}/api/wallet/otp/send`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${testToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("\n✅ SUCCESS\n");
    console.log("📥 Response Status:", response.status);
    console.log("📥 Response Data:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log("\n❌ FAILED\n");
    console.log("📥 Error Status:", error.response?.status);
    console.log("📥 Error Message:", error.response?.data?.message);
    console.log("📥 Error Details:");
    console.log(JSON.stringify(error.response?.data, null, 2));
  }
}

async function runTests() {
  await testWalletFundWithDebug();
  await testOTPSendStandalone();

  console.log("\n\n✅ DEBUG TEST COMPLETE\n");
}

runTests().catch(console.error);
