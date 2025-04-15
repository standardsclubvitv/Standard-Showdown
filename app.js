require("dotenv").config();
console.log("[INIT] Loaded environment variables");

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const MongoStore = require('connect-mongo');
const { connectToDatabase } = require('./db');

console.log("[INIT] Required modules loaded");

// Initialize database connection
connectToDatabase().catch(err => {
  console.error('[DB] Initial connection attempt failed:', err);
  // Allow app to start anyway, it will retry connection later
});

// Import route files
const teacherRoutes = require("./routes/teacher");
const studentRoutes = require("./routes/student");
const indexRoutes = require("./routes/index");

// Import model for logging
const KeyLog = require("./models/KeyLog");

const app = express();

// MongoDB connection with optimized settings for both serverless and traditional hosting
console.log("[DB] Connecting to MongoDB...");
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  bufferCommands: false, // Disable mongoose buffering
  serverSelectionTimeoutMS: 5000, // Keep the selection process short
  socketTimeoutMS: 45000, // Prevent long-running queries from failing
  family: 4 // Force IPv4 (helps with some hosting providers)
})
  .then(() => {
    console.log("[DB] ✅ Connected to MongoDB");
  })
  .catch(err => {
    console.error("[DB] ❌ MongoDB connection error:", err);
  });

// Handle MongoDB disconnection/reconnection
mongoose.connection.on('disconnected', () => {
  console.log('[DB] MongoDB disconnected, attempting to reconnect');
});

mongoose.connection.on('reconnected', () => {
  console.log('[DB] MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB error after initial connection:', err);
});

// Middleware
console.log("[MIDDLEWARE] Configuring middleware...");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // needed for JSON requests
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Detect environment
const isProduction = process.env.NODE_ENV === 'production';
const isRender = process.env.RENDER === '1' || Boolean(process.env.RENDER_EXTERNAL_URL);

// Session configuration with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_fallback_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collection: 'sessions',
    ttl: 60 * 60, // Session TTL (1 hour)
    autoRemove: 'native',
    touchAfter: 24 * 3600, // Only update the session once per day unless data changes
    stringify: false, // Don't stringify session data (more efficient)
    crypto: {
      secret: process.env.SESSION_CRYPTO_SECRET || process.env.SESSION_SECRET || 'fallback_crypto_secret'
    }
  }),
  cookie: {
    secure: isProduction && !isRender, // Use secure cookies in production, but not on Render dev environments
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    sameSite: 'lax' // Helps with CSRF protection
  }
}));
console.log("[MIDDLEWARE] ✅ Middleware setup complete");

// Trust the proxy when running behind Render's proxy
if (isRender) {
  app.set('trust proxy', 1);
  console.log("[CONFIG] Running behind Render proxy, trust proxy enabled");
}

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

// Create a health check endpoint for Render
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    mongodbStatus: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// For both local development and Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[SERVER] 🚀 Server running on port ${PORT}`);
  
  if (isRender) {
    console.log(`[SERVER] Running on Render at ${process.env.RENDER_EXTERNAL_URL || 'unknown URL'}`);
  } else if (process.env.NODE_ENV !== 'production') {
    console.log(`[SERVER] Local server: http://localhost:${PORT}`);
  }
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).send('Something went wrong! Please try again later.');
});

// Export the Express app for compatibility with serverless platforms
module.exports = app;
