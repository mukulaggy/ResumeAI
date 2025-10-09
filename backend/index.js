const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const zlib = require("zlib");
const path = require("path");
const fs = require("fs");

// Load environment variables
dotenv.config();

// Import routes
const resumeRoutes = require("./routes/resumeRoutes");
const authRoutes = require("./routes/authRoutes.js");
const recruiterRoutes = require("./routes/recruiterRoutes.js");
const { protect } = require("./middleware/authMiddleware");

// Import database connection
const connectDB = require("./config/db.js");

// Connect to MongoDB
connectDB();

const app = express();
const port = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware to decompress gzip payloads
app.use((req, res, next) => {
  if (req.headers["content-encoding"] === "gzip") {
    let buffer = [];
    req.on("data", (chunk) => buffer.push(chunk));
    req.on("end", () => {
      try {
        const decompressed = zlib.gunzipSync(Buffer.concat(buffer)).toString();
        req.body = JSON.parse(decompressed);
        next();
      } catch (error) {
        console.error("Error decompressing gzip payload:", error);
        res.status(400).json({ error: "Invalid gzip payload" });
      }
    });
  } else {
    next();
  }
});

// CORS configuration
app.use(
  cors({
    origin: [
      "*",
      "https://resumeai-nine.vercel.app",
      "http://localhost:5173",
      
    ],
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

// Increase payload size limit
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Server is running",
    mongodb: "Connected"
  });
});

// Routes
app.use("/api", resumeRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/recruiter", recruiterRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});




