require("dotenv").config();
const sellerModel = require("../models/seller.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// ===== Email Transporter =====
function createTransporter() {
  if (!EMAIL_USER || !EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}

// ===== GET Seller Signup Page =====
const getSignup = (req, res) => {
  res.render('signup', { title: 'Seller Signup' });
};

// ===== Register New Seller =====
const postRegister = async (req, res) => {
  try {
    const payload = { ...req.body, email: (req.body.email || "").trim().toLowerCase() };

    const existingSeller = await sellerModel.findOne({ email: payload.email });
    if (existingSeller) return res.status(400).json({ message: "Seller already exists" });

    const salt = await bcrypt.genSalt(10);
    payload.password = await bcrypt.hash(payload.password.trim(), salt);

    const newSeller = new sellerModel(payload);
    await newSeller.save();

    // Send welcome email
    const transporter = createTransporter();
    if (transporter) {
      transporter.sendMail({
        from: EMAIL_USER,
        to: payload.email,
        subject: "Welcome to Our Application",
        html: `<h2>🎉 Welcome Seller!</h2><p>Your seller account has been created successfully.</p>`
      }, (err, info) => {
        if (err) console.error("Email error:", err);
        else console.log("Welcome email sent:", info.response);
      });
    }

    const token = jwt.sign({ id: newSeller._id, email: newSeller.email, role: 'seller' }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ message: "Seller registration successful", token, user: newSeller });

  } catch (err) {
    console.error("Seller register error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ===== GET Seller Login Page =====
const getLogin = (req, res) => {
  res.render('login', { title: 'Seller Login' });
};

// ===== POST Seller Login =====
const postLogin = async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const { password } = req.body;

    const foundSeller = await sellerModel.findOne({ email });
    if (!foundSeller) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password.trim(), foundSeller.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: foundSeller._id, email: foundSeller.email, role: 'seller' }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Seller login successful",
      token,
      user: { id: foundSeller._id, firstName: foundSeller.firstName, email: foundSeller.email, role: 'seller' }
    });

  } catch (err) {
    console.error("Seller login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ===== Export functions =====
module.exports = {
  getSignup,
  postRegister,
  getLogin,
  postLogin
};
