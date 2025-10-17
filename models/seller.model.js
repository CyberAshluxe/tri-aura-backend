const mongoose = require("mongoose");

const sellerSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  googleId: { type: String },
  picture: { type: String },
  role: { type: String, default: 'seller' }
}, { timestamps: true });

module.exports = mongoose.model("Seller", sellerSchema);
