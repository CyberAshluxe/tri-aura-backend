// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { OAuth2Client } = require("google-auth-library");
const customerRouter = require("./routes/user.route");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// MongoDB connection
const URI = process.env.URI;
mongoose
  .connect(URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
app.use("/user", customerRouter);
const sellerRouter = require("./routes/seller.route");
app.use("/seller", sellerRouter);
const adminRouter = require("./routes/admin.route");
app.use("/admin", adminRouter);
const contactRouter = require("./routes/contact.route");
app.use("/api/contact", contactRouter);
const paymentRouter = require("./routes/payment.route");
app.use("/payment", paymentRouter);

// Google OAuth client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google Auth route - works for all roles
app.post("/user/google-auth", async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    // Require all models
    const User = require("./models/user.model");
    const Seller = require("./models/seller.model");
    const Admin = require("./models/admin.model");

    // Check if user exists in any model
    let user = await User.findOne({ email: payload.email });
    let role = 'user';
    if (!user) {
      user = await Seller.findOne({ email: payload.email });
      role = 'seller';
    }
    if (!user) {
      user = await Admin.findOne({ email: payload.email });
      role = 'admin';
    }
    if (!user) {
      // Create in User model if not found
      user = await User.create({
        firstName: payload.given_name,
        lastName: payload.family_name,
        email: payload.email,
        googleId: payload.sub,
      });
      role = 'user';
    } else {
      role = user.role;
    }

    // Create JWT token with role
    const jwt = require("jsonwebtoken");
    const tokenJWT = jwt.sign(
      { id: user._id, email: user.email, role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token: tokenJWT, user: { ...user.toObject(), role } });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(400).json({ success: false, message: "Invalid Google token" });
  }
});
// Check if Gemini API key is configured
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not configured in environment variables");
  console.log(
    "Please create a .env file with: GEMINI_API_KEY=your_api_key_here"
  );
  process.exit(1);
}

// Initialize Gemini client safely
let genAI;
try {
  // CORRECTED: The API key should be passed directly as a string.
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log("✅ Gemini client initialized successfully");
} catch (initErr) {
  console.error("❌ Failed to initialize Gemini client:", initErr.message);
  // Set genAI to null so the app can still run, and the /chat endpoint will fail gracefully.
  genAI = null;
}

// Chat endpoint - FINAL ROBUST VERSION
app.post("/chat", async (req, res) => {
  if (!genAI) {
    console.error("Gemini client not initialized.");
    return res.status(500).json({ error: "AI client is not initialized" });
  }

  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "The 'message' field is required" });
    }

    // --- Start of New, More Robust History Processing ---

    // 1. Map roles and content format correctly.
    //    The Gemini API uses 'model' for the AI's role, not 'assistant'.
    const formattedHistory = (history || []).map((msg) => ({
      role: msg.role === "assistant" ? "model" : msg.role,
      parts: [{ text: msg.content }],
    }));

    // 2. Find the index of the first 'user' message.
    const firstUserIndex = formattedHistory.findIndex(
      (msg) => msg.role === "user"
    );

    // 3. If user messages exist, slice the array to start from the first one.
    //    This removes any initial AI greetings and ensures the conversation
    //    starts correctly from the user's perspective.
    const validHistory =
      firstUserIndex !== -1 ? formattedHistory.slice(firstUserIndex) : [];

    // --- End of New History Processing ---

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const chat = model.startChat({
      history: validHistory, // Use the cleaned and validated history
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage(message);
    const response = result.response;
    const text = response.text();

    res.json({ response: text });
  } catch (error) {
    console.error("❌ Gemini API Error:", error.message);
    res.status(500).json({
      error: "An error occurred while communicating with the AI",
      details: error.message,
    });
  }
});

// Simple home redirect
app.get("/", (req, res) => res.redirect("/user/signup"));

// Start server
const PORT = process.env.PORT || 7145;
app.listen(PORT, () =>
  console.log(`\ud83d\ude80 Server running on port ${PORT}`)
);
