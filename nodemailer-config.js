const nodemailer = require("nodemailer");
require("dotenv").config();

// Create a more robust transporter with proper configuration
const createTransporter = async () => {
  // For Gmail, we need to use OAuth2 for production environments
  // For simplicity in development, we can use the following config
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Adding these options improves reliability
    tls: {
      rejectUnauthorized: false, // Helps with some certificate issues
    },
    // Set reasonable timeouts
    pool: true,
    maxConnections: 1,
    maxMessages: 5,
    rateDelta: 1000,
    rateLimit: 5
  });

  // Verify connection configuration
  try {
    await transporter.verify();
    console.log("Nodemailer is configured correctly");
    return transporter;
  } catch (error) {
    console.error("Nodemailer verification failed:", error);
    // Still return the transporter, but we've logged the issue
    return transporter;
  }
};

module.exports = createTransporter;
