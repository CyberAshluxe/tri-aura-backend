const { OTPVerification } = require("../models/transaction.model");
const { hashData, verifyHash, generateRandomToken } = require("../utils/encryption.util");
const { Resend } = require("resend");

/**
 * OTP Service
 * Handles OTP generation, verification, and expiration
 */

// Configure email service - using Resend (more reliable than Gmail)
let emailClient;
if (process.env.RESEND_API_KEY) {
  emailClient = new Resend(process.env.RESEND_API_KEY);
  console.log("✅ Resend email service initialized");
} else {
  console.error("❌ RESEND_API_KEY not configured");
}

/**
 * Generate a 6-digit OTP
 * @returns {string} OTP as string
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create OTP record with hashing
 * @param {string} userId - User ID
 * @param {string} purpose - OTP purpose (wallet_funding, wallet_deduction, etc.)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Created OTP record with plain OTP
 */
const createOTP = async (userId, purpose, options = {}) => {
  try {
    const plainOTP = generateOTP();
    const otpHash = hashData(plainOTP, userId); // Use userId as salt for uniqueness

    // Check if user has recent OTP (prevent spam)
    const recentOTP = await OTPVerification.findOne({
      user_id: userId,
      purpose,
      is_used: false,
      is_locked: false,
      expires_at: { $gt: new Date() },
    });

    if (recentOTP && options.blockIfExists !== false) {
      throw new Error("OTP already generated. Please use the existing OTP or wait for expiration.");
    }

    // Invalidate previous OTPs for this purpose
    await OTPVerification.updateMany(
      {
        user_id: userId,
        purpose,
        is_used: false,
      },
      {
        is_used: true,
        used_at: new Date(),
      }
    );

    // Create new OTP record
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry
    const otpRecord = await OTPVerification.create({
      user_id: userId,
      otp_hash: otpHash,
      purpose,
      expires_at: expiresAt,
      attempts: 0,
      max_attempts: 3,
      is_used: false,
      delivery_method: options.deliveryMethod || "email",
      transaction_reference: options.transactionReference,
    });

    return {
      otp: plainOTP, // Return plain OTP only for delivery, never stored
      otpId: otpRecord._id,
      expiresAt,
      expiresIn: 300, // 5 minutes in seconds
    };
  } catch (error) {
    console.error("OTP creation error:", error.message);
    throw error;
  }
};

/**
 * Send OTP via email
 * @param {string} email - Recipient email
 * @param {string} otp - Plain OTP to send
 * @param {string} purpose - OTP purpose
 * @returns {Promise<boolean>} True if sent successfully
 */
