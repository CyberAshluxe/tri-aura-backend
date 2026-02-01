require("dotenv").config();
const { Resend } = require("resend");

let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("✅ Resend client initialized successfully");
} else {
  console.error("❌ RESEND_API_KEY is not configured in environment variables");
  resend = null;
}

// ===== POST Contact Form =====
const postContact = async (req, res) => {
  if (!resend) {
    console.error("Resend client not initialized.");
    return res.status(500).json({ message: "Email service is not configured" });
  }

  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" });
    }

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: "onboarding@triora.name.ng", // Use your verified domain
      to: process.env.TO_EMAIL, // Your email
      subject: "Message From Triora",
      html: `
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({ message: "Failed to send email" });
    }

    res.json({ message: "Message sent successfully", data });

  } catch (err) {
    console.error("Contact error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { postContact };
