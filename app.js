require("dotenv").config();
console.log("[INIT] Loaded environment variables");

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const MongoStore = require('connect-mongo');

console.log("[INIT] Required modules loaded");

// Import route files
const teacherRoutes = require("./routes/teacher");
const studentRoutes = require("./routes/student");
const indexRoutes = require("./routes/index");

// Import model for logging (create this schema/model in your models folder)
const KeyLog = require("./models/KeyLog");

const app = express();

// MongoDB connection with optimized serverless settings
console.log("[DB] Connecting to MongoDB...");
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  bufferCommands: false, // Disable mongoose buffering for serverless
  serverSelectionTimeoutMS: 5000 // Keep the selection process short
})
  .then(() => {
    console.log("[DB] ✅ Connected to MongoDB");
  })
  .catch(err => {
    console.error("[DB] ❌ MongoDB connection error:", err);
  });

// Handle MongoDB disconnection/reconnection for serverless environment
mongoose.connection.on('disconnected', () => {
  console.log('[DB] MongoDB disconnected, attempting to reconnect');
});

mongoose.connection.on('reconnected', () => {
  console.log('[DB] MongoDB reconnected');
});

// Middleware
console.log("[MIDDLEWARE] Configuring middleware...");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // needed for JSON requests
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session configuration - consider using connect-mongo for production
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_fallback_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collection: 'sessions',
    ttl: 60 * 60, // Session TTL (1 hour)
    autoRemove: 'native',
    touchAfter: 24 * 3600 // Only update the session once per day unless data changes
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));
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

// For local development only - not used on Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[SERVER] 🚀 Server running on http://localhost:${PORT}`);
  });
}

// Error handling for serverless environment
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).send('Something went wrong! Please try again later.');
});

// Export the Express app for Vercel serverless deployment
module.exports = app;
