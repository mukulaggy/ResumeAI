const Recruiter = require("../Model/recruiter.js");
const { extractTextFromPDF, extractTextFromDOC } = require("../utils/geminiUtils");
const ResumeModel = require("../Model/resumeModel.js");
const axios = require("axios");
const fs = require("fs");

// Get recruiter dashboard
const getDashboard = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id).select("-password");
    
    // Get resume statistics
    const totalResumes = await ResumeModel.countDocuments({ recruiterId: req.user.id });
    const shortlistedResumes = await ResumeModel.countDocuments({ 
      recruiterId: req.user.id, 
      isShortlisted: true 
    });
    
    res.json({
      recruiter,
      stats: {
        totalResumes,
        shortlistedResumes
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Upload multiple resumes
const uploadResumes = async (req, res) => {
  try {
    const files = req.files;
    const recruiterId = req.user.id;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const extractedTexts = [];
    const savedResumes = [];
    
    for (const file of files) {
      try {
        let text = "";
        if (file.mimetype === "application/pdf") {
          text = await extractTextFromPDF(file.path);
        } else if (
          file.mimetype === "application/msword" ||
          file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          text = await extractTextFromDOC(file.path);
        } else {
          throw new Error("Unsupported file type");
        }

        // Validate if the extracted text is a resume
        const resumePatterns = [
          /experience/i,
          /education/i,
          /skills/i,
          /projects/i,
          /certifications/i,
          /summary/i,
          /objective/i,
          /work\s*history/i,
          /professional\s*experience/i,
        ];

        const isValidResume = resumePatterns.some((pattern) => pattern.test(text));
        if (!isValidResume) {
          throw new Error("Uploaded file does not appear to be a valid resume");
        }

        // Save resume to MongoDB
        const resume = new ResumeModel({
          filename: file.originalname,
          text: text,
          recruiterId: recruiterId,
          uploadedAt: new Date()
        });
        
        await resume.save();
        savedResumes.push(resume);
        
        extractedTexts.push({ 
          filename: file.originalname, 
          text,
          _id: resume._id
        });
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        extractedTexts.push({
          filename: file.originalname,
          error: error.message,
        });
      } finally {
        // Delete the uploaded file after processing
        fs.unlinkSync(file.path);
      }
    }

    res.status(200).json({
      message: "Resumes uploaded successfully",
      data: extractedTexts,
      savedCount: savedResumes.length
    });
  } catch (error) {
    console.error("Error uploading resumes:", error);
    res.status(500).json({ error: "Failed to upload resumes" });
  }
};

// Analyze resumes against job description
const analyzeResumes = async (req, res) => {
  try {
    const { resumes, jobDescription } = req.body;
    const recruiterId = req.user.id;

    if (!resumes || !jobDescription) {
      return res
        .status(400)
        .json({ error: "Resumes and job description are required" });
    }

    const analysisResults = [];
    const batchSize = 5;
    const delayBetweenBatches = 5000;

    for (let i = 0; i < resumes.length; i += batchSize) {
      const batch = resumes.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (resume) => {
          let retries = 3;
          while (retries > 0) {
            try {
              const prompt = `
                Analyze this resume against the job description and provide a concise analysis in exactly this format:

                **Match Percentage**: [number]%

                **Summary**: 
                One or two sentences about overall fit.

                **Strengths**:
                * Key strength 1
                * Key strength 2
                * Key strength 3

                **Weaknesses**:
                * Missing skill 1
                * Missing skill 2
                * Missing skill 3

                **Recommendation**:
                One sentence recommendation.

                Resume Text:
                ${resume.text}

                Job Description:
                ${jobDescription}

                Rules:
                1. Keep all sections brief and to the point
                2. Strengths and Weaknesses should be bullet points starting with *
                3. Use exact section headers with ** marks
                4. Match percentage should be a number between 0-100
                5. Maximum 3-4 points each in Strengths and Weaknesses
                6. No extra sections or text
              `;
              const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
                }
              );

              const analysis = response.data.candidates[0].content.parts[0].text;
              const parsedResults = parseAnalysisResponse(analysis);

              // Update resume in MongoDB with analysis results
              const updatedResume = await ResumeModel.findOneAndUpdate(
                { filename: resume.filename, recruiterId: recruiterId },
                {
                  matchPercentage: parsedResults.matchPercentage,
                  summary: parsedResults.summary,
                  strengths: parsedResults.strengths,
                  weaknesses: parsedResults.weaknesses,
                  recommendation: parsedResults.recommendation,
                  isShortlisted: parsedResults.matchPercentage > 70,
                  jobDescription: jobDescription,
                  analyzedAt: new Date()
                },
                { new: true }
              );

              return {
                filename: resume.filename,
                _id: updatedResume?._id,
                ...parsedResults,
                isShortlisted: parsedResults.matchPercentage > 70,
              };
            } catch (error) {
              if (error.response?.status === 429 && retries > 0) {
                retries--;
                await new Promise((resolve) => setTimeout(resolve, 5000));
              } else {
                console.error(`Error analyzing resume ${resume.filename}:`, error);
                return {
                  filename: resume.filename,
                  error: "Failed to analyze resume",
                };
              }
            }
          }
          return {
            filename: resume.filename,
            error: "Failed to analyze resume after retries",
          };
        })
      );

      analysisResults.push(...batchResults);

      if (i + batchSize < resumes.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }

    res.status(200).json({ message: "Analysis complete", data: analysisResults });
  } catch (error) {
    console.error("Error analyzing resumes:", error);
    res.status(500).json({
      error: "Failed to analyze resumes",
      details: error.message,
    });
  }
};

// Helper function to parse the Gemini API response
const parseAnalysisResponse = (analysisText) => {
  const result = {
    matchPercentage: 0,
    summary: "No summary available",
    strengths: ["No strengths listed"],
    weaknesses: ["No weaknesses listed"],
    recommendation: "No recommendation available",
  };

  try {
    const matchPercentageMatch = analysisText.match(/\*\*Match Percentage\*\*:\s*(\d+)%/);
    if (matchPercentageMatch) {
      result.matchPercentage = parseFloat(matchPercentageMatch[1]);
    }

    const summaryMatch = analysisText.match(/\*\*Summary\*\*:\s*([\s\S]*?)(?=\n\s*\*\*Strengths\*\*|\n\s*\*\*Weaknesses\*\*|\n\s*\*\*Recommendation\*\*|$)/);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }

    const strengthsMatch = analysisText.match(/\*\*Strengths\*\*:\s*([\s\S]*?)(?=\n\s*\*\*Weaknesses\*\*|\n\s*\*\*Recommendation\*\*|$)/);
    if (strengthsMatch) {
      result.strengths = strengthsMatch[1]
        .split("\n")
        .map((s) => s.replace(/^\*\s*/, "").trim())
        .filter((s) => s.length > 0);
    }

    const weaknessesMatch = analysisText.match(/\*\*Weaknesses\*\*:\s*([\s\S]*?)(?=\n\s*\*\*Recommendation\*\*|$)/);
    if (weaknessesMatch) {
      result.weaknesses = weaknessesMatch[1]
        .split("\n")
        .map((s) => s.replace(/^\*\s*/, "").trim())
        .filter((s) => s.length > 0);
    }

    const recommendationMatch = analysisText.match(/\*\*Recommendation\*\*:\s*([\s\S]*?)(?=\n|$)/);
    if (recommendationMatch) {
      result.recommendation = recommendationMatch[1].trim();
    }
  } catch (error) {
    console.error("Error parsing analysis response:", error);
  }

  return result;
};

// Get shortlisted resumes
const getShortlistedResumes = async (req, res) => {
  try {
    const recruiterId = req.user.id;
    const shortlistedResumes = await ResumeModel.find({ 
      recruiterId: recruiterId,
      isShortlisted: true 
    }).sort({ matchPercentage: -1 });
    
    res.status(200).json({ 
      data: shortlistedResumes,
      count: shortlistedResumes.length
    });
  } catch (error) {
    console.error("Error fetching shortlisted resumes:", error);
    res.status(500).json({ error: "Failed to fetch shortlisted resumes" });
  }
};

// Get all resumes for a recruiter
const getAllResumes = async (req, res) => {
  try {
    const recruiterId = req.user.id;
    const resumes = await ResumeModel.find({ recruiterId: recruiterId })
      .sort({ uploadedAt: -1 });
    
    res.status(200).json({ 
      data: resumes,
      count: resumes.length
    });
  } catch (error) {
    console.error("Error fetching resumes:", error);
    res.status(500).json({ error: "Failed to fetch resumes" });
  }
};

// Delete a resume
const deleteResume = async (req, res) => {
  try {
    const { id } = req.params;
    const recruiterId = req.user.id;
    
    const resume = await ResumeModel.findOneAndDelete({
      _id: id,
      recruiterId: recruiterId
    });
    
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }
    
    res.status(200).json({ message: "Resume deleted successfully" });
  } catch (error) {
    console.error("Error deleting resume:", error);
    res.status(500).json({ error: "Failed to delete resume" });
  }
};

module.exports = {
  uploadResumes,
  analyzeResumes,
  getShortlistedResumes,
  getAllResumes,
  deleteResume,
  getDashboard,
};