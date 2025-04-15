const nodemailer = require("nodemailer");
require("dotenv").config();

// Create a more robust transporter with additional options
const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // use SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Use App Password, not regular password
  },
  tls: {
    rejectUnauthorized: false // Helps in some environments
  }
});

// Verify transporter connection at startup
transporter.verify(function(error, success) {
  if (error) {
    console.log("SMTP server connection error:", error);
  } else {
    console.log("SMTP server connection verified");
  }
});

module.exports = transporter;
