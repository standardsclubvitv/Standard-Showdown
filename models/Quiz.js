const mongoose = require("mongoose");

const quizSchema = new mongoose.Schema({
  title: String,
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: Date,
  duration: Number, // in minutes
  questions: [{
    type: { type: String, enum: ['mcq', 'descriptive'] },
    question: String,
    options: [String], // for MCQs
    correctAnswer: String // optional
  }]
});

module.exports = mongoose.model("Quiz", quizSchema);
