const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const path = require("path");

const adapter = new FileSync(path.join(__dirname, "speakreel.json"));
const db = low(adapter);

db.defaults({
  users: [],
  videos: [],
  used_topics: [],
  reset_tokens: [],
  generation_logs: [],
    app_settings: {
    mode: "free",           // "free" or "freemium"
    pro_price: 9,
    free_video_limit: 3,
    pro_video_limit: 999,
    voice_changer_free: true,  // Admin can toggle
    voice_changer_pro_only: false,
  },
  _counters: { users: 0, videos: 0 },
}).write();

const nextId = (table) => {
  const current = db.get(`_counters.${table}`).value();
  const next = current + 1;
  db.set(`_counters.${table}`, next).write();
  return next;
};

const dbHelper = {
  // APP SETTINGS
  getAppSettings: () => {
    return db.get("app_settings").value();
  },

  updateAppSettings: (settings) => {
    db.get("app_settings").assign(settings).write();
    return db.get("app_settings").value();
  },

  isProFeature: (feature) => {
    const settings = db.get("app_settings").value();
    if (settings.mode === "free") return false; // Everything free
    return settings[`${feature}_pro_only`] || false;
  },
  // USERS
  createUser: (name, email, password) => {
    const id = nextId("users");
    const user = {
      id,
      name,
      email,
      password,
      role: "user",
      is_verified: false,
      is_banned: false,
      daily_limit: 3,
      created_at: new Date().toISOString(),
    };
    db.get("users").push(user).write();
    return { lastInsertRowid: id };
  },

  getUserByEmail: (email) => {
    return db.get("users").find({ email }).value();
  },

  getUserById: (id) => {
    return db.get("users").find({ id: parseInt(id) }).value();
  },

  verifyUser: (email) => {
    db.get("users").find({ email }).assign({ is_verified: true }).write();
  },

  updateUser: (id, data) => {
    db.get("users").find({ id: parseInt(id) }).assign(data).write();
  },

  deleteUser: (id) => {
    db.get("users").remove({ id: parseInt(id) }).write();
    db.get("videos").remove({ user_id: parseInt(id) }).write();
  },

  getAllUsers: () => {
    return db.get("users").value().map((u) => {
      const videos = db.get("videos").filter({ user_id: u.id }).value();
      return { ...u, password: undefined, totalVideos: videos.length };
    });
  },

  // VIDEOS
  createVideo: (user_id, data) => {
    const id = nextId("videos");
    const video = {
      id,
      user_id,
      title: data.title,
      niche: data.niche,
      mode: data.mode,
      language: data.language,
      duration_type: data.duration_type,
      script: data.script,
      cloudinary_url: data.cloudinary_url,
      cloudinary_id: data.cloudinary_id,
      thumbnail: data.thumbnail,
      youtube_title: data.youtube_title,
      youtube_description: data.youtube_description,
      hashtags: data.hashtags,
      status: "completed",
      created_at: new Date().toISOString(),
    };
    db.get("videos").push(video).write();
    return video;
  },

  getVideosByUser: (user_id) => {
    return db.get("videos")
      .filter({ user_id: parseInt(user_id) })
      .value()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  getVideoById: (id) => {
    return db.get("videos").find({ id: parseInt(id) }).value();
  },

  deleteVideo: (id) => {
    db.get("videos").remove({ id: parseInt(id) }).write();
  },

  getAllVideos: () => {
    return db.get("videos").value()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((v) => {
        const user = db.get("users").find({ id: v.user_id }).value();
        return { ...v, userName: user?.name, userEmail: user?.email };
      });
  },

  getTodayVideoCount: (user_id) => {
    const today = new Date().toISOString().split("T")[0];
    // Count from generation_logs not videos (so deleting doesn't reset limit)
    return db.get("generation_logs")
      .filter((l) => l.user_id === parseInt(user_id) &&
        l.created_at.startsWith(today))
      .value().length;
  },

  logGeneration: (user_id) => {
    db.get("generation_logs").push({
      user_id: parseInt(user_id),
      created_at: new Date().toISOString(),
    }).write();
  },

  // USED TOPICS (Never Repeat Engine)
  saveUsedTopic: (user_id, niche, topic) => {
    db.get("used_topics").push({
      user_id: parseInt(user_id),
      niche,
      topic,
      created_at: new Date().toISOString(),
    }).write();
  },

  getUsedTopics: (user_id, niche) => {
    return db.get("used_topics")
      .filter({ user_id: parseInt(user_id), niche })
      .map("topic")
      .value();
  },

  // RESET TOKENS
  saveResetToken: (email, token, expiry) => {
    db.get("reset_tokens").remove({ email }).write();
    db.get("reset_tokens").push({ email, token, expiry }).write();
  },

  getResetToken: (token) => {
    return db.get("reset_tokens").find({ token }).value();
  },

  deleteResetToken: (token) => {
    db.get("reset_tokens").remove({ token }).write();
  },

  updatePassword: (email, hashedPassword) => {
    db.get("users").find({ email }).assign({ password: hashedPassword }).write();
  },

  // ADMIN STATS
  getAdminStats: () => {
    const users = db.get("users").value();
    const videos = db.get("videos").value();
    const today = new Date().toISOString().split("T")[0];
    const todayVideos = videos.filter((v) => v.created_at.startsWith(today));
    const todayUsers = users.filter((u) => u.created_at.startsWith(today));

    const nicheStats = {};
    videos.forEach((v) => {
      if (!nicheStats[v.niche]) nicheStats[v.niche] = 0;
      nicheStats[v.niche]++;
    });

    const langStats = {};
    videos.forEach((v) => {
      if (!langStats[v.language]) langStats[v.language] = 0;
      langStats[v.language]++;
    });

    return {
      totalUsers: users.length,
      totalVideos: videos.length,
      todayVideos: todayVideos.length,
      todayUsers: todayUsers.length,
      verifiedUsers: users.filter((u) => u.is_verified).length,
      bannedUsers: users.filter((u) => u.is_banned).length,
      nicheStats,
      langStats,
    };
  },

  getDailyStats: () => {
    const videos = db.get("videos").value();
    const users = db.get("users").value();
    const last30 = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split("T")[0];
      last30[date] = { date: date.slice(5), videos: 0, signups: 0 };
    }
    videos.forEach((v) => {
      const date = v.created_at.split("T")[0];
      if (last30[date]) last30[date].videos++;
    });
    users.forEach((u) => {
      const date = u.created_at.split("T")[0];
      if (last30[date]) last30[date].signups++;
    });
    return Object.values(last30);
  },
};

console.log("✅ SpeakReel Database ready!");
module.exports = dbHelper;