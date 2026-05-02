const jwt = require("jsonwebtoken");
const db = require("./database");

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.getUserById(decoded.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.is_banned) return res.status(403).json({ error: "Account banned" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const adminEmails = process.env.ADMIN_EMAIL.split(",").map(e => e.trim());
    if (!adminEmails.includes(decoded.email)) {
      return res.status(403).json({ error: "Admin access only" });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = { auth, adminAuth };