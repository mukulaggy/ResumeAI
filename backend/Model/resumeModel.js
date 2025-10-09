const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema({
  filename: { 
    type: String, 
    required: true 
  },
  text: { 
    type: String, 
    required: true 
  },
  recruiterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Recruiter",
    required: true
  },
  matchPercentage: { 
    type: Number,
    min: 0,
    max: 100
  },
  summary: {
    type: String
  },
  strengths: {
    type: [String],
    default: []
  },
  weaknesses: {
    type: [String],
    default: []
  },
  recommendation: {
    type: String
  },
  missingSkills: { 
    type: [String],
    default: []
  },
  jobDescription: {
    type: String
  },
  isShortlisted: { 
    type: Boolean, 
    default: false 
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  analyzedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for better query performance
resumeSchema.index({ recruiterId: 1, isShortlisted: 1 });
resumeSchema.index({ recruiterId: 1, matchPercentage: -1 });

module.exports = mongoose.model("Resume", resumeSchema);