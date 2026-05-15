const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { auth } = require("../middleware");
const { changeVoice } = require("../services/voiceChangerService");

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const jobId = crypto.randomBytes(8).toString("hex");
    cb(null, `${jobId}_upload${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["video/mp4", "video/avi", "video/mov", "video/mkv", "video/webm"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only video files are allowed"));
  },
});

// Active jobs
const activeJobs = {};

// GET job progress
router.get("/progress/:jobId", auth, (req, res) => {
  const job = activeJobs[req.params.jobId];
  if (!job) return res.json({ status: "not_found" });
  res.json(job);
});

// POST upload video and change voice
router.post("/change", auth, upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a video file" });
    }

    const { gender } = req.body;
    if (!gender || !["male", "female"].includes(gender)) {
      return res.status(400).json({ error: "Please select male or female voice" });
    }

   
    const jobId = crypto.randomBytes(8).toString("hex");
    activeJobs[jobId] = { status: "processing", message: "🚀 Starting...", progress: 0 };

    res.json({ jobId });

    // Process in background
    const videoPath = req.file.path;

    const onProgress = (message, progress) => {
      activeJobs[jobId] = { status: "processing", message, progress };
      console.log(`[VC-${jobId}] ${message} (${progress}%)`);
    };

    try {
      const result = await changeVoice(videoPath, gender, jobId, onProgress);
      activeJobs[jobId] = {
        status: "completed",
        message: "✅ Voice changed successfully!",
        progress: 100,
        cloudinary_url: result.cloudinary_url,
        transcript: result.transcript,
      };
    } catch (err) {
      activeJobs[jobId] = {
        status: "failed",
        message: `❌ Failed: ${err.message}`,
        progress: 0,
      };
    }

    setTimeout(() => delete activeJobs[jobId], 600000);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;