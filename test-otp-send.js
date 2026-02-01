require("dotenv").config();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("./models/user.model");
const { Resend } = require("resend");

const BASE_URL = "http://localhost:7145";
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

async function testOTPSend() {
  try {
    // Connect to MongoDB
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(process.env.URI);
    console.log("✅ Connected to MongoDB");

    // Find or create a test user
    let user = await User.findOne({ email: "testotpuser@example.com" });
    
    if (!user) {
      console.log("📝 Creating test user...");
      const bcrypt = require("bcryptjs");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("TestPassword123!", salt);

      user = await User.create({
        firstName: "Test",
        lastName: "User",
        email: "testotpuser@example.com",
        password: hashedPassword,
      });
      console.log(`✅ Test user created with ID: ${user._id}`);
    } else {
      console.log(`✅ Test user found: ${user.email}`);
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    console.log(`🔐 JWT Token generated: ${token.substring(0, 50)}...`);

    // Test 1: Send OTP via HTTP request
    console.log("\n📧 Test 1: Sending OTP via API...");
    const otpPayload = {
      purpose: "wallet_funding",
      email: "ashluxe124@gmail.com", // Use verified email for Resend test
    };

    try {
      const http = require("http");
      const urlObj = new URL(`${BASE_URL}/api/wallet/otp/send`);

      const postData = JSON.stringify(otpPayload);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 7145,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          Authorization: `Bearer ${token}`,
        },
      };

      const result = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve({
              status: res.statusCode,
              body: JSON.parse(data),
            });
          });
        });

        req.on("error", (err) => {
          reject(err);
        });
        
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error("Request timeout"));
        });
        
        req.write(postData);
        req.end();
      });

      console.log(`📊 Response Status: ${result.status}`);
      console.log("📊 Response Body:", JSON.stringify(result.body, null, 2));

      if (result.status === 200) {
        console.log("✅ OTP API call successful!");
      } else {
        console.log("❌ OTP API call failed!");
      }
    } catch (err) {
      console.error("❌ API call error:", err.message);
      console.error("Stack:", err.stack);
    }

    // Test 2: Check Resend configuration
    console.log("\n🔍 Test 2: Checking Resend Configuration...");
    if (process.env.RESEND_API_KEY) {
      console.log("✅ RESEND_API_KEY is configured");
      const resend = new Resend(process.env.RESEND_API_KEY);
      console.log("✅ Resend client initialized");

      // Try to send a test email directly
      try {
        console.log("\n📧 Sending test email directly via Resend...");
        const testEmail = await resend.emails.send({
          from: "onboarding@triora.name.ng",
          to: "ashluxe124@gmail.com", // Use verified email
          subject: "OTP Test Email",
          html: `<h2>Test Email</h2><p>This is a test email to verify OTP functionality works.</p>`,
        });

        if (testEmail.error) {
          console.log("❌ Resend Error:", testEmail.error);
        } else {
          console.log(`✅ Test email sent successfully! Message ID: ${testEmail.id}`);
        }
      } catch (err) {
        console.log("❌ Failed to send test email:", err.message);
      }
    } else {
      console.log("❌ RESEND_API_KEY is NOT configured!");
    }

    // Test 3: Check OTP in database
    console.log("\n🔍 Test 3: Checking OTP in Database...");
    const { OTPVerification } = require("./models/transaction.model");
    const latestOTP = await OTPVerification.findOne({ user_id: user._id }).sort({
      created_at: -1,
    });

    if (latestOTP) {
      console.log("✅ OTP record found in database:");
      console.log(`   - User ID: ${latestOTP.user_id}`);
      console.log(`   - Purpose: ${latestOTP.purpose}`);
      console.log(`   - Is Used: ${latestOTP.is_used}`);
      console.log(`   - Expires At: ${latestOTP.expires_at}`);
      console.log(`   - OTP Hash: ${latestOTP.otp_hash.substring(0, 30)}...`);
    } else {
      console.log("❌ No OTP record found in database");
    }

    console.log("\n✅ All tests completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Test Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

testOTPSend();
