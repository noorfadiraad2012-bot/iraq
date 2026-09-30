require("dotenv").config();

if (!process.env.DISCORD_TOKEN) {
  console.error("[config] missing DISCORD_TOKEN in .env");
  process.exit(1);
}

const token = process.env.DISCORD_TOKEN.trim().replace(/^["']|["']$/g, "");

if (!token || token === "توكن" || token === "ضع_التوكن_هنا" || token.length < 50) {
  console.error("[config] DISCORD_TOKEN looks invalid or is still a placeholder. Put your real user token in .env");
  process.exit(1);
}

const allowedIds = (process.env.ALLOWED_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (allowedIds.length === 0) {
  console.warn(
    "[config] WARNING: ALLOWED_IDS is empty — no one can run commands. Set your Discord user ID."
  );
}

const width = Math.min(Math.max(parseInt(process.env.VIDEO_WIDTH, 10) || 1280, 480), 1920);
const height = Math.min(Math.max(parseInt(process.env.VIDEO_HEIGHT, 10) || 720, 270), 1080);
const fps = Math.min(Math.max(parseInt(process.env.FRAME_RATE, 10) || 30, 15), 60);
const bitrate = Math.min(Math.max(parseInt(process.env.VIDEO_BITRATE, 10) || 5000, 500), 10000);

module.exports = {
  token,
  prefix: (process.env.PREFIX || "!").trim().slice(0, 5) || "!",
  allowedIds,
  streamType: process.env.STREAM_TYPE === "camera" ? "camera" : "go-live",
  width,
  height,
  fps,
  bitrate,
};
