const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;

ffmpeg.setFfmpegPath(ffmpegStatic);
console.log("✅ FFmpeg path set:", ffmpegStatic);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MUSIC_FILES = {
  cinematic: "cinematic.mp3",
  upbeat: "upbeat.mp3",
  mysterious: "mysterious.mp3",
  inspiring: "inspiring.mp3",
};

const getMusicForNiche = (niche) => {
  const nicheMusic = {
    History: "cinematic", Science: "cinematic",
    Finance: "upbeat", Motivation: "inspiring",
    Islamic: "cinematic", Technology: "upbeat",
    Health: "inspiring", Business: "upbeat",
    "True Crime": "mysterious", Space: "cinematic",
    Psychology: "mysterious", Geography: "cinematic",
    Philosophy: "mysterious", Politics: "cinematic",
    Nature: "inspiring",
  };
  return nicheMusic[niche] || "cinematic";
};

const assembleVideo = async (slides, jobId, durationType, onProgress, niche = "History") => {
  const tempDir = path.join(__dirname, "../temp");
  const musicDir = path.join(__dirname, "../music");
  const outputPath = path.join(__dirname, "../videos", `${jobId}_final.mp4`);

  // Ensure directories exist
  [tempDir, path.join(__dirname, "../videos"), musicDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  try {
    // Step 1 — Get audio durations
    onProgress("🎬 Analyzing audio...", 71);
    const audioDurations = await Promise.all(
      slides.map((s) => getAudioDuration(s.audioPath))
    );
    const totalDuration = audioDurations.reduce((a, b) => a + b, 0);
    console.log(`📊 Total: ${totalDuration.toFixed(1)}s`);

    // Step 2 — Build each slide video (ultra simple, no filters)
    onProgress("🎬 Building slides...", 73);
    const slideVideos = [];

    for (let i = 0; i < slides.length; i++) {
      const slideVideoPath = path.join(tempDir, `${jobId}_slide_${i}.mp4`);
      const imagePath = slides[i].imagePath;
      const audioPath = slides[i].audioPath;
      const duration = audioDurations[i];

      console.log(`🎬 Slide ${i + 1}/${slides.length} (${duration.toFixed(1)}s)`);

      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(audioPath)
          .input(imagePath)
          .inputOptions(["-loop 1"])
          .outputOptions([
            "-c:v libx264",
            "-preset ultrafast",
            "-crf 30",
            "-c:a aac",
            "-b:a 96k",
            "-pix_fmt yuv420p",
            "-vf scale=1280:720",
            "-shortest",
            "-y",
          ])
          .output(slideVideoPath)
          .on("end", () => {
            console.log(`✅ Slide ${i + 1} done`);
            resolve();
          })
          .on("error", (err) => {
            console.error(`❌ Slide ${i + 1} error:`, err.message);
            reject(err);
          })
          .run();
      });

      slideVideos.push(slideVideoPath);
      onProgress(
        `🎬 Slide ${i + 1}/${slides.length} done`,
        73 + Math.round(((i + 1) / slides.length) * 10)
      );
    }

    // Step 3 — Merge slides
    onProgress("🔗 Merging slides...", 83);
    const concatFile = path.join(tempDir, `${jobId}_concat.txt`);
    fs.writeFileSync(concatFile,
      slideVideos.map(v => `file '${v.replace(/\\/g, "/")}'`).join("\n")
    );

    const mergedPath = path.join(tempDir, `${jobId}_merged.mp4`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatFile)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions(["-c copy", "-y"])
        .output(mergedPath)
        .on("end", () => { console.log("✅ Merged!"); resolve(); })
        .on("error", reject)
        .run();
    });

    // Step 4 — Add background music (optional)
    onProgress("🎵 Adding music...", 86);
    const musicType = getMusicForNiche(niche);
    const musicPath = path.join(musicDir, MUSIC_FILES[musicType]);
    const finalPath = path.join(tempDir, `${jobId}_with_music.mp4`);

    if (fs.existsSync(musicPath)) {
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(mergedPath)
          .input(musicPath)
          .outputOptions([
            "-c:v copy",
            "-filter_complex [1:a]volume=0.12,aloop=loop=-1:size=2e+09[music];[0:a][music]amix=inputs=2:duration=first[aout]",
            "-map 0:v",
            "-map [aout]",
            "-c:a aac",
            "-b:a 128k",
            "-shortest",
            "-y",
          ])
          .output(finalPath)
          .on("end", () => { console.log("✅ Music added!"); resolve(); })
          .on("error", (err) => {
            console.error("⚠️ Music failed:", err.message);
            fs.copyFileSync(mergedPath, finalPath);
            resolve();
          })
          .run();
      });
    } else {
      console.log("⚠️ No music file, skipping");
      fs.copyFileSync(mergedPath, finalPath);
    }

    fs.copyFileSync(finalPath, outputPath);

    if (!fs.existsSync(outputPath)) throw new Error("Output not created");
    const fileSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    console.log(`✅ Final: ${fileSizeMB}MB, ${totalDuration.toFixed(1)}s`);

    onProgress(`☁️ Uploading ${fileSizeMB}MB...`, 90);

    // Step 5 — Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_large(
        outputPath,
        {
          resource_type: "video",
          folder: "speakreel",
          public_id: jobId,
          overwrite: true,
          chunk_size: 6000000,
          timeout: 300000,
        },
        (error, result) => {
          if (error) reject(new Error(error.message || JSON.stringify(error)));
          else { console.log("✅ Uploaded:", result.secure_url); resolve(result); }
        }
      );
    });

    onProgress("✅ Video ready!", 100);

    cleanup(tempDir, jobId, [outputPath, mergedPath, finalPath, concatFile, ...slideVideos]);

    return {
      cloudinary_url: uploadResult.secure_url,
      cloudinary_id: uploadResult.public_id,
      thumbnail: uploadResult.secure_url.replace(/\.[^/.]+$/, ".jpg"),
    };

  } catch (err) {
    console.error("❌ Assembly error:", err.message);
    throw err;
  }
};

const getAudioDuration = (audioPath) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) resolve(10);
      else resolve(metadata.format.duration || 10);
    });
  });
};

const cleanup = (tempDir, jobId, files = []) => {
  try {
    files.forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
    fs.readdirSync(tempDir).forEach(f => {
      if (f.startsWith(jobId)) {
        try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
      }
    });
  } catch (err) {
    console.error("Cleanup error:", err.message);
  }
};

module.exports = { assembleVideo };