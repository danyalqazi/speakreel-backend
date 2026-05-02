const fs = require("fs");
const path = require("path");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const VOICES = {
  english: "en-US-AriaNeural",
  urdu: "ur-PK-AsadNeural",
  arabic: "ar-SA-ZariyahNeural",
  hindi: "hi-IN-SwaraNeural",
  spanish: "es-ES-ElviraNeural",
  french: "fr-FR-DeniseNeural",
  german: "de-DE-KatjaNeural",
  turkish: "tr-TR-EmelNeural",
  chinese: "zh-CN-XiaoxiaoNeural",
  japanese: "ja-JP-NanamiNeural",
  korean: "ko-KR-SunHiNeural",
  russian: "ru-RU-SvetlanaNeural",
  italian: "it-IT-ElsaNeural",
  portuguese: "pt-BR-FranciscaNeural",
  dutch: "nl-NL-ColetteNeural",
  polish: "pl-PL-AgnieszkaNeural",
};

const generateVoiceover = async (text, language, slideIndex, jobId) => {
  const tempDir = path.join(__dirname, "../temp");
  const rawPath = path.join(tempDir, `${jobId}_raw_${slideIndex}.mp3`);
  const finalPath = path.join(tempDir, `${jobId}_audio_${slideIndex}.mp3`);
  const ttsFolder = path.join(tempDir, `${jobId}_tts_${slideIndex}`);

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(ttsFolder)) fs.mkdirSync(ttsFolder, { recursive: true });

  try {
    console.log(`🎙️ Generating voiceover for slide ${slideIndex}...`);
    const voice = VOICES[language.toLowerCase()] || VOICES.english;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    await tts.toFile(ttsFolder, text);

    const ttsOutput = path.join(ttsFolder, "audio.mp3");
    fs.renameSync(ttsOutput, rawPath);
    try { fs.rmdirSync(ttsFolder); } catch {}

    // Add 0.5s silence at start and 1s silence at end
    await addSilencePadding(rawPath, finalPath);

    console.log(`✅ Voiceover saved: audio_${slideIndex}`);
    return finalPath;
  } catch (err) {
    console.error(`❌ Voiceover error: ${err.message}`);
    try { fs.rmSync(ttsFolder, { recursive: true }); } catch {}
    return await createSilenceAudio(finalPath);
  }
};

const addSilencePadding = async (inputPath, outputPath) => {
  const ffmpegStatic = require("ffmpeg-static");
  const { execSync } = require("child_process");
  try {
    // Add 0.5s silence before and 1s silence after
    execSync(
      `"${ffmpegStatic}" -f lavfi -i anullsrc=r=24000:cl=mono -t 0.5 -q:a 9 -acodec libmp3lame "${inputPath}_silence_start.mp3" -y`,
      { stdio: "ignore" }
    );
    execSync(
      `"${ffmpegStatic}" -f lavfi -i anullsrc=r=24000:cl=mono -t 1.0 -q:a 9 -acodec libmp3lame "${inputPath}_silence_end.mp3" -y`,
      { stdio: "ignore" }
    );

    // Create concat file
    const concatFile = `${inputPath}_pad_concat.txt`;
    fs.writeFileSync(concatFile,
      `file '${(inputPath + "_silence_start.mp3").replace(/\\/g, "/")}'\n` +
      `file '${inputPath.replace(/\\/g, "/")}'\n` +
      `file '${(inputPath + "_silence_end.mp3").replace(/\\/g, "/")}'\n`
    );

    execSync(
      `"${ffmpegStatic}" -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}" -y`,
      { stdio: "ignore" }
    );

    // Cleanup temp files
    try {
      fs.unlinkSync(`${inputPath}_silence_start.mp3`);
      fs.unlinkSync(`${inputPath}_silence_end.mp3`);
      fs.unlinkSync(concatFile);
      fs.unlinkSync(inputPath);
    } catch {}

    console.log(`✅ Silence padding added to slide`);
  } catch (err) {
    console.error("Padding error:", err.message);
    // If padding fails, just use raw audio
    fs.renameSync(inputPath, outputPath);
  }
};

const createSilenceAudio = async (outputPath) => {
  console.log("⚠️ Creating silence fallback...");
  const ffmpegStatic = require("ffmpeg-static");
  const { execSync } = require("child_process");
  try {
    execSync(
      `"${ffmpegStatic}" -f lavfi -i anullsrc=r=44100:cl=mono -t 15 -q:a 9 -acodec libmp3lame "${outputPath}" -y`,
      { stdio: "ignore" }
    );
    console.log("✅ Silence audio created");
  } catch (err) {
    console.error("❌ Silence creation failed:", err.message);
    fs.writeFileSync(outputPath, Buffer.alloc(1024, 0));
  }
  return outputPath;
};

module.exports = { generateVoiceover, VOICES };