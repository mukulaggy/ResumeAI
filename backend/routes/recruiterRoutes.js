const express = require("express");
const { 
  getDashboard,
  analyzeResumes,
  getShortlistedResumes,
  getAllResumes,
  uploadResumes,
  deleteResume
} = require("../controller/recruiterController.js");
const { protect } = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure Multer for multiple file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

// File filter to accept only PDF and DOC files
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF and DOC/DOCX files are allowed."), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit per file
  }
});

// All routes are protected
router.get("/dashboard", protect, getDashboard);
router.post("/upload-resumes", protect, upload.array("resumes", 100), uploadResumes);
router.post("/analyze-resumes", protect, analyzeResumes);
router.get("/shortlisted-resumes", protect, getShortlistedResumes);
router.get("/all-resumes", protect, getAllResumes);
router.delete("/resume/:id", protect, deleteResume);

module.exports = router;