const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

ffmpeg.setFfmpegPath(ffmpegStatic);

// Edge TTS voices — free, no API key needed
const EDGE_VOICES = {
  male: ["en-US-GuyNeural", "en-US-ChristopherNeural", "en-GB-RyanNeural"],
  female: ["en-US-AriaNeural", "en-US-JennyNeural", "en-GB-SoniaNeural"],
  male_urdu: ["ur-PK-AsadNeural"],
  female_urdu: ["ur-PK-UzmaNeural"],
  male_arabic: ["ar-SA-HamedNeural"],
  female_arabic: ["ar-SA-ZariyahNeural"],
  male_hindi: ["hi-IN-MadhurNeural"],
  female_hindi: ["hi-IN-SwaraNeural"],
  male_spanish: ["es-ES-AlvaroNeural"],
  female_spanish: ["es-ES-ElviraNeural"],
  male_french: ["fr-FR-HenriNeural"],
  female_french: ["fr-FR-DeniseNeural"],
  male_turkish: ["tr-TR-AhmetNeural"],
  female_turkish: ["tr-TR-EmelNeural"],
};

const detectLanguage = (text) => {
  if (/[\u0600-\u06FF]/.test(text)) return "urdu";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/[\u4E00-\u9FFF]/.test(text)) return "chinese";
  return "english";
};

// Step 1 — Extract audio from video
const extractAudio = async (videoPath, jobId, tempDir) => {
  const audioPath = path.join(tempDir, `${jobId}_extracted.mp3`);
  console.log("🎵 Extracting audio from video...");

  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions(["-vn", "-acodec libmp3lame", "-q:a 4", "-y"])
      .output(audioPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });

  console.log("✅ Audio extracted!");
  return audioPath;
};

// Step 2 — Transcribe using Groq Whisper (free)
const transcribeAudio = async (audioPath) => {
  console.log("📝 Transcribing audio...");

  const formData = new FormData();
  formData.append("file", fs.createReadStream(audioPath), {
    filename: "audio.mp3",
    contentType: "audio/mpeg",
  });
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "text");

  const response = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );

  const transcript = typeof response.data === "string"
    ? response.data
    : response.data.text || "";

  console.log(`✅ Transcribed (${transcript.length} chars): "${transcript.substring(0, 80)}..."`);
  return transcript;
};

// Step 3 — Generate new voice using Edge TTS (free)
const generateNewVoice = async (text, gender, jobId, tempDir) => {
  console.log(`🎙️ Generating ${gender} voice with Edge TTS...`);

  const detectedLang = detectLanguage(text);
  console.log(`   Language detected: ${detectedLang}`);

  const voiceKey = detectedLang !== "english"
    ? `${gender}_${detectedLang}`
    : gender;

  const voices = EDGE_VOICES[voiceKey] || EDGE_VOICES[gender] || EDGE_VOICES.male;
  const voice = voices[Math.floor(Math.random() * voices.length)];
  console.log(`   Voice: ${voice}`);

  const ttsFolder = path.join(tempDir, `${jobId}_tts_vc`);
  if (!fs.existsSync(ttsFolder)) fs.mkdirSync(ttsFolder, { recursive: true });

  const finalAudioPath = path.join(tempDir, `${jobId}_newvoice.mp3`);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  await tts.toFile(ttsFolder, text);

  const ttsOutput = path.join(ttsFolder, "audio.mp3");
  fs.renameSync(ttsOutput, finalAudioPath);
  try { fs.rmdirSync(ttsFolder); } catch {}

  console.log("✅ New voice generated!");
  return finalAudioPath;
};

// Step 4 — Merge new voice with original video
const mergeAudioWithVideo = async (videoPath, newAudioPath, jobId, tempDir) => {
  console.log("🎬 Merging new voice with video...");
  const outputPath = path.join(tempDir, `${jobId}_result.mp4`);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(newAudioPath)
      .outputOptions([
        "-map 0:v",
        "-map 1:a",
        "-c:v copy",
        "-c:a aac",
        "-b:a 128k",
        "-shortest",
        "-y",
      ])
      .output(outputPath)
      .on("end", () => { console.log("✅ Merged!"); resolve(); })
      .on("error", reject)
      .run();
  });

  return outputPath;
};

// Main function
const changeVoice = async (videoPath, gender, jobId, onProgress) => {
  const tempDir = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const cloudinary = require("cloudinary").v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    // Step 1 — Extract audio
    onProgress("🎵 Extracting audio from video...", 20);
    const audioPath = await extractAudio(videoPath, jobId, tempDir);

    // Step 2 — Transcribe
    onProgress("📝 Transcribing speech with AI...", 35);
    const transcript = await transcribeAudio(audioPath);

    if (!transcript || transcript.trim().length < 5) {
      throw new Error("No speech detected in the video. Please upload a video with clear speech.");
    }

    // Step 3 — Generate new voice
    onProgress(`🎙️ Generating ${gender} voice...`, 55);
    const newAudioPath = await generateNewVoice(transcript, gender, jobId, tempDir);

    // Step 4 — Merge
    onProgress("🎬 Merging new voice with video...", 75);
    const outputPath = await mergeAudioWithVideo(videoPath, newAudioPath, jobId, tempDir);

    // Step 5 — Upload
    onProgress("☁️ Uploading result...", 88);
    const fileSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`📦 Result size: ${fileSizeMB}MB`);

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_large(
        outputPath,
        {
          resource_type: "video",
          folder: "speakreel/voice-changed",
          public_id: `vc_${jobId}`,
          overwrite: true,
          chunk_size: 6000000,
          timeout: 180000,
        },
        (error, result) => {
          if (error) reject(new Error(error.message || JSON.stringify(error)));
          else resolve(result);
        }
      );
    });

    onProgress("✅ Done!", 100);

    // Cleanup
    [audioPath, newAudioPath, outputPath, videoPath].forEach((f) => {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });

    return {
      cloudinary_url: uploadResult.secure_url,
      transcript,
    };

  } catch (err) {
    // Cleanup on error
    try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}
    console.error("❌ Voice changer error:", err.message);
    throw err;
  }
};

module.exports = { changeVoice };