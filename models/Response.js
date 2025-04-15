const mongoose = require("mongoose");

const responseSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" }, // Updated to reference Student
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz" },
  answers: [String], // Store answers as an array of strings (or any format suitable for your quiz)
  submittedAt: Date,
  malpracticeLog: [String], // Malpractice logs for tracking unusual activity
});

module.exports = mongoose.model("Response", responseSchema);
