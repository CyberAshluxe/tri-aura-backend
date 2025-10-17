require("dotenv").config();
const customerModel = require("../models/user.model");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
// const { GoogleGenerativeAI } = require('@google/generative-ai');

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// ===== Email Transporter =====
function createTransporter() {
  if (!EMAIL_USER || !EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}

// ===== GET Signup Page =====
const getSignup = (req, res) => {
  res.json({ 
    message: "Signup page endpoint", 
    status: true 
  });
};

// ===== GET Signin Page =====
const getSignIn = (req, res) => {
  res.json({ 
    message: "Signin page endpoint", 
    status: true 
  });
};

// ===== Register New User =====
const postRegister = async (req, res) => {
  try {
    const payload = { ...req.body, email: (req.body.email || "").toLowerCase() };

    const existingUser = await customerModel.findOne({ email: payload.email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    payload.password = await bcrypt.hash(payload.password, salt);

    const newCustomer = new customerModel(payload);
    await newCustomer.save();

    // Send welcome email
    const transporter = createTransporter();
    if (transporter) {
      transporter.sendMail({
        from: EMAIL_USER,
        to: payload.email,
        subject: "Welcome to Our Application",
        html: `<h2>🎉 Welcome!</h2><p>Your account has been created successfully.</p>`
      }, (err, info) => {
        if (err) console.error("Email error:", err);
        else console.log("Welcome email sent:", info.response);
      });
    }

    const token = jwt.sign({ id: newCustomer._id, email: newCustomer.email }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ message: "Registration successful", token, user: newCustomer });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ===== Login User =====
const postLogin = async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase();
    const { password } = req.body;

    const foundCustomer = await customerModel.findOne({ email });
    if (!foundCustomer) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, foundCustomer.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: foundCustomer._id, email: foundCustomer.email }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Login successful",
      token,
      user: { id: foundCustomer._id, firstName: foundCustomer.firstName, email: foundCustomer.email }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ===== Google OAuth =====
const postGoogleAuth = async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();

    let user = await customerModel.findOne({ email: payload.email });
    if (!user) {
      user = await customerModel.create({
        firstName: payload.given_name || payload.name.split(" ")[0],
        lastName: payload.family_name || payload.name.split(" ").slice(1).join(" ") || "User",
        email: payload.email,
        googleId: payload.sub,
        picture: payload.picture,
      });
    }

    const jwtToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token: jwtToken, user });

  } catch (err) {
    console.error("Google auth error:", err);
    res.status(400).json({ message: "Google authentication failed" });
  }
};

// ===== Sign In User =====
const postSignIn = async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase();
    const { password } = req.body;

    const foundCustomer = await customerModel.findOne({ email });
    if (!foundCustomer) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, foundCustomer.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: foundCustomer._id, email: foundCustomer.email }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Sign in successful",
      token,
      user: { id: foundCustomer._id, firstName: foundCustomer.firstName, email: foundCustomer.email }
    });

  } catch (err) {
    console.error("Sign in error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ===== Get User Profile =====
const getProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ status: false, message: "No token provided" });

    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) return res.status(401).json({ status: false, message: "Invalid authorization header" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const foundCustomer = await customerModel.findById(decoded.id);
    if (!foundCustomer) return res.status(404).json({ status: false, message: "User not found" });

    res.json({
      status: true,
      user: {
        id: foundCustomer._id,
        firstName: foundCustomer.firstName,
        lastName: foundCustomer.lastName,
        email: foundCustomer.email,
        picture: foundCustomer.picture,
        paymentHistory: foundCustomer.paymentHistory
      },
      message: "Profile retrieved successfully"
    });

  } catch (err) {
    if (err.name === "TokenExpiredError") return res.status(401).json({ status: false, message: "Token expired" });
    console.error("Profile error:", err);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// ===== Protected Dashboard =====
const getDashboard = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ status: false, message: "No token provided" });

    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) return res.status(401).json({ status: false, message: "Invalid authorization header" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const foundCustomer = await customerModel.findById(decoded.id);
    if (!foundCustomer) return res.status(404).json({ status: false, message: "User not found" });

    res.json({
      status: true,
      user: {
        id: foundCustomer._id,
        firstName: foundCustomer.firstName,
        lastName: foundCustomer.lastName,
        email: foundCustomer.email
      },
      message: "Dashboard accessed successfully"
    });

  } catch (err) {
    if (err.name === "TokenExpiredError") return res.status(401).json({ status: false, message: "Token expired" });
    console.error("Dashboard error:", err);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};




// ===== Export ALL functions =====
module.exports = {
  getSignup,
  getSignIn,
  postRegister,
  postLogin,
  postSignIn,
  postGoogleAuth,
  getProfile,
  getDashboard
};
