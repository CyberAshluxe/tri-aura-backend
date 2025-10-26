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
        subject: "🎉 Welcome to Triora Seller Hub!",

html: `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f6f7fb; padding: 40px 0;">
    <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden;">
      
      <div style="background: linear-gradient(135deg, #ff7a00, #ffb347); color: white; text-align: center; padding: 30px 20px;">
        <h1 style="margin: 0; font-size: 26px;">Welcome Seller 🎉</h1>
      </div>
      
      <div style="padding: 30px 25px; color: #333;">
        <h2 style="color: #ff7a00; margin-top: 0;">Your Seller Account Is Ready!</h2>
        <p style="font-size: 16px; line-height: 1.6;">
          Congratulations on becoming part of <strong>Triora</strong>! Your seller account has been created successfully.
        </p>
        <p style="font-size: 16px; line-height: 1.6;">
          You can now list your products, manage your store, and start reaching customers across our growing marketplace.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://triora-six.vercel.app//seller-dashboard" 
             style="background-color: #ff7a00; color: white; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; display: inline-block;">
            Go to Seller Dashboard
          </a>
        </div>

        <p style="font-size: 14px; color: #777; text-align: center;">
          If you didn’t register as a seller, you can safely ignore this email.
        </p>
      </div>
      
      <div style="background: #f2f2f2; text-align: center; padding: 15px; font-size: 13px; color: #888;">
        &copy; ${new Date().getFullYear()} Triora Marketplace. All rights reserved.
      </div>

    </div>
  </div>
`

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
