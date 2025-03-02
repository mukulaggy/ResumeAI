const {
  extractTextFromPDF,
  analyzeResumeWithGemini,
  parseAnalysisResults,
} = require("../utils/geminiUtils.js");
const ResumeModel=require("../Model/resumeModel");

const multer = require("multer");

const upload = multer({ dest: "uploads/" }).single("resume");
const axios = require("axios");

const uploadResume = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "File upload failed" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const text = await extractTextFromPDF(req.file.path); // Use the imported function
      res.json({ text });
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      res.status(500).json({ error: "Failed to extract text from PDF" });
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
    const analysisResults = await analyzeResumeWithGemini(
      resumeText,
      jobDescription
    );
    res.json(analysisResults);
  } catch (error) {
    res.status(500).json({ error: "Failed to analyze resume" });
  }
};


const tellAboutResume = async (req, res) => {
  const { resumeText } = req.body;

  if (!resumeText) {
    return res.status(400).json({ error: "Resume text is required" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
      }
    );

    const summary = response.data.candidates[0].content.parts[0].text;
    res.json({ summary });
  } catch (error) {
    console.error(
      "Error in tellAboutResume:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Failed to analyze resume" });
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
      }
    );

    const suggestions = response.data.candidates[0].content.parts[0].text;
    res.json({ suggestions });
  } catch (error) {
    console.error(
      "Error in improveSkills:",
      error.response ? error.response.data : error.message
    );
    res
      .status(500)
      .json({ error: "Failed to provide skill improvement suggestions" });
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
      throw new Error("Gemini API key is missing. Please set the GEMINI_API_KEY environment variable.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
      }
    );

    const missingKeywords = response.data.candidates[0].content.parts[0].text;
    res.json({ missingKeywords });
  } catch (error) {
    console.error(
      "Error in missingKeywords:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Failed to identify missing keywords" });
  }
};

module.exports = {
  analyzeResume,
  tellAboutResume,
  improveSkills,
  missingKeywords,
  uploadResume,
};