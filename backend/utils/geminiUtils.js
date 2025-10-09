const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const axios = require("axios");
const fs = require("fs");

// Extract text from a PDF file
const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw error;
  }
};

// Extract text from a DOC/DOCX file
const extractTextFromDOC = async (filePath) => {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error("Error extracting text from DOC/DOCX:", error);
    throw error;
  }
};

// Analyze the resume against a job description using Gemini API
const analyzeResumeWithGemini = async (resumeText, jobDescription) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
  try {
    const prompt = `Analyze this resume against the job description and provide the following details:

Resume: ${resumeText}
Job Description: ${jobDescription}

Format:
Match Percentage: <percentage>
Missing Skills: <comma-separated list>
Suggestions: <improvement suggestions>
`;

    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    console.log("Gemini API Response:", response.data);
    return parseAnalysisResults(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "");
  } catch (error) {
    console.error("Error analyzing resume with Gemini:", error);
    throw error;
  }
};

// Parse the response from Gemini API
const parseAnalysisResults = (analysisText) => {
  console.log("Raw Response:", analysisText);
  if (!analysisText) return { matchPercentage: 0, missingSkills: [], suggestions: [] };

  // Clean up the text by removing unnecessary symbols
  const cleanText = analysisText
    .replace(/\*\*/g, "") // Remove **
    .replace(/\*/g, "") // Remove *
    .replace(/-\s*/g, "") // Remove - and any following spaces
    .replace(/<[^>]+>/g, "") // Remove HTML tags (if any)
    .replace(/\n\s*\n/g, "\n") // Remove extra newlines
    .trim(); // Trim leading and trailing spaces

  console.log("Cleaned Text:", cleanText);

  // Extract match percentage
  const matchPercentageMatch = cleanText.match(/Match Percentage:\s*(\d+)%/);
  const matchPercentage = matchPercentageMatch ? parseInt(matchPercentageMatch[1], 10) : 0;

  // Extract missing skills
  const missingSkillsMatch = cleanText.match(/Missing Skills:\s*(.*?)(?=\n|$)/);
  const missingSkills = missingSkillsMatch
    ? missingSkillsMatch[1]
        .split(/,\s*/) // Split by comma and optional spaces
        .map((skill) => skill.trim()) // Trim each skill
    : [];

  // Extract suggestions
  const suggestionsMatch = cleanText.match(/Suggestions:\s*([\s\S]*)/i);
  const suggestions = suggestionsMatch
    ? suggestionsMatch[1]
        .split(/\n/) // Split by newline
        .map((suggestion) => suggestion.trim()) // Trim each suggestion
        .filter((suggestion) => suggestion.length > 0) // Remove empty lines
    : [];

  console.log("Parsed Results:", { matchPercentage, missingSkills, suggestions });
  return { matchPercentage, missingSkills, suggestions };
};

module.exports = { extractTextFromPDF, extractTextFromDOC, analyzeResumeWithGemini, parseAnalysisResults };