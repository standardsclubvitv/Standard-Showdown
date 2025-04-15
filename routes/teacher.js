const express = require("express");
const router = express.Router();
const Quiz = require("../models/Quiz");
const Response = require("../models/Response"); // To fetch student responses

// Middleware to restrict teacher access
function teacherOnly(req, res, next) {
  if (
    req.session &&
    req.session.email &&
    req.session.email === "standards2023@vit.ac.in"
  ) {
    return next();
  }
  return res.send("Access denied. Only standard teachers allowed.");
}

// Login GET
router.get("/login", (req, res) => {
  res.render("teacher/login");
});

// Login POST
router.post("/login", (req, res) => {
  const { email } = req.body;
  if (email === "standards@vit.ac.in") {
    req.session.email = email;
    return res.redirect("/teacher/dashboard");
  }
  res.send("Invalid teacher email");
});

// GET: Dashboard (Teacher)
router.get("/dashboard", teacherOnly, async (req, res) => {
  try {
    const quizzes = await Quiz.find({}).sort({ date: -1 });
    res.render("teacher/dashboard", { quizzes });
  } catch (err) {
    console.error('[ERROR] Fetching quizzes:', err);
    res.status(500).send('Failed to load quizzes.');
  }
});

// Example: Adjusting the route for rendering the createQuiz view
router.get('/create', async (req, res) => {
  try {
    // Fetch all quizzes or any relevant data you need for the page
    const quizzes = await Quiz.find({});

    // Render the createQuiz.ejs view, passing the quizzes data
    res.render('teacher/createQuiz', { quizzes });
  } catch (err) {
    console.error('[ERROR] Fetching quizzes:', err);
    res.status(500).send('Failed to load quizzes.');
  }
});


// POST: Create quiz
router.post("/create", teacherOnly, async (req, res) => {
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

  try {
    await quiz.save();
    res.redirect("/teacher/dashboard");
  } catch (err) {
    console.error('[ERROR] Creating quiz:', err);
    res.status(500).send('Failed to create quiz.');
  }
});

// GET: Edit quiz
router.get("/edit/:id", teacherOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.send("Quiz not found");

    res.render("teacher/editQuiz", { quiz });
  } catch (err) {
    console.error('[ERROR] Fetching quiz for edit:', err);
    res.status(500).send('Failed to load quiz for editing.');
  }
});

// POST: Update quiz
router.post("/edit/:id", teacherOnly, async (req, res) => {
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

  try {
    await Quiz.findByIdAndUpdate(req.params.id, {
      title,
      date,
      duration,
      questions,
    });
    res.redirect("/teacher/dashboard");
  } catch (err) {
    console.error('[ERROR] Updating quiz:', err);
    res.status(500).send('Failed to update quiz.');
  }
});

// GET: View responses (Download responses)
router.get("/responses/:quizId", teacherOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.send("Quiz not found");

    const responses = await Response.find({ quiz: quiz._id }).populate("student");
    res.render("teacher/response", { quiz, responses });
  } catch (err) {
    console.error('[ERROR] Fetching responses:', err);
    res.status(500).send('Failed to load responses.');
  }
});

module.exports = router;

// Teacher Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Error logging out.');
    }
    res.redirect('/teacher/login'); // Redirect to login page
  });
});
