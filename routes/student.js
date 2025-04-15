const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Quiz = require('../models/Quiz');
const KeyLog = require('../models/KeyLog');
const Response = require('../models/Response');
const OTP = require('otp-generator');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { connectToDatabase } = require('../db');

dotenv.config();

// ========== MIDDLEWARE ==========

async function studentOnly(req, res, next) {
  try {
    if (!req.session || !req.session.studentEmail) {
      return res.redirect('/student/login');
    }
    
    // Ensure database is connected before checking authorization
    await connectToDatabase();
    return next();
  } catch (error) {
    console.error('[ERROR] Authentication middleware error:', error);
    return res.status(500).send('Server error. Please try again later.');
  }
}

// ========== ERROR HANDLER ==========

// Centralized error handler for database operations
async function withDbConnection(req, res, operation) {
  try {
    // Ensure database is connected
    await connectToDatabase();
    
    // Execute the operation
    return await operation();
  } catch (error) {
    console.error('[ERROR] Database operation failed:', error);
    
    // Send appropriate error response
    if (!res.headersSent) {
      res.status(500).send('Operation failed. Please try again later.');
    }
    return null;
  }
}

// ========== EMAIL SERVICE ==========

// Improved email service with better error handling and retry logic
async function sendEmail(to, subject, text, html, retryCount = 0) {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second delay between retries
  
  // Create a properly configured transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use TLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false, // For self-signed certificates on Render
    },
    debug: process.env.NODE_ENV === 'development', // Enable debug logs in development
    logger: process.env.NODE_ENV === 'development' // Enable logger in development
  });

  const mailOptions = {
    from: `"Quiz System" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html
  };

  try {
    // Verify connection configuration before sending
    await transporter.verify();
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[ERROR] Email sending failed (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
    
    // Retry logic
    if (retryCount < maxRetries) {
      console.log(`Retrying email send to ${to} in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return sendEmail(to, subject, text, html, retryCount + 1);
    }
    
    throw error; // Rethrow after all retries have failed
  } finally {
    // Close the connection regardless of the outcome
    transporter.close();
  }
}

// ========== SIGN UP ==========

router.get('/signup', (req, res) => {
  res.render('student/signUp');
});

router.post('/signup', async (req, res) => {
  const { name, email, regNumber } = req.body;

  if (!name || !email || !regNumber) {
    return res.status(400).send('All fields are required');
  }

  await withDbConnection(req, res, async () => {
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) return res.status(400).send('Email already registered.');

    const newStudent = new Student({ name, email, regNumber });
    await newStudent.save();
    
    // Send welcome email to the student
    try {
      const welcomeHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">Welcome to the Quiz System</h2>
          <p>Hello ${name},</p>
          <p>Your account has been successfully created with registration number: <strong>${regNumber}</strong></p>
          <p>You can now log in to take quizzes.</p>
          <p>Thank you for joining!</p>
        </div>
      `;
      
      await sendEmail(
        email,
        'Welcome to the Quiz System',
        `Hello ${name}, Your account has been successfully created with registration number: ${regNumber}. You can now log in to take quizzes.`,
        welcomeHtml
      );
      
      console.log(`Welcome email sent to ${email}`);
    } catch (emailError) {
      // Log but don't block signup process
      console.error('[ERROR] Welcome email failed:', emailError);
    }
    
    res.redirect('/student/login');
  });
});

// ========== LOGIN WITH OTP ==========

router.get('/login', (req, res) => {
  res.render('student/login');
});

router.post('/login', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send('Email is required');
  }

  try {
    // Ensure database is connected before querying
    await connectToDatabase();
    
    const student = await Student.findOne({ email });
    if (!student) return res.status(404).send('Email not found.');

    // Generate a more secure OTP
    const otp = OTP.generate(6, { 
      upperCase: false, 
      specialChars: false,
      alphabets: false,
      digits: true
    });
    
    // Store in session
    req.session.otp = otp;
    req.session.studentEmail = email;
    req.session.otpExpiry = Date.now() + (15 * 60 * 1000); // 15 minutes expiry
    req.session.studentName = student.name; // Store student name for email personalization
    
    // Save session before proceeding
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`Generated OTP for ${email}: ${otp}`);

    // Always log OTP in development or if explicitly enabled
    const isDevEnvironment = process.env.NODE_ENV === 'development';
    const isRenderDev = process.env.RENDER === '1' && process.env.NODE_ENV !== 'production';
    const fallbackEnabled = process.env.ALLOW_OTP_FALLBACK === 'true';
    
    if (isDevEnvironment || isRenderDev || fallbackEnabled) {
      console.log(`[ENV:${process.env.NODE_ENV}] OTP for ${email}: ${otp}`);
    }

    try {
      // Create a more user-friendly and professional email
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">Your Login OTP</h2>
          <p>Hello ${student.name},</p>
          <p>Here is your one-time password for login:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP will expire in 15 minutes.</p>
          <p>If you didn't request this code, please ignore this email or contact support.</p>
          <p style="margin-top: 20px; font-size: 12px; color: #777;">This is an automated message, please do not reply.</p>
        </div>
      `;
      
      // Send OTP email with retry capability
      await sendEmail(
        email,
        'Your Login OTP for Quiz System',
        `Hello ${student.name}, Your OTP is: ${otp}. This OTP will expire in 15 minutes.`,
        emailHtml
      );
      
      console.log(`OTP email sent successfully to ${email}`);
      return res.redirect('/student/verifyOtp');
    } catch (emailError) {
      console.error('[ERROR] Email sending failed:', emailError);
      
      // Check if we should allow fallback to console OTP
      if (fallbackEnabled) {
        console.log(`[FALLBACK] Using console OTP for ${email}: ${otp}`);
        req.session.emailSendFailed = true; // Flag to show a warning on verification page
        return res.redirect('/student/verifyOtp');
      }
      
      // For Render deployment, provide additional troubleshooting info
      if (process.env.RENDER === '1' || process.env.RENDER_EXTERNAL_URL) {
        console.log('[RENDER DEPLOYMENT] Email sending issue detected. Check environment variables.');
      }
      
      // In production without fallback, notify the user about the error
      return res.status(500).send(
        'Failed to send OTP email. Please verify your email address and try again later, or contact support.'
      );
    }
  } catch (err) {
    console.error('[ERROR] Login process failed:', err);
    res.status(500).send('Login failed. Please try again later.');
  }
});

router.get('/verifyOtp', (req, res) => {
  // Check if session exists
  if (!req.session || !req.session.otp) {
    return res.redirect('/student/login');
  }
  
  // Check if OTP has expired
  if (req.session.otpExpiry && Date.now() > req.session.otpExpiry) {
    req.session.otp = null;
    req.session.otpExpiry = null;
    return res.status(400).send('OTP has expired. Please request a new one.');
  }
  
  // Pass email send failure flag if applicable
  const emailSendFailed = req.session.emailSendFailed || false;
  res.render('student/verifyOtp', { emailSendFailed });
});

router.post('/verifyOtp', async (req, res) => {
  console.log("OTP verification attempt");
  console.log("Body:", req.body);
  console.log("Session exists:", !!req.session);
  console.log("Session OTP exists:", !!req.session?.otp);
  console.log("OTP Expiry:", req.session?.otpExpiry);
  const { otp } = req.body;

  // Validate we have a session and OTP stored
  if (!req.session || !req.session.otp) {
    return res.status(400).send('Session expired. Please try logging in again.');
  }
  
  // Check if OTP has expired
  if (req.session.otpExpiry && Date.now() > req.session.otpExpiry) {
    req.session.otp = null;
    req.session.otpExpiry = null;
    return res.status(400).send('OTP has expired. Please request a new one.');
  }

  if (otp === req.session.otp) {
    // Clear the OTP but keep the email for the session
    req.session.otp = null;
    req.session.otpExpiry = null;
    req.session.emailSendFailed = null; // Clear the email failure flag
    
    // Log successful login
    console.log(`[LOGIN SUCCESS] Student logged in with email: ${req.session.studentEmail}`);
    
    // Save session before redirect
    try {
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) reject(err);
          else resolve();
        });
      });
      return res.redirect('/student/dashboard');
    } catch (err) {
      console.error('[ERROR] Saving session:', err);
      return res.status(500).send('Error processing your request. Please try again.');
    }
  } else {
    return res.status(400).send('Invalid OTP. Please check and try again.');
  }
});

