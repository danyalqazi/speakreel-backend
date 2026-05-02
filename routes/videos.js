const express = require("express");
const router = express.Router();
const { auth } = require("../middleware");
const db = require("../database");
const { generateScript } = require("../services/scriptService");
const { fetchImage } = require("../services/imageService");
const { generateVoiceover } = require("../services/voiceService");
const { assembleVideo } = require("../services/videoService");
const crypto = require("crypto");

// Store active job progress
const activeJobs = {};

// GET video generation progress — MUST be before /:id
router.get("/progress/:jobId", auth, (req, res) => {
  const job = activeJobs[req.params.jobId];
  if (!job) return res.json({ status: "not_found" });
  res.json(job);
});

// GET today's video count — MUST be before /:id
router.get("/today-count", auth, (req, res) => {
  try {
    const freshUser = db.getUserById(req.user.id);
    const count = db.getTodayVideoCount(req.user.id);
    const limit = freshUser?.daily_limit || 3;
    res.json({ count, limit, remaining: Math.max(0, limit - count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all user videos
router.get("/", auth, (req, res) => {
  try {
    const videos = db.getVideosByUser(req.user.id);
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single video — MUST be after all specific routes
router.get("/:id", auth, (req, res) => {
  try {
    const video = db.getVideoById(req.params.id);
    if (!video || video.user_id !== req.user.id) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE video
router.delete("/:id", auth, (req, res) => {
  try {
    const video = db.getVideoById(req.params.id);
    if (!video || video.user_id !== req.user.id) {
      return res.status(404).json({ error: "Video not found" });
    }
    db.deleteVideo(req.params.id);
    res.json({ message: "Video deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GENERATE video
router.post("/generate", auth, async (req, res) => {
  try {
    const { mode, niche, userInput, language, durationType, customSlides } = req.body;

    // Get fresh user data for accurate limit
    const freshUser = db.getUserById(req.user.id);
    const todayCount = db.getTodayVideoCount(req.user.id);
    const limit = freshUser?.daily_limit || 3;

    // Check daily limit
    if (todayCount >= limit) {
      return res.status(429).json({
        error: `Daily limit reached. You can create ${limit} videos per day. Come back tomorrow!`,
      });
    }

    // Validate inputs
    if (!mode || !language || !durationType) {
      return res.status(400).json({ error: "Mode, language and duration are required" });
    }
    if (mode === "auto" && !niche) {
      return res.status(400).json({ error: "Please select a niche" });
    }
    if ((mode === "ideas" || mode === "article") && !userInput) {
      return res.status(400).json({ error: "Please provide your content" });
    }

    // Create job
    const jobId = crypto.randomBytes(8).toString("hex");
    activeJobs[jobId] = {
      status: "started",
      message: "🚀 Starting generation...",
      progress: 0,
    };

    // Log generation immediately so deleting videos can't bypass limit
    db.logGeneration(req.user.id);

    // Return job ID immediately
    res.json({ jobId });

    // Generate in background
    generateVideo({
      jobId,
      userId: req.user.id,
      mode,
      niche,
      userInput,
      language,
      durationType,
      customSlides,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const generateVideo = async ({
  jobId, userId, mode, niche,
  userInput, language, durationType, customSlides,
}) => {
  const updateProgress = (message, progress) => {
    activeJobs[jobId] = { status: "processing", message, progress };
    console.log(`[${jobId}] ${message} (${progress}%)`);
  };

  try {
    // Step 1 — Generate Script
    updateProgress("🤖 AI is writing your script...", 10);
    const usedTopics = db.getUsedTopics(userId, niche || "general");
    const script = await generateScript({
      mode, niche, userInput, language,
      durationType, customSlides, usedTopics,
    });
    updateProgress("✅ Script generated!", 25);

    // Step 2 — Fetch Images
    updateProgress("📸 Finding perfect images...", 30);
    const imageResults = [];
    for (let i = 0; i < script.slides.length; i++) {
      const imagePath = await fetchImage(
        script.slides[i].image_search, i, jobId
      );
      imageResults.push(imagePath);
      updateProgress(
        `📸 Images: ${i + 1}/${script.slides.length}`,
        30 + Math.round((i / script.slides.length) * 20)
      );
    }
    updateProgress("✅ All images ready!", 50);

    // Step 3 — Generate Voiceovers
    updateProgress("🎙️ Creating voiceovers...", 55);
    const audioResults = [];
    for (let i = 0; i < script.slides.length; i++) {
      const audioPath = await generateVoiceover(
        script.slides[i].narration, language, i, jobId
      );
      audioResults.push(audioPath);
      updateProgress(
        `🎙️ Voiceover: ${i + 1}/${script.slides.length}`,
        55 + Math.round((i / script.slides.length) * 15)
      );
    }
    updateProgress("✅ All voiceovers ready!", 70);

    // Step 4 — Assemble Video
    const slides = script.slides.map((s, i) => ({
      ...s,
      imagePath: imageResults[i],
      audioPath: audioResults[i],
    }));

   const videoResult = await assembleVideo(
      slides, jobId, durationType, updateProgress, niche
    );

    // Step 5 — Save to Database
    const video = db.createVideo(userId, {
      title: script.topic,
      niche: niche || "general",
      mode,
      language,
      duration_type: durationType,
      script: JSON.stringify(script),
      cloudinary_url: videoResult.cloudinary_url,
      cloudinary_id: videoResult.cloudinary_id,
      thumbnail: videoResult.thumbnail,
      youtube_title: script.youtube_title,
      youtube_description: script.youtube_description,
      hashtags: script.hashtags.join(" "),
    });

    // Save topic to never-repeat engine
    db.saveUsedTopic(userId, niche || "general", script.topic);

    activeJobs[jobId] = {
      status: "completed",
      message: "🎉 Your video is ready!",
      progress: 100,
      video,
    };

  } catch (err) {
    const errorMessage = err?.message || err?.toString() || "Unknown error occurred";
    console.error(`❌ Generation failed [${jobId}]:`, errorMessage);
    console.error("Full error:", err);
    activeJobs[jobId] = {
      status: "failed",
      message: `❌ Generation failed: ${errorMessage}`,
      progress: 0,
    };
  }

  // Cleanup job after 10 minutes
  setTimeout(() => delete activeJobs[jobId], 600000);
};

module.exports = router;