const sendOTPEmail = async (email, otp, purpose) => {
  try {
    if (!emailClient) {
      throw new Error("Email service not configured. RESEND_API_KEY missing.");
    }

    const purposeText = {
      wallet_funding: "Wallet Funding",
      wallet_deduction: "Purchase Confirmation",
      sensitive_action: "Sensitive Action",
    }[purpose] || "Verification";

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your Verification Code</h2>
        <p>You requested a verification code for <strong>${purposeText}</strong>.</p>
        
        <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <p style="font-size: 14px; color: #666; margin: 0;">Your OTP Code:</p>
          <p style="font-size: 36px; font-weight: bold; color: #007bff; letter-spacing: 5px; margin: 10px 0;">${otp}</p>
          <p style="font-size: 12px; color: #999; margin: 0;">Valid for 5 minutes</p>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          <strong>Important Security Notes:</strong><br>
          • Never share this code with anyone<br>
          • TRI-AURA staff will never ask for this code<br>
          • This code expires in 5 minutes<br>
          • If you didn't request this, please ignore this email
        </p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message, please do not reply to this email.
        </p>
      </div>
    `;

    // Send email via Resend
    console.log(`📧 [OTP Service] Sending OTP email via Resend to ${email}`);
    
    let result;
    try {
      result = await emailClient.emails.send({
        from: "onboarding@triora.name.ng",
        to: email,
        subject: `Your ${purposeText} OTP Code`,
        html: emailHtml,
      });
    } catch (resendError) {
      console.error("❌ [OTP Service] Resend API call failed:", resendError.message);
      console.error("❌ [OTP Service] Stack:", resendError.stack);
      throw new Error(`Resend API Error: ${resendError.message}`);
    }

    // Check for error in response
    if (result.error) {
      console.error("❌ [OTP Service] Resend returned error:", result.error);
      const errorMsg = result.error.message || JSON.stringify(result.error);
      throw new Error(`Email service error: ${errorMsg}`);
    }

    // Verify we got an ID back (successful send) - Resend returns { data: { id: ... } }
    const messageId = result.data?.id || result.id;
    if (!messageId) {
      console.error("❌ [OTP Service] Resend response missing ID:", result);
      throw new Error("Email send response invalid - no message ID returned");
    }

    console.log(`✅ [OTP Service] OTP email sent to ${email} via Resend (ID: ${messageId})`);
    return true;
  } catch (error) {
    console.error("❌ [OTP Service] OTP email send error:", error.message);
    console.error("❌ [OTP Service] Error stack:", error.stack);
    throw error;
  }
};

/**
 * Verify OTP
 * @param {string} userId - User ID
 * @param {string} plainOTP - Plain OTP entered by user
 * @param {string} purpose - OTP purpose
 * @returns {Promise<object>} Verification result with success status
 */
const verifyOTP = async (userId, plainOTP, purpose) => {
  try {
    // Find the OTP record
    const otpRecord = await OTPVerification.findOne({
      user_id: userId,
      purpose,
      is_used: false,
      is_locked: false,
    });

    if (!otpRecord) {
      throw new Error("No valid OTP found for this operation");
    }

    // Check if OTP has expired
    if (new Date() > otpRecord.expires_at) {
      otpRecord.is_used = true;
      otpRecord.used_at = new Date();
      await otpRecord.save();
      throw new Error("OTP has expired. Please request a new one.");
    }

    // Check attempt limit
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      otpRecord.is_locked = true;
      otpRecord.locked_until = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
      await otpRecord.save();
      throw new Error(
        "Maximum OTP attempts exceeded. Please try again after 15 minutes."
      );
    }

    // Verify OTP hash
    const isValid = verifyHash(plainOTP, otpRecord.otp_hash, userId);

    if (!isValid) {
      // Increment attempts
      otpRecord.attempts += 1;
      await otpRecord.save();

      const remaining = otpRecord.max_attempts - otpRecord.attempts;
      throw new Error(
        `Invalid OTP. ${remaining > 0 ? `${remaining} attempts remaining.` : "Maximum attempts exceeded."}`
      );
    }

    // Mark OTP as used
    otpRecord.is_used = true;
    otpRecord.used_at = new Date();
    otpRecord.attempts = 0; // Reset on successful verification
    await otpRecord.save();

    return {
      success: true,
      message: "OTP verified successfully",
      otpId: otpRecord._id,
    };
  } catch (error) {
    console.error("OTP verification error:", error.message);
    throw error;
  }
};

/**
 * Check if OTP is valid (exists and not expired)
 * @param {string} userId - User ID
 * @param {string} purpose - OTP purpose
 * @returns {Promise<boolean>} True if valid OTP exists
 */
const isOTPValid = async (userId, purpose) => {
  try {
    const otpRecord = await OTPVerification.findOne({
      user_id: userId,
      purpose,
      is_used: false,
      is_locked: false,
    });

    if (!otpRecord) return false;
    if (new Date() > otpRecord.expires_at) return false;

    return true;
  } catch (error) {
    console.error("OTP validation check error:", error.message);
    return false;
  }
};

/**
 * Get OTP status for a user
 * @param {string} userId - User ID
 * @param {string} purpose - OTP purpose
 * @returns {Promise<object>} OTP status
 */
const getOTPStatus = async (userId, purpose) => {
  try {
    const otpRecord = await OTPVerification.findOne({
      user_id: userId,
      purpose,
    })
      .sort({ created_at: -1 })
      .select("-otp_hash");

    if (!otpRecord) {
      return { exists: false };
    }

    return {
      exists: true,
      isValid: !otpRecord.is_used && new Date() <= otpRecord.expires_at,
      isLocked: otpRecord.is_locked,
      attempts: otpRecord.attempts,
      maxAttempts: otpRecord.max_attempts,
      expiresAt: otpRecord.expires_at,
      expiresIn: Math.ceil((otpRecord.expires_at - new Date()) / 1000),
    };
  } catch (error) {
    console.error("OTP status check error:", error.message);
    throw error;
  }
};

/**
 * Clean up expired OTPs (run periodically)
 * @returns {Promise<number>} Number of OTPs deleted
 */
const cleanupExpiredOTPs = async () => {
  try {
    const result = await OTPVerification.deleteMany({
      expires_at: { $lt: new Date() },
      is_used: true,
    });

    console.log(`✅ Cleaned up ${result.deletedCount} expired OTPs`);
    return result.deletedCount;
  } catch (error) {
    console.error("OTP cleanup error:", error.message);
    throw error;
  }
};

module.exports = {
  generateOTP,
  createOTP,
  sendOTPEmail,
  verifyOTP,
  isOTPValid,
  getOTPStatus,
  cleanupExpiredOTPs,
};
