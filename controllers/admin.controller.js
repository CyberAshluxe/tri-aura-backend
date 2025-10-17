require("dotenv").config();
const adminModel = require("../models/admin.model");
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

// ===== GET Admin Signup Page =====
const getSignup = (req, res) => {
  res.render('admin_signup', { title: 'Admin Signup' });
};

// ===== Register New Admin =====
const postRegister = async (req, res) => {
  try {
    const payload = { ...req.body, email: (req.body.email || "").trim().toLowerCase() };

    const existingAdmin = await adminModel.findOne({ email: payload.email });
    if (existingAdmin) return res.status(400).json({ message: "Admin already exists" });

    const salt = await bcrypt.genSalt(10);
    payload.password = await bcrypt.hash(payload.password.trim(), salt);

    const newAdmin = new adminModel(payload);
    await newAdmin.save();

    // Send welcome email
    const transporter = createTransporter();
    if (transporter) {
      transporter.sendMail({
        from: EMAIL_USER,
        to: payload.email,
        subject: "Welcome to Our Application",
        html: `<h2>🎉 Welcome Admin!</h2><p>Your admin account has been created successfully.</p>`
      }, (err, info) => {
        if (err) console.error("Email error:", err);
        else console.log("Welcome email sent:", info.response);
      });
    }

    const token = jwt.sign({ id: newAdmin._id, email: newAdmin.email, role: 'admin' }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ message: "Admin registration successful", token, user: newAdmin });

  } catch (err) {
    console.error("Admin register error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ===== GET Admin Login Page =====
const getLogin = (req, res) => {
  res.render('admin_login', { title: 'Admin Login' });
};

// ===== POST Admin Login =====
const postLogin = async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const { password } = req.body;

    const foundAdmin = await adminModel.findOne({ email });
    if (!foundAdmin) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password.trim(), foundAdmin.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: foundAdmin._id, email: foundAdmin.email, role: 'admin' }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Admin login successful",
      token,
      user: { id: foundAdmin._id, firstName: foundAdmin.firstName, email: foundAdmin.email, role: 'admin' }
    });

  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ===== GET Admin Dashboard =====
const getDashboard = (req, res) => {
  // For simplicity, assuming auth is handled via middleware or token; here just render
  res.render('admin_dashboard', { title: 'Admin Dashboard', user: req.user || {} });
};

// ===== Export functions =====
module.exports = {
  getSignup,
  postRegister,
  getLogin,
  postLogin,
  getDashboard
};
