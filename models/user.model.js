const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // For normal signup
  googleId: { type: String }, // For Google OAuth
  picture: { type: String },
  paymentHistory: [{
    transactionId: { type: String },
    amount: { type: Number },
    currency: { type: String },
    status: { type: String },
    date: { type: Date, default: Date.now }
  }],
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
