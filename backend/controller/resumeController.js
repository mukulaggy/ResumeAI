const {
  extractTextFromPDF,
  extractTextFromDOC,
  analyzeResumeWithGemini,
  parseAnalysisResults,
  extractTextFromJSON
} = require("../utils/geminiUtils.js");

const multer = require("multer");
const axios = require("axios");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for local storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, DOC, and DOCX files are allowed."), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
}).single("resume");

const uploadResume = async (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      console.error("Multer Error:", err);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error("Upload Error:", err);
      return res.status(400).json({ error: err.message || "File upload failed" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      console.log("File uploaded:", req.file.originalname);
      console.log("File path:", req.file.path);

      let text = "";
      
      // Extract text based on file type
      if (req.file.mimetype === "application/pdf") {
        text = await extractTextFromPDF(req.file.path);

      } else if (
        req.file.mimetype === "application/msword" ||
        req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        text = await extractTextFromDOC(req.file.path);

      } else if (req.file.mimetype === "application/json") {
        text = await extractTextFromJSON(req.file.path);

      } else {
        throw new Error("Unsupported file type");
      }

      console.log("Text extracted, length:", text.length);

      // Keep the file for now, or delete it if you prefer
      // fs.unlinkSync(req.file.path); // Uncomment to delete after extraction

      res.json({
        message: "Resume uploaded successfully",
        filename: req.file.originalname,
        text: text,
        filePath: req.file.path, // Include if you want to reference it later
      });
    } catch (error) {
      console.error("Error processing file:", error);
      
      // Clean up file on error
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ 
        error: "Failed to process resume",
        details: error.message 
      });
    }
  });
};

const analyzeResume = async (req, res) => {
  const { resumeText, jobDescription } = req.body;

  if (!resumeText || !jobDescription) {
    return res
      .status(400)
      .json({ error: "Resume text and job description are required" });
  }

  try {
    console.log("Analyzing resume...");
    const analysisResults = await analyzeResumeWithGemini(
      resumeText,
      jobDescription
    );
    console.log("Analysis complete:", analysisResults);
    res.json(analysisResults);
  } catch (error) {
    console.error("Error in analyzeResume:", error.message);
    res.status(500).json({ 
      error: "Failed to analyze resume",
      details: error.message 
    });
  }
};

const tellAboutResume = async (req, res) => {
  const { resumeText } = req.body;

  if (!resumeText) {
    return res.status(400).json({ error: "Resume text is required" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    console.log("Getting resume summary...");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const prompt = `
Provide a concise summary and key points about the following resume. Format the response as bullet points:

- **Summary**: [Provide a brief summary of the resume]
- **Key Skills**: [List the key skills mentioned in the resume]
- **Experience**: [Highlight the key experiences]
- **Education**: [List the educational background]

Resume: ${resumeText}
`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000
      }
    );

    if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid response from Gemini API");
    }

    const summary = response.data.candidates[0].content.parts[0].text;
    console.log("Summary generated successfully");
    res.json({ summary });
  } catch (error) {
    console.error(
      "Error in tellAboutResume:",
      error.response?.data || error.message
    );
    res.status(500).json({ 
      error: "Failed to analyze resume",
      details: error.response?.data?.error?.message || error.message 
    });
  }
};

const improveSkills = async (req, res) => {
  const { resumeText, jobDescription } = req.body;

  if (!resumeText || !jobDescription) {
    return res
      .status(400)
      .json({ error: "Resume text and job description are required" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    console.log("Generating skill improvement suggestions...");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const prompt = `
Based on the following resume and job description, provide detailed suggestions on how to improve skills. Format the response as bullet points:

- **Technical Skills**: [Suggestions for improving technical skills]
- **Soft Skills**: [Suggestions for improving soft skills]
- **Certifications**: [Recommendations for relevant certifications]
- **Projects**: [Suggestions for relevant projects to undertake]

Resume: ${resumeText}
Job Description: ${jobDescription}
`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000
      }
    );

    if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid response from Gemini API");
    }

    const suggestions = response.data.candidates[0].content.parts[0].text;
    console.log("Suggestions generated successfully");
    res.json({ suggestions });
  } catch (error) {
    console.error(
      "Error in improveSkills:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ 
        error: "Failed to provide skill improvement suggestions",
        details: error.response?.data?.error?.message || error.message 
      });
  }
};

const missingKeywords = async (req, res) => {
  const { resumeText, jobDescription } = req.body;

  if (!resumeText || !jobDescription) {
    return res
      .status(400)
      .json({ error: "Resume text and job description are required" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Gemini API key is missing. Please set the GEMINI_API_KEY environment variable."
      );
    }

    console.log("Identifying missing keywords...");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const prompt = `
Analyze the following resume and job description to identify missing keywords or skills that are required in the job description but not present in the resume.

Resume: ${resumeText}
Job Description: ${jobDescription}

Return the missing keywords as a comma-separated list. Do not include any additional text or explanations.
`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000
      }
    );

    if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid response from Gemini API");
    }

    const missingKeywords = response.data.candidates[0].content.parts[0].text;
    console.log("Missing keywords identified");
    res.json({ missingKeywords });
  } catch (error) {
    console.error(
      "Error in missingKeywords:",
      error.response?.data || error.message
    );
    res.status(500).json({ 
      error: "Failed to identify missing keywords",
      details: error.response?.data?.error?.message || error.message 
    });
  }
};

module.exports = {
  analyzeResume,
  tellAboutResume,
  improveSkills,
  missingKeywords,
  uploadResume,
};