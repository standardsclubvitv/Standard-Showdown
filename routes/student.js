const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Quiz = require('../models/Quiz');
const KeyLog = require('../models/KeyLog');
const Response = require('../models/Response');
const OTP = require('otp-generator');
const createTransporter = require('../nodemailer-config');
const dotenv = require('dotenv');

dotenv.config();

// ========== MIDDLEWARE ==========

function studentOnly(req, res, next) {
  if (req.session && req.session.studentEmail) return next();
  return res.redirect('/student/login');
}

// ========== SIGN UP ==========

router.get('/signup', (req, res) => {
  res.render('student/signUp');
});

router.post('/signup', async (req, res) => {
  const { name, email, regNumber } = req.body;

  try {
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) return res.status(400).send('Email already registered.');

    const newStudent = new Student({ name, email, regNumber });
    await newStudent.save();
    res.redirect('/student/login');
  } catch (err) {
    console.error('[ERROR] Sign Up:', err);
    res.status(500).send('Something went wrong. Please try again later.');
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
    const student = await Student.findOne({ email });
    if (!student) return res.status(404).send('Email not found.');

    // Generate OTP
    const otp = OTP.generate(6, { 
      upperCase: false, 
      specialChars: false,
      alphabets: false, // Numbers only for better user experience
      digits: true
    });
    
    // Store in session
    req.session.otp = otp;
    req.session.studentEmail = email;
    
    // Make sure session is saved before proceeding
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`Generated OTP for ${email}: ${otp}`);

    // Get transporter instance
    const transporter = await createTransporter();
    
    // Define email options
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

    // Send email
    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}`);
    
    res.redirect('/student/verifyOtp');
  } catch (err) {
    console.error('[ERROR] Sending OTP:', err);
    
    // Detailed error logging for troubleshooting
    if (err.code === 'EAUTH') {
      console.error('Authentication error - check EMAIL_USER and EMAIL_PASS env variables');
    } else if (err.code === 'ESOCKET') {
      console.error('Socket error - network connectivity issue');
    } else if (err.code === 'ECONNECTION') {
      console.error('Connection error - could not connect to email service');
    }
    
    // Clear the session if email fails
    req.session.otp = null;
    req.session.studentEmail = null;
    
    res.status(500).send('Failed to send OTP. Please try again later or contact support.');
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
    const quizzes = await Quiz.find({});
    const student = await Student.findOne({ email: req.session.studentEmail });
    
    if (!student) {
      // Session exists but student doesn't - possibly db issues
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
    const quiz = await Quiz.findById(req.params.id);
    const student = await Student.findOne({ email: req.session.studentEmail });

    if (!quiz) {
      return res.status(404).send('Quiz not found.');
    }
    
    if (!student) {
      return res.status(404).send('Student record not found.');
    }

    // Prevent retaking the quiz
    if (student.responses && student.responses.includes(quiz._id)) {
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
    const student = await Student.findOne({ email: req.session.studentEmail });
    if (!student) return res.status(404).send('Student not found.');

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).send('Quiz not found.');

    // Initialize responses array if it doesn't exist
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
