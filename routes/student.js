const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Quiz = require('../models/Quiz');
const KeyLog = require('../models/KeyLog');
const Response = require('../models/Response');
const nodemailer = require('nodemailer');
const OTP = require('otp-generator');
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
    if (existingStudent) return res.send('Email already registered.');

    const newStudent = new Student({ name, email, regNumber });
    await newStudent.save();
    res.redirect('/student/login');
  } catch (err) {
    console.error('[ERROR] Sign Up:', err);
    res.status(500).send('Something went wrong.');
  }
});

// ========== LOGIN WITH OTP ==========

router.get('/login', (req, res) => {
  res.render('student/login');
});

router.post('/login', async (req, res) => {
  const { email } = req.body;

  try {
    const student = await Student.findOne({ email });
    if (!student) return res.send('Email not found.');

    const otp = OTP.generate(6, { upperCase: false, specialChars: false });
    req.session.otp = otp;
    req.session.studentEmail = email;

    console.log(`Generated OTP for ${email}: ${otp}`);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP for Student Login',
      text: `Your OTP is: ${otp}`,
    });

    res.redirect('/student/verifyOtp');
  } catch (err) {
    console.error('[ERROR] Sending OTP:', err);
    res.status(500).send('Failed to send OTP.');
  }
});

router.get('/verifyOtp', (req, res) => {
  res.render('student/verifyOtp');
});

router.post('/verifyOtp', async (req, res) => {
  const { otp } = req.body;

  if (otp === req.session.otp) {
    req.session.otp = null;
    return res.redirect('/student/dashboard');
  } else {
    return res.send('Invalid OTP.');
  }
});

// ========== DASHBOARD & QUIZZES ==========

router.get('/dashboard', studentOnly, async (req, res) => {
  try {
    const quizzes = await Quiz.find({});
    const student = await Student.findOne({ email: req.session.studentEmail });
    res.render('student/dashboard', { student, quizzes });
  } catch (err) {
    console.error('[ERROR] Fetching dashboard:', err);
    res.status(500).send('Failed to load dashboard.');
  }
});

router.get('/quiz/:id', studentOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    const student = await Student.findOne({ email: req.session.studentEmail });

    if (!quiz || !student) return res.send('Quiz or student not found.');

    // ✅ Prevent retaking the quiz
    if (student.responses.includes(quiz._id)) {
      return res.send('You have already submitted this quiz.');
    }

    res.render('student/takeQuiz', {
      quiz,
      studentId: student._id,
    });
  } catch (err) {
    console.error('[ERROR] Fetching quiz:', err);
    res.status(500).send('Could not load quiz.');
  }
});

// ========== SUBMIT QUIZ ==========

router.post('/submit/:quizId', studentOnly, async (req, res) => {
  const { quizId } = req.params;
  const { answers } = req.body;

  try {
    const student = await Student.findOne({ email: req.session.studentEmail });
    if (!student) return res.status(404).send('Student not found.');

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).send('Quiz not found.');

    // ✅ Prevent double submission
    if (student.responses.includes(quiz._id)) {
      return res.send('You have already submitted this quiz.');
    }

    // ✅ Mark quiz as submitted
    student.responses.push(quiz._id);
    await student.save();

    // Log quiz submission in terminal
    console.log(`[QUIZ SUBMIT] Student ${student.name} (ID: ${student._id}) submitted quiz: ${quiz.title} (ID: ${quiz._id})`);
    console.log(`[QUIZ SUBMIT] Answers: ${JSON.stringify(answers)}`);

    // Save the response to the database
    const response = new Response({
      student: student._id,
      quiz: quiz._id,
      answers,
      submittedAt: new Date(),
    });
    await response.save();

    // Log the response ID and data storage location
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
    res.status(500).send('Submission failed.');
  }
});

// ========== LOG KEY PRESSES ==========

router.post('/logKeypress', async (req, res) => {
  const { key, quizId, studentId } = req.body;

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

router.post('/logout', (req, res) => {
  // Destroy session to clear all session data
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Error logging out.');
    }
    res.redirect('/student/login'); // Redirect to login page
  });
});

module.exports = router;
