const express = require("express");
const router = express.Router();
const Quiz = require("../models/Quiz");
const Response = require("../models/Response");
const dotenv = require("dotenv");
const { connectToDatabase } = require('../db');

dotenv.config();

// ========== MIDDLEWARE ==========

// Enhanced middleware to restrict teacher access with better error handling
async function teacherOnly(req, res, next) {
  try {
    // Get teacher email from environment variable with fallback
    const authorizedTeacherEmail = process.env.TEACHER_EMAIL || "standards2023@vit.ac.in";
    
    if (!req.session || !req.session.teacherEmail) {
      console.log('[AUTH] Teacher access denied - No session or email');
      return res.redirect('/teacher/login');
    }
    
    if (req.session.teacherEmail !== authorizedTeacherEmail) {
      console.log(`[AUTH] Teacher access denied - Unauthorized email: ${req.session.teacherEmail}`);
      return res.status(403).send("Access denied. Only authorized teachers allowed.");
    }
    
    // Ensure database is connected before proceeding
    await connectToDatabase();
    return next();
  } catch (error) {
    console.error('[ERROR] Teacher authentication middleware error:', error);
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

// ========== LOGIN ==========

// Login GET
router.get("/login", (req, res) => {
  // Clear any existing session to prevent issues
  if (req.session.teacherEmail) {
    req.session.teacherEmail = null;
  }
  
  res.render("teacher/login");
});

// Login POST with improved security and validation
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  
  // Get authorized email from environment with fallback
  const authorizedTeacherEmail = process.env.TEACHER_EMAIL || "standards2023@vit.ac.in";
  // Get password from environment with fallback
  const authorizedPassword = process.env.TEACHER_PASSWORD || "standards2023";
  
  // Validate both email and password (basic auth)
  if (!email || !password) {
    return res.status(400).send("Email and password are required");
  }
  
  if (email === authorizedTeacherEmail && password === authorizedPassword) {
    // Store teacher email in session
    req.session.teacherEmail = email;
    
    // Save session before redirect
    try {
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      console.log(`[LOGIN] Teacher logged in successfully: ${email}`);
      return res.redirect("/teacher/dashboard");
    } catch (err) {
      console.error('[ERROR] Saving teacher session:', err);
      return res.status(500).send('Error processing login. Please try again.');
    }
  }
  
  console.log(`[LOGIN] Failed login attempt with email: ${email}`);
  res.status(401).send("Invalid teacher credentials");
});

// ========== DASHBOARD ==========

// GET: Dashboard (Teacher)
router.get("/dashboard", teacherOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const quizzes = await Quiz.find({}).sort({ date: -1 });
    res.render("teacher/dashboard", { quizzes });
  });
});

// ========== QUIZ MANAGEMENT ==========

// GET: Create Quiz Page
router.get('/create', teacherOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const quizzes = await Quiz.find({});
    res.render('teacher/createQuiz', { quizzes });
  });
});

// POST: Create quiz
router.post("/create", teacherOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const {
      title,
      date,
      duration,
      questionType,
      questionText,
      option1,
      option2,
      option3,
      option4,
      correctAnswer,
    } = req.body;

    // Validate required fields
    if (!title || !date || !duration || !questionText || !questionType) {
      return res.status(400).send("Required fields are missing");
    }

    // Prepare questions array
    const questions = questionText.map((text, index) => {
      if (questionType[index] === "mcq") {
        return {
          type: "mcq",
          question: text,
          options: [
            option1[index],
            option2[index],
            option3[index],
            option4[index],
          ],
          correctAnswer: correctAnswer[index],
        };
      } else {
        return {
          type: "descriptive",
          question: text,
        };
      }
    });

    const quiz = new Quiz({
      title,
      date,
      duration,
      questions,
    });

    await quiz.save();
    console.log(`[QUIZ] New quiz created: ${title}`);
    res.redirect("/teacher/dashboard");
  });
});

// GET: Edit quiz
router.get("/edit/:id", teacherOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).send("Quiz not found");

    res.render("teacher/editQuiz", { quiz });
  });
});

// POST: Update quiz
router.post("/edit/:id", teacherOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const {
      title,
      date,
      duration,
      questionType,
      questionText,
      option1,
      option2,
      option3,
      option4,
      correctAnswer,
    } = req.body;

    // Validate required fields
    if (!title || !date || !duration || !questionText || !questionType) {
      return res.status(400).send("Required fields are missing");
    }

    // Prepare questions array
    const questions = questionText.map((text, index) => {
      if (questionType[index] === "mcq") {
        return {
          type: "mcq",
          question: text,
          options: [
            option1[index],
            option2[index],
            option3[index],
            option4[index],
          ],
          correctAnswer: correctAnswer[index],
        };
      } else {
        return {
          type: "descriptive",
          question: text,
        };
      }
    });

    await Quiz.findByIdAndUpdate(req.params.id, {
      title,
      date,
      duration,
      questions,
    });
    
    console.log(`[QUIZ] Quiz updated: ${req.params.id}`);
    res.redirect("/teacher/dashboard");
  });
});

// GET: View responses
router.get("/responses/:quizId", teacherOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).send("Quiz not found");

    const responses = await Response.find({ quiz: quiz._id }).populate("student");
    res.render("teacher/response", { quiz, responses });
  });
});

// GET: Download Quiz Data 
router.get("/download/:quizId", teacherOnly, async (req, res) => {
  await withDbConnection(req, res, async () => {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).send("Quiz not found");

    const responses = await Response.find({ quiz: quiz._id }).populate("student");
    
    // Generate CSV data
    let csvData = "Student Name,Registration Number,Email,Date Submitted,";
    
    // Add question headers
    quiz.questions.forEach((q, i) => {
      csvData += `Question ${i+1},`;
    });
    csvData += "\n";
    
    // Add student response data
    responses.forEach(response => {
      const student = response.student;
      const submitDate = new Date(response.submittedAt).toLocaleString();
      
      csvData += `${student.name},${student.regNumber},${student.email},${submitDate},`;
      
      // Add answers
      const answers = response.answers || [];
      quiz.questions.forEach((q, i) => {
        const answer = answers[i] || "Not answered";
        csvData += `"${answer.replace(/"/g, '""')}",`; // Escape quotes for CSV
      });
      
      csvData += "\n";
    });
    
    // Set headers for download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="quiz-${quiz.title}-responses.csv"`);
    
    // Send the CSV data
    res.send(csvData);
  });
});

// ========== LOGOUT ==========

// Teacher Logout (GET method)
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[ERROR] Teacher session destruction failed:', err);
      return res.status(500).send('Error logging out.');
    }
    res.redirect('/teacher/login');
  });
});

// Teacher Logout (POST method)
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[ERROR] Teacher session destruction failed:', err);
      return res.status(500).send('Error logging out.');
    }
    res.redirect('/teacher/login');
  });
});

module.exports = router;
