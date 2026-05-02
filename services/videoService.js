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

// Ken Burns presets — lightweight versions
const getKenBurns = (index, duration, width, height) => {
  const frames = Math.ceil(duration * 24); // 24fps
  const effects = [
    // Slow zoom in
    `zoompan=z='min(zoom+0.001,1.3)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=24`,
    // Slow zoom out
    `zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.001))':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=24`,
    // Pan left to right
    `zoompan=z='1.2':d=${frames}:x='if(lte(on,1),0,x+1.5)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=24`,
    // Pan right to left
    `zoompan=z='1.2':d=${frames}:x='if(lte(on,1),iw,x-1.5)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=24`,
  ];
  return effects[index % effects.length];
};

const assembleVideo = async (slides, jobId, durationType, onProgress, niche = "History") => {
  const tempDir = path.join(__dirname, "../temp");
  const musicDir = path.join(__dirname, "../music");
  const outputPath = path.join(__dirname, "../videos", `${jobId}_final.mp4`);

  // Video dimensions
  const WIDTH = 1280;
  const HEIGHT = 720;

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(path.join(__dirname, "../videos"))) {
    fs.mkdirSync(path.join(__dirname, "../videos"), { recursive: true });
  }

  try {
    // Step 1 — Get audio durations
    onProgress("🎬 Analyzing audio files...", 71);
    const audioDurations = await Promise.all(
      slides.map((s) => getAudioDuration(s.audioPath))
    );
    const totalDuration = audioDurations.reduce((a, b) => a + b, 0);
    console.log(`📊 Total: ${totalDuration.toFixed(1)}s | Slides: ${audioDurations.map(d => d.toFixed(1) + "s").join(", ")}`);

    // Step 2 — Build each slide with Ken Burns + text overlay
    onProgress("🎬 Building slides...", 73);
    const slideVideos = [];

    for (let i = 0; i < slides.length; i++) {
      const slideVideoPath = path.join(tempDir, `${jobId}_slide_${i}.mp4`);
      const imagePath = slides[i].imagePath;
      const audioPath = slides[i].audioPath;
      const duration = audioDurations[i];

      // Safe title for text overlay
      // Only keep English characters for FFmpeg text overlay
      // Non-English titles (Urdu, Arabic, etc.) are skipped to avoid FFmpeg errors
      const rawTitle = slides[i].title || "";
      const isEnglishOnly = /^[a-zA-Z0-9 .,!?'-]+$/.test(rawTitle);
      const safeTitle = isEnglishOnly
        ? rawTitle.substring(0, 45).trim()
        : ""; // Skip text overlay for non-English languages

      console.log(`🎬 Slide ${i + 1}/${slides.length} (${duration.toFixed(1)}s)`);

      const kenBurns = getKenBurns(i, duration, WIDTH, HEIGHT);

      // Text overlay filter
      const textFilter = safeTitle
        ? `,drawtext=text='${safeTitle}':fontsize=30:fontcolor=white:x=(w-text_w)/2:y=h-65:box=1:boxcolor=black@0.65:boxborderw=8`
        : "";

      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(audioPath)
          .input(imagePath)
          .inputOptions(["-loop 1"])
          .outputOptions([
            `-vf`, `scale=8000:-1,${kenBurns}${textFilter},setsar=1`,
            `-c:v libx264`,
            `-preset ultrafast`,
            `-crf 30`,
            `-c:a aac`,
            `-b:a 96k`,
            `-pix_fmt yuv420p`,
            `-movflags +faststart`,
            `-shortest`,
            `-y`,
          ])
          .output(slideVideoPath)
          .on("end", () => {
            const size = (fs.statSync(slideVideoPath).size / 1024 / 1024).toFixed(1);
            console.log(`✅ Slide ${i + 1} done (${size}MB)`);
            resolve();
          })
          .on("error", (err, stdout, stderr) => {
            console.error(`❌ Slide ${i + 1} error:`, err.message);
            // Fallback — render without Ken Burns
            ffmpeg()
              .input(audioPath)
              .input(imagePath)
              .inputOptions(["-loop 1"])
              .outputOptions([
                `-vf`, `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1${textFilter}`,
                `-c:v libx264`,
                `-preset ultrafast`,
                `-crf 30`,
                `-c:a aac`,
                `-b:a 96k`,
                `-pix_fmt yuv420p`,
                `-shortest`,
                `-y`,
              ])
              .output(slideVideoPath)
              .on("end", resolve)
              .on("error", reject)
              .run();
          })
          .run();
      });

      slideVideos.push(slideVideoPath);
      onProgress(
        `🎬 Slide ${i + 1}/${slides.length} done`,
        73 + Math.round(((i + 1) / slides.length) * 10)
      );
    }

    // Step 3 — Merge all slides
    onProgress("🔗 Merging slides...", 83);
    const concatFile = path.join(tempDir, `${jobId}_concat.txt`);
    fs.writeFileSync(concatFile,
      slideVideos.map((v) => `file '${v.replace(/\\/g, "/")}'`).join("\n")
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

    // Step 4 — Add background music
    onProgress("🎵 Adding background music...", 86);
    const musicType = getMusicForNiche(niche);
    const musicPath = path.join(musicDir, MUSIC_FILES[musicType]);
    const finalPath = path.join(tempDir, `${jobId}_final_temp.mp4`);

    if (fs.existsSync(musicPath)) {
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(mergedPath)
          .input(musicPath)
          .complexFilter([
            "[1:a]volume=0.12,aloop=loop=-1:size=2e+09[music]",
            "[0:a][music]amix=inputs=2:duration=first:dropout_transition=3[aout]",
          ])
          .outputOptions([
            "-map 0:v",
            "-map [aout]",
            "-c:v copy",
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

    // Verify
    if (!fs.existsSync(outputPath)) throw new Error("Output not created");
    const fileSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    console.log(`✅ Final video: ${fileSizeMB}MB, ${totalDuration.toFixed(1)}s`);

    onProgress(`☁️ Uploading ${fileSizeMB}MB...`, 90);

    // Step 5 — Upload to Cloudinary
    let uploadResult;
    uploadResult = await new Promise((resolve, reject) => {
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
          if (error) {
            reject(new Error(error.message || JSON.stringify(error)));
          } else {
            console.log("✅ Uploaded:", result.secure_url);
            resolve(result);
          }
        }
      );
    });

    onProgress("✅ Video ready!", 100);

    // Cleanup
    cleanup(tempDir, jobId, [
      outputPath, mergedPath, finalPath,
      concatFile, ...slideVideos,
    ]);

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
    files.forEach((f) => {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
    fs.readdirSync(tempDir).forEach((f) => {
      if (f.startsWith(jobId)) {
        try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
      }
    });
  } catch (err) {
    console.error("Cleanup error:", err.message);
  }
};

module.exports = { assembleVideo };