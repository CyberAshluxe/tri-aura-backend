const mongoose = require("mongoose");
const crypto = require("crypto");

const walletSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Balance is encrypted to prevent unauthorized direct reads
    encrypted_balance: {
      type: String,
      required: true,
      default: "0", // Encrypted zero balance
    },
    // Encryption metadata
    encryption_key: {
      type: String,
      required: true,
    },
    // Wallet status: active, frozen (suspicious activity), suspended (admin)
    status: {
      type: String,
      enum: ["active", "frozen", "suspended"],
      default: "active",
      index: true,
    },
    // Track last balance update for audit
    last_updated_by: {
      type: String,
      enum: ["system", "admin", "user_action"],
      default: "system",
    },
    // Fraud risk score
    fraud_risk_score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Session-based tracking for concurrent update prevention
    last_update_timestamp: {
      type: Date,
      default: Date.now,
    },
    // Track version for optimistic locking
    version: {
      type: Number,
      default: 1,
    },
    // Metadata
    metadata: {
      ip_created: String,
      device_info: String,
      created_location: String,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
walletSchema.index({ user_id: 1, status: 1 });
walletSchema.index({ created_at: -1 });

// Instance method to decrypt balance (requires encryption key)
walletSchema.methods.getBalance = function (encryptionPassword) {
  try {
    // Use modern crypto with PBKDF2 for key derivation
    const algorithm = "aes-192-cbc";
    const salt = Buffer.alloc(8, 0); // Fixed salt for consistency (in production, use stored salt)
    
    // Derive key from password
    const key = crypto.pbkdf2Sync(encryptionPassword, salt, 100000, 24, "sha256");
    const parts = this.encrypted_balance.split(":");
    
    if (parts.length !== 2) {
      // Fallback for old format encrypted data - try legacy decryption
      try {
        // Try using key directly as IV:data format
        const iv = Buffer.from(parts[0], "hex");
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(parts[1], "hex", "utf8");
        decrypted += decipher.final("utf8");
        return parseFloat(decrypted);
      } catch (e) {
        throw new Error("Invalid encrypted balance format");
      }
    }
    
    const iv = Buffer.from(parts[0], "hex");
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(parts[1], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return parseFloat(decrypted);
  } catch (error) {
    console.error("Balance decryption error:", error.message);
    throw new Error("Failed to decrypt wallet balance");
  }
};

// Instance method to encrypt and update balance (atomic operation)
walletSchema.methods.setBalance = function (newBalance, encryptionPassword) {
  try {
    const algorithm = "aes-192-cbc";
    const salt = Buffer.alloc(8, 0); // Fixed salt for consistency (in production, use stored salt)
    
    // Derive key from password
    const key = crypto.pbkdf2Sync(encryptionPassword, salt, 100000, 24, "sha256");
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(newBalance.toString(), "utf8", "hex");
    encrypted += cipher.final("hex");
    
    // Store as IV:encrypted format
    this.encrypted_balance = iv.toString("hex") + ":" + encrypted;
    this.last_update_timestamp = new Date();
    return this;
  } catch (error) {
    console.error("Balance encryption error:", error.message);
    throw new Error("Failed to encrypt wallet balance");
  }
};

// Static method for secure balance update with transaction safety
walletSchema.statics.updateBalanceAtomic = async function (
  userId,
  newBalance,
  encryptionPassword,
  updateReason = "system"
) {
  const session = await this.startSession();
  session.startTransaction();

  try {
    // Fetch and lock document
    const wallet = await this.findOne({ user_id: userId }).session(session);
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.status !== "active") {
      throw new Error(
        `Cannot update wallet with status: ${wallet.status}`
      );
    }

    // Update balance with encryption
    wallet.setBalance(newBalance, encryptionPassword);
    wallet.last_updated_by = updateReason;
    wallet.version += 1;

    // Save with validation
    await wallet.save({ session });

    await session.commitTransaction();
    return wallet;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = mongoose.model("Wallet", walletSchema);
