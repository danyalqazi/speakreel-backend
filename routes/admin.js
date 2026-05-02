const express = require("express");
const router = express.Router();
const db = require("../database");
const { adminAuth } = require("../middleware");

// GET stats
router.get("/stats", adminAuth, (req, res) => {
  try {
    res.json(db.getAdminStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET daily stats
router.get("/daily", adminAuth, (req, res) => {
  try {
    res.json(db.getDailyStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all users
router.get("/users", adminAuth, (req, res) => {
  try {
    res.json(db.getAllUsers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE user
router.put("/users/:id", adminAuth, (req, res) => {
  try {
    db.updateUser(parseInt(req.params.id), req.body);
    // Return updated user so frontend can refresh
    const updatedUser = db.getUserById(parseInt(req.params.id));
    res.json({ message: "User updated", user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE user
router.delete("/users/:id", adminAuth, (req, res) => {
  try {
    db.deleteUser(parseInt(req.params.id));
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all videos
router.get("/videos", adminAuth, (req, res) => {
  try {
    res.json(db.getAllVideos());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE video
router.delete("/videos/:id", adminAuth, (req, res) => {
  try {
    db.deleteVideo(parseInt(req.params.id));
    res.json({ message: "Video deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;