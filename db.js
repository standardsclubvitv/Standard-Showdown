// db.js
const mongoose = require('mongoose');
require('dotenv').config();

// Track connection status
let isConnected = false;
let connectionPromise = null;

/**
 * Connect to MongoDB and return the connection
 * This is designed for serverless environments like Vercel
 */
const connectToDatabase = async () => {
  // If already connected, return the existing connection
  if (isConnected) {
    console.log('[DB] Using existing connection');
    return mongoose.connection;
  }

  // If connection is in progress, wait for it to complete
  if (connectionPromise) {
    console.log('[DB] Connection in progress, waiting...');
    return connectionPromise;
  }

  // Initialize new connection
  console.log('[DB] Creating new MongoDB connection...');
  
  // Important: Set bufferCommands to true (default) to allow queries before connection is established
  const options = {
    bufferCommands: true,
    serverSelectionTimeoutMS: 10000, // 10 seconds
  };

  // Create and store promise to allow reuse during connection
  connectionPromise = mongoose
    .connect(process.env.MONGODB_URI, options)
    .then(() => {
      console.log('[DB] ✅ MongoDB connected successfully');
      isConnected = true;
      return mongoose.connection;
    })
    .catch((error) => {
      console.error('[DB] ❌ MongoDB connection error:', error);
      isConnected = false;
      connectionPromise = null;
      throw error;
    });

  return connectionPromise;
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('[DB] MongoDB connected event fired');
  isConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB connection error:', err);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('[DB] MongoDB disconnected, attempting to reconnect');
  isConnected = false;
  connectionPromise = null;
});

// For Vercel serverless environment
// This handles warmup and cooldown of the function
process.on('SIGTERM', async () => {
  console.log('[DB] SIGTERM received, closing MongoDB connection');
  await mongoose.connection.close();
  process.exit(0);
});

module.exports = { connectToDatabase };
