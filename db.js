const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Global connection state
let isConnected = false;

// Connection options
const connectionOptions = {
  // Connection timeout - adjust as needed
  serverSelectionTimeoutMS: 10000,
  
  // Wait for connection before proceeding
  bufferCommands: false,
};

/**
 * Connect to MongoDB 
 * Optimized for serverless environment
 */
async function connectToDatabase() {
  // If already connected, return the existing connection
  if (isConnected) {
    console.log('[DB] Using existing connection');
    return;
  }

  try {
    console.log('[DB] Connecting to MongoDB...');
    
    // Ensure we have the connection string
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
    
    isConnected = true;
    console.log('[DB] ✅ MongoDB connected successfully');
  } catch (error) {
    console.error('[DB] ❌ MongoDB connection error:', error);
    
    // In serverless, we shouldn't retry indefinitely
    isConnected = false;
    
    // Throw the error to be handled by the caller
    throw error;
  }
}

module.exports = { connectToDatabase, mongoose };
