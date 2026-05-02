const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const STYLES = ["5 Shocking Facts", "The Untold Story", "Why Nobody Talks About This", "The Complete Guide", "Secrets Revealed"];
const MOODS = ["Shocking", "Inspiring", "Educational", "Mysterious", "Uplifting"];
const ANGLES = ["Historical perspective", "Modern implications", "Psychological angle", "Scientific view", "Cultural impact"];

const SLIDE_COUNTS = {
  short: 4,
  standard: 7,
  long: 13,
  custom: null,
};

const LANGUAGE_NAMES = {
  english: "English",
  urdu: "Urdu (اردو)",
  arabic: "Arabic (العربية)",
  hindi: "Hindi (हिन्दी)",
  spanish: "Spanish (Español)",
  french: "French (Français)",
  german: "German (Deutsch)",
  turkish: "Turkish (Türkçe)",
  chinese: "Chinese (中文)",
  japanese: "Japanese (日本語)",
  korean: "Korean (한국어)",
  russian: "Russian (Русский)",
  italian: "Italian (Italiano)",
  portuguese: "Portuguese (Português)",
  dutch: "Dutch (Nederlands)",
  polish: "Polish (Polski)",
};

const generateScript = async ({ mode, niche, userInput, language, durationType, customSlides, usedTopics = [] }) => {
  const slideCount = durationType === "custom" ? customSlides : SLIDE_COUNTS[durationType];

  const style = STYLES[Math.floor(Math.random() * STYLES.length)];
  const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];

  const languageName = LANGUAGE_NAMES[language.toLowerCase()] || "English";
  const languageInstruction = `CRITICAL: Write ALL narration text in ${languageName} language only. Every word of narration must be in ${languageName}. Only keep JSON keys in English.`;

  const usedTopicsText = usedTopics.length > 0
    ? `IMPORTANT: Do NOT cover these topics already used: ${usedTopics.slice(-10).join(", ")}`
    : "";

  // Dynamic narration length based on video type
  const narrationLength = durationType === "short"
    ? "30-40 words MAXIMUM — very short, punchy, fast-paced. Every word counts."
    : durationType === "long"
    ? "120-140 words — comprehensive, detailed and in-depth"
    : "80-100 words — detailed and informative";

  const narrationWordCount = durationType === "short"
    ? "30-40 words MAX"
    : durationType === "long"
    ? "120-140 words"
    : "80-100 words";

  const narrationRules = `NARRATION RULES:
- Each narration must be EXACTLY ${narrationLength}
- First slide: Start with a powerful hook that grabs attention immediately
- Middle slides: Each must flow naturally, covering one clear point
- Last slide: End with a strong call to action (like, subscribe, comment)
- Every narration must start AND end with complete sentences
- No cliffhangers, no mid-sentence cuts
- Write as if speaking naturally to a viewer
- STRICTLY follow the word count — this is critical for video timing
${durationType === "short" ? "- SHORT MODE: Keep it ultra-brief. Max 40 words per slide. No exceptions." : ""}`;

  let systemPrompt = "";
  let userPrompt = "";

  if (mode === "auto") {
    systemPrompt = `You are an expert faceless YouTube video script writer.
You create engaging, viral scripts for the ${niche} niche.
Style: ${style} | Mood: ${mood} | Angle: ${angle}
${languageInstruction}
${usedTopicsText}
${narrationRules}
Always respond in valid JSON only. No markdown, no explanation.`;

    userPrompt = `Create a complete ${slideCount}-slide faceless video script about ${niche}.
Pick a specific, interesting sub-topic automatically.
Make it engaging, informative and shareable.
${durationType === "short" ? "IMPORTANT: This is a SHORT/REEL video. Each narration must be 30-40 words MAXIMUM. Total video should be 30-60 seconds." : ""}

Return ONLY this JSON (no extra text):
{
  "topic": "specific topic title",
  "youtube_title": "engaging YouTube title under 60 chars",
  "youtube_description": "SEO optimized description 150 words with keywords",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "slides": [
    {
      "title": "slide title",
      "narration": "${narrationWordCount} narration. Slide 1: powerful hook. Last slide: call to action.",
      "image_search": "specific 3-4 word search term for stock image"
    }
  ]
}`;

  } else if (mode === "ideas") {
    systemPrompt = `You are an expert video script writer who transforms raw ideas into viral scripts.
Keep the user's original opinion and tone but make it more engaging and structured.
${languageInstruction}
${usedTopicsText}
${narrationRules}
Always respond in valid JSON only. No markdown, no explanation.`;

    userPrompt = `Transform this raw idea into a ${slideCount}-slide faceless video script:
"${userInput}"

Keep the user's original perspective and opinion. Make it more engaging while staying true to their voice.
${durationType === "short" ? "IMPORTANT: This is a SHORT/REEL video. Each narration must be 30-40 words MAXIMUM. Total video should be 30-60 seconds." : ""}

Return ONLY this JSON (no extra text):
{
  "topic": "refined topic title",
  "youtube_title": "engaging YouTube title under 60 chars",
  "youtube_description": "SEO optimized description 150 words",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "slides": [
    {
      "title": "slide title",
      "narration": "${narrationWordCount} narration keeping user's original opinion and voice.",
      "image_search": "specific 3-4 word search term for stock image"
    }
  ]
}`;

  } else if (mode === "article") {
    systemPrompt = `You are an expert at converting articles and blog posts into engaging faceless video scripts.
Extract the most important points and present them in an engaging, visual way.
${languageInstruction}
${narrationRules}
Always respond in valid JSON only. No markdown, no explanation.`;

    userPrompt = `Convert this article into a ${slideCount}-slide faceless video script:
"${userInput}"

Extract key points, simplify complex ideas, and make it engaging for video viewers.
${durationType === "short" ? "IMPORTANT: This is a SHORT/REEL video. Each narration must be 30-40 words MAXIMUM. Total video should be 30-60 seconds." : ""}

Return ONLY this JSON (no extra text):
{
  "topic": "article topic title",
  "youtube_title": "engaging YouTube title under 60 chars",
  "youtube_description": "SEO optimized description 150 words",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "slides": [
    {
      "title": "slide title",
      "narration": "${narrationWordCount} narration summarizing this section of the article.",
      "image_search": "specific 3-4 word search term for stock image"
    }
  ]
}`;
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0].message.content;
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Validate response
    if (!parsed.slides || parsed.slides.length === 0) {
      throw new Error("AI returned empty slides");
    }

    // Log narration word counts for debugging
    parsed.slides.forEach((slide, i) => {
      const wordCount = slide.narration.split(" ").length;
      console.log(`  Slide ${i + 1}: ${wordCount} words`);
    });

    console.log(`✅ Script generated: "${parsed.topic}" (${parsed.slides.length} slides)`);
    return parsed;

  } catch (err) {
    console.error("❌ Script generation error:", err.message);
    throw new Error(`Script generation failed: ${err.message}`);
  }
};

module.exports = { generateScript };