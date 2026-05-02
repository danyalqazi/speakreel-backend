const axios = require("axios");
const fs = require("fs");
const path = require("path");

const fetchImage = async (searchQuery, slideIndex, jobId) => {
  try {
    console.log(`🖼️ Fetching image for: ${searchQuery}`);

    const response = await axios.get("https://api.pexels.com/v1/search", {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params: {
        query: searchQuery,
        per_page: 10,
        orientation: "landscape",
      },
    });

    const photos = response.data.photos;
    if (!photos || photos.length === 0) {
      throw new Error(`No images found for: ${searchQuery}`);
    }

    // Pick random from top results for variety
    const photo = photos[Math.floor(Math.random() * Math.min(5, photos.length))];
    const imageUrl = photo.src.large2x || photo.src.large;

    // Download image
    const imagePath = path.join(__dirname, "../temp", `${jobId}_slide_${slideIndex}.jpg`);
    const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(imagePath, imageResponse.data);

    console.log(`✅ Image saved: slide_${slideIndex}`);
    return imagePath;
  } catch (err) {
    console.error(`❌ Image fetch error: ${err.message}`);
    // Return a fallback gradient image
    return await createFallbackImage(slideIndex, jobId);
  }
};

const createFallbackImage = async (slideIndex, jobId) => {
  const { createCanvas } = require("canvas");
  const canvas = createCanvas(1920, 1080);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
  gradient.addColorStop(0, "#0A0A0F");
  gradient.addColorStop(1, "#1a0533");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);

  const imagePath = path.join(__dirname, "../temp", `${jobId}_slide_${slideIndex}.jpg`);
  const buffer = canvas.toBuffer("image/jpeg");
  fs.writeFileSync(imagePath, buffer);
  return imagePath;
};

module.exports = { fetchImage };