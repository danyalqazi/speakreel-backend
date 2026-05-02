const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../database");
const { auth } = require("../middleware");

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const existing = db.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.createUser(name, email, hashedPassword);

    // Auto verify for now (email verification in phase 2)
    db.verifyUser(email);

    const token = jwt.sign(
      { id: result.lastInsertRowid, email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: result.lastInsertRowid,
        name,
        email,
        is_verified: true,
        daily_limit: 3,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: "Your account has been banned" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_verified: user.is_verified,
        daily_limit: user.daily_limit,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET current user
router.get("/me", auth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    is_verified: req.user.is_verified,
    daily_limit: req.user.daily_limit,
    role: req.user.role,
  });
});

// UPDATE profile
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password required" });
      }
      const isMatch = await bcrypt.compare(currentPassword, req.user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Current password incorrect" });
      }
      updates.password = await bcrypt.hash(newPassword, 10);
    }
    db.updateUser(req.user.id, updates);
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;