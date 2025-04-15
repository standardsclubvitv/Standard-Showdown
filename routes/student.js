const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Quiz = require('../models/Quiz');
const KeyLog = require('../models/KeyLog');
const Response = require('../models/Response');
const OTP = require('otp-generator');
const dotenv = require('dotenv');
const { connectToDatabase } = require('../db');

dotenv.config();

// ========== MIDDLEWARE ==========

async function studentOnly(req, res, next) {
  try {
    // Ensure database is connected before checking authorization
    await connectToDatabase();
    
    if (req.session && req.session.studentEmail) return next();
    return res.redirect('/student/login');
  } catch (error) {
    console.error('[ERROR] Authentication middleware error:', error);
    return res.status(500).send('Server error. Please try again later.');
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

  try {
    // Ensure database is connected
    await connectToDatabase();
    
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) return res.status(400).send('Email already registered.');

    const newStudent = new Student({ name, email, regNumber });
    await newStudent.save();
    res.redirect('/student/login');
  } catch (err) {
    console.error('[ERROR] Sign Up:', err);
    res.status(500).send('Registration failed. Please try again later.');
  }
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

    // Generate OTP
    const otp = OTP.generate(6, { 
      upperCase: false, 
      specialChars: false,
      alphabets: false,
      digits: true
    });
    
    // Store in session
    req.session.otp = otp;
    req.session.studentEmail = email;
    
    // Save session before proceeding
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`Generated OTP for ${email}: ${otp}`);

    // For testing in development - always output OTP to console
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] OTP for ${email}: ${otp}`);
      return res.redirect('/student/verifyOtp');
    }

    // In production, send email
    try {
      // Since we're on Vercel, use a simpler approach for sending email
      // Create transporter with each request to avoid connection timeouts
      const nodemailer = require('nodemailer');
      
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        }
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'OTP for Student Login',
        text: `Your OTP is: ${otp}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <h2 style="color: #333;">Your Login OTP</h2>
            <p>Here is your one-time password for login:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px;">
              ${otp}
            </div>
            <p style="margin-top: 20px;">This OTP will expire in 15 minutes. If you didn't request this code, please ignore this email.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`OTP email sent to ${email}`);
      res.redirect('/student/verifyOtp');
    } catch (emailError) {
      console.error('[ERROR] Email sending failed:', emailError);
      res.status(500).send('Failed to send OTP. Please try again later or contact support.');
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
  res.render('student/verifyOtp');
});

router.post('/verifyOtp', async (req, res) => {
  const { otp } = req.body;

  // Validate we have a session and OTP stored
  if (!req.session || !req.session.otp) {
    return res.status(400).send('Session expired. Please try logging in again.');
  }

  if (otp === req.session.otp) {
    // Clear the OTP but keep the email for the session
    req.session.otp = null;
    
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
  try {
    // Ensure database is connected
    await connectToDatabase();
    
    const quizzes = await Quiz.find({});
    const student = await Student.findOne({ email: req.session.studentEmail });
    
    if (!student) {
      console.error(`Student not found for email: ${req.session.studentEmail}`);
      return res.redirect('/student/logout');
    }
    
    res.render('student/dashboard', { student, quizzes });
  } catch (err) {
    console.error('[ERROR] Fetching dashboard:', err);
    res.status(500).send('Failed to load dashboard. Please try again later.');
  }
});

router.get('/quiz/:id', studentOnly, async (req, res) => {
  try {
    // Ensure database is connected
    await connectToDatabase();
    
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
  } catch (err) {
    console.error('[ERROR] Fetching quiz:', err);
    res.status(500).send('Could not load quiz. Please try again later.');
  }
});

// ========== SUBMIT QUIZ ==========

router.post('/submit/:quizId', studentOnly, async (req, res) => {
  const { quizId } = req.params;
  const { answers } = req.body;

  if (!quizId || !answers) {
    return res.status(400).send('Invalid submission data.');
  }

  try {
    // Ensure database is connected
    await connectToDatabase();
    
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

    // Fetch updated quiz list for the student dashboard
    const quizzes = await Quiz.find({});
    res.render('student/dashboard', {
      student,
      quizzes,
      submittedQuizId: quiz._id,
    });
  } catch (err) {
    console.error('[ERROR] Submitting quiz:', err);
    res.status(500).send('Submission failed. Please try again later.');
  }
});

// ========== LOG KEY PRESSES ==========

router.post('/logKeypress', async (req, res) => {
  const { key, quizId, studentId } = req.body;

  if (!key || !quizId || !studentId) {
    return res.status(400).send('Missing required data');
  }

  try {
    // Ensure database is connected
    await connectToDatabase();
    
    await KeyLog.create({
      studentId,
      quizId,
      key,
      timestamp: new Date(),
    });

    console.log(`[Key Log] Student ${studentId} pressed "${key}" during quiz ${quizId}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('[ERROR] Logging keypress:', err);
    res.status(500).send('Keypress logging failed');
  }
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
