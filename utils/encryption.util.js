const crypto = require("crypto");

/**
 * Encryption Utility for Sensitive Data
 * Uses AES-256-CBC for secure encryption/decryption
 */

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32); // Use env var or generate
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Encrypt data using AES-256-CBC
 * @param {string|number} plaintext - Data to encrypt
 * @returns {string} Encrypted data as hex string (IV + encrypted text)
 */
const encrypt = (plaintext) => {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY),
      iv
    );

    let encrypted = cipher.update(String(plaintext), "utf8", "hex");
    encrypted += cipher.final("hex");

    // Prepend IV to encrypted data
    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("Encryption error:", error.message);
    throw new Error("Encryption failed");
  }
};

/**
 * Decrypt data using AES-256-CBC
 * @param {string} encryptedData - Encrypted data as hex string (IV + encrypted text)
 * @returns {string} Decrypted plaintext
 */
const decrypt = (encryptedData) => {
  try {
    const parts = encryptedData.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY),
      iv
    );

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw new Error("Decryption failed");
  }
};

/**
 * Hash sensitive data using SHA-256
 * @param {string} data - Data to hash
 * @param {string} salt - Optional salt for additional security
 * @returns {string} Hashed data as hex string
 */
const hashData = (data, salt = "") => {
  try {
    const hash = crypto
      .createHash("sha256")
      .update(data + salt)
      .digest("hex");
    return hash;
  } catch (error) {
    console.error("Hashing error:", error.message);
    throw new Error("Hashing failed");
  }
};

/**
 * Compare hashed data (for verification without storing plaintext)
 * @param {string} plaintext - Plain data to compare
 * @param {string} hash - Hashed value to compare against
 * @param {string} salt - Same salt used for hashing
 * @returns {boolean} True if match, false otherwise
 */
const verifyHash = (plaintext, hash, salt = "") => {
  try {
    const computedHash = hashData(plaintext, salt);
    return computedHash === hash;
  } catch (error) {
    console.error("Hash verification error:", error.message);
    return false;
  }
};

/**
 * Generate cryptographically secure random hex string
 * @param {number} length - Length of string (default 32)
 * @returns {string} Random hex string
 */
const generateRandomToken = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};

/**
 * Generate HMAC signature for webhook verification
 * @param {string|object} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {string} HMAC signature as hex string
 */
const generateHMAC = (data, secret) => {
  try {
    const dataString = typeof data === "string" ? data : JSON.stringify(data);
    return crypto
      .createHmac("sha256", secret)
      .update(dataString)
      .digest("hex");
  } catch (error) {
    console.error("HMAC generation error:", error.message);
    throw new Error("HMAC generation failed");
  }
};

/**
 * Verify HMAC signature
 * @param {string|object} data - Data that was signed
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key used for signing
 * @returns {boolean} True if signature is valid, false otherwise
 */
const verifyHMAC = (data, signature, secret) => {
  try {
    const computedSignature = generateHMAC(data, secret);
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature)
    );
  } catch (error) {
    console.error("HMAC verification error:", error.message);
    return false;
  }
};

module.exports = {
  encrypt,
  decrypt,
  hashData,
  verifyHash,
  generateRandomToken,
  generateHMAC,
  verifyHMAC,
};