// ========== DASHBOARD & QUIZZES ==========

router.get('/dashboard', studentOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const quizzes = await Quiz.find({});
    const student = await Student.findOne({ email: req.session.studentEmail });
    
    if (!student) {
      console.error(`Student not found for email: ${req.session.studentEmail}`);
      return res.redirect('/student/logout');
    }
    
    res.render('student/dashboard', { student, quizzes });
  });
});

router.get('/quiz/:id', studentOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const quiz = await Quiz.findById(req.params.id);
    const student = await Student.findOne({ email: req.session.studentEmail });

    if (!quiz) {
      return res.status(404).send('Quiz not found.');
    }
    
    if (!student) {
      return res.status(404).send('Student record not found.');
    }

    // Initialize responses array if needed
    if (!student.responses) {
      student.responses = [];
    }

    // Prevent retaking the quiz
    if (student.responses.includes(quiz._id)) {
      return res.status(400).send('You have already submitted this quiz.');
    }

    res.render('student/takeQuiz', {
      quiz,
      studentId: student._id,
    });
  });
});

// ========== SUBMIT QUIZ ==========

router.post('/submit/:quizId', studentOnly, async (req, res) => {
  const { quizId } = req.params;
  const { answers } = req.body;

  if (!quizId || !answers) {
    return res.status(400).send('Invalid submission data.');
  }

  await withDbConnection(req, res, async () => {
    const student = await Student.findOne({ email: req.session.studentEmail });
    if (!student) return res.status(404).send('Student not found.');

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).send('Quiz not found.');

    // Initialize responses array if needed
    if (!student.responses) {
      student.responses = [];
    }

    // Prevent double submission
    if (student.responses.includes(quiz._id)) {
      return res.status(400).send('You have already submitted this quiz.');
    }

    // Mark quiz as submitted
    student.responses.push(quiz._id);
    await student.save();

    // Log quiz submission
    console.log(`[QUIZ SUBMIT] Student ${student.name} (ID: ${student._id}) submitted quiz: ${quiz.title} (ID: ${quiz._id})`);

    // Save the response to the database
    const response = new Response({
      student: student._id,
      quiz: quiz._id,
      answers,
      submittedAt: new Date(),
    });
    await response.save();

    console.log(`[QUIZ SUBMIT] Response saved with ID: ${response._id}`);
    
    // Send confirmation email for quiz submission
    try {
      const confirmationHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">Quiz Submission Confirmation</h2>
          <p>Hello ${student.name},</p>
          <p>Your submission for the quiz <strong>${quiz.title}</strong> has been successfully recorded.</p>
          <p>Submission time: ${new Date().toLocaleString()}</p>
          <p>Thank you for completing the quiz!</p>
        </div>
      `;
      
      await sendEmail(
        student.email,
        `Quiz Submission: ${quiz.title}`,
        `Hello ${student.name}, Your submission for the quiz "${quiz.title}" has been successfully recorded.`,
        confirmationHtml
      );
      
      console.log(`Quiz submission confirmation email sent to ${student.email}`);
    } catch (emailError) {
      // Log but don't block the submission process
      console.error('[ERROR] Quiz submission email failed:', emailError);
    }

    // Fetch updated quiz list for the student dashboard
    const quizzes = await Quiz.find({});
    res.render('student/dashboard', {
      student,
      quizzes,
      submittedQuizId: quiz._id,
    });
  });
});

// ========== LOG KEY PRESSES ==========

router.post('/logKeypress', async (req, res) => {
  const { key, quizId, studentId } = req.body;

  if (!key || !quizId || !studentId) {
    return res.status(400).send('Missing required data');
  }

  await withDbConnection(req, res, async () => {
    await KeyLog.create({
      studentId,
      quizId,
      key,
      timestamp: new Date(),
    });

    console.log(`[Key Log] Student ${studentId} pressed "${key}" during quiz ${quizId}`);
    res.sendStatus(200);
  });
});

// ========== LOGOUT ==========

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[ERROR] Session destruction failed:', err);
      return res.status(500).send('Error logging out.');
    }
    res.redirect('/student/login');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[ERROR] Session destruction failed:', err);
      return res.status(500).send('Error logging out.');
    }
    res.redirect('/student/login');
  });
});

module.exports = router;
