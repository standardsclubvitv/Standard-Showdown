require("dotenv").config();
console.log("[INIT] Loaded environment variables");

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");

console.log("[INIT] Required modules loaded");

// Import route files
const teacherRoutes = require("./routes/teacher");
const studentRoutes = require("./routes/student");
const indexRoutes = require("./routes/index");

// Import model for logging (create this schema/model in your models folder)
const KeyLog = require("./models/KeyLog");

const app = express();

// MongoDB connection
console.log("[DB] Connecting to MongoDB...");
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("[DB] ✅ Connected to MongoDB");
  })
  .catch(err => {
    console.error("[DB] ❌ MongoDB connection error:", err);
  });

// Middleware
console.log("[MIDDLEWARE] Configuring middleware...");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // needed for JSON requests
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "quizSecret",
    resave: false,
    saveUninitialized: false,
  })
);
console.log("[MIDDLEWARE] ✅ Middleware setup complete");

// Routes
console.log("[ROUTES] Mounting routes...");
app.use("/", indexRoutes);         
app.use("/teacher", teacherRoutes);
app.use("/student", studentRoutes);

// Route to log keypresses during quiz
app.post('/student/logKeypress', async (req, res) => {
  try {
    const { key, quizId, studentId } = req.body;

    // Save to DB
    await KeyLog.create({
      key,
      quizId,
      studentId,
      timestamp: new Date(),
    });

    console.log(`[Key Log] Student ${studentId} pressed "${key}" on quiz ${quizId}`);
    res.sendStatus(200);
  } catch (error) {
    console.error("[Key Log Error]", error);
    res.status(500).send("Error logging keypress");
  }
});

console.log("[ROUTES] ✅ Routes mounted");

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[SERVER] 🚀 Server running on http://localhost:${PORT}`);
});
