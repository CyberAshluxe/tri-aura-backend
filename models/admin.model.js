const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  googleId: { type: String },
  picture: { type: String },
  role: { type: String, default: 'admin' }
}, { timestamps: true });

module.exports = mongoose.model("Admin", adminSchema);
