const mongoose = require('mongoose');

const keyLogSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
  key: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('KeyLog', keyLogSchema);
