const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { Client } = require("discord.js-selfbot-v13");
const { Streamer, prepareStream, playStream } = require("@dank074/discord-video-stream");
const ffmpeg = require("fluent-ffmpeg");
const youtubedl = require("youtube-dl-exec");
const log = require("./logger");

const MEDIA_ROOT = path.resolve(process.cwd(), "media");

try {
  let hasSystemFfmpeg = false;
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    hasSystemFfmpeg = true;
  } catch {}

  if (!hasSystemFfmpeg) {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
      process.env.FFMPEG_PATH = ffmpegStatic;
    }
  }
} catch {}

function isDirectMedia(url) {
  return /\.(mp4|mkv|webm|mov|m4v|m3u8)(\?.*)?$/i.test(url);
}

function isSafeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Only allow local files under ./media (prevents path traversal). */
function resolveSafeLocalPath(input) {
  if (!fs.existsSync(MEDIA_ROOT)) {
    fs.mkdirSync(MEDIA_ROOT, { recursive: true });
  }
  const resolved = path.resolve(MEDIA_ROOT, path.basename(input));
  const realMedia = path.resolve(MEDIA_ROOT);
  if (!resolved.startsWith(realMedia + path.sep) && resolved !== realMedia) {
    throw new Error("الملف المحلي مسموح فقط داخل مجلد media/");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`الملف غير موجود في media/: ${path.basename(input)}`);
  }
  return resolved;
}

class VideoPlayer {
  constructor(config) {
    this.config = config;
    this.client = new Client({ checkUpdate: false });
    this.streamer = new Streamer(this.client);

    this.streaming = false;
    this.abortCtrl = null;
    this.cleanupProc = null;
    this._playLock = false;

    this.guildId = null;
    this.channelId = null;
  }

  async join(guildId, channelId) {
    if (this.channelId === channelId) return;

    if (this.channelId) {
      await this.stop();
      try {
        this.streamer.leaveVoice();
      } catch {}
    }

    log.info(`joining voice channel ${channelId}`);
    await this.streamer.joinVoice(guildId, channelId);
    this.guildId = guildId;
    this.channelId = channelId;
  }

  async play(videoSource, streamType = this.config.streamType) {
    if (this._playLock || this.streaming) {
      throw new Error("في بث شغال حالياً — استخدم !stop أولاً");
    }
    this._playLock = true;

    let input = String(videoSource || "").trim();
    let cleanup = () => {};

    try {
      if (!input) {
        throw new Error("الرابط أو المسار فارغ");
      }

      // Local file: only under ./media
      if (!input.startsWith("http://") && !input.startsWith("https://")) {
        input = resolveSafeLocalPath(input);
      } else {
        if (!isSafeHttpUrl(input)) {
          throw new Error("الرابط يجب أن يكون http أو https فقط");
        }
        if (!isDirectMedia(input)) {
          log.info(`resolving stream via yt-dlp: ${input}`);
          const ytdlOpts = {
            format:
              "bestvideo[vcodec^=avc1][height<=720]+bestaudio[acodec^=mp4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best",
            output: "-",
            extractorArgs: "youtube:player_client=android",
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
          };

          const cookiesPath = path.resolve(process.cwd(), "cookies.txt");
          if (fs.existsSync(cookiesPath)) {
            ytdlOpts.cookies = cookiesPath;
          }

          const proc = youtubedl.exec(input, ytdlOpts, {
            stdio: ["ignore", "pipe", "pipe"],
          });

          proc.catch((err) => {
            if (!this.abortCtrl?.signal?.aborted) {
              log.error(`yt-dlp error: ${err.message}`);
            }
          });

          if (proc.stderr) {
            proc.stderr.on("data", (chunk) => {
              const s = chunk.toString().trim();
              if (s && !this.abortCtrl?.signal?.aborted) {
                log.info(`yt-dlp: ${s.slice(0, 200)}`);
              }
            });
          }

          input = proc.stdout;
          cleanup = () => {
            try {
              if (proc && !proc.killed) proc.kill("SIGKILL");
            } catch {}
          };
        }
      }

      this.streaming = true;
      this.abortCtrl = new AbortController();
      this.cleanupProc = cleanup;

      log.stream(`starting stream (${streamType}): ${videoSource}`);

      const { output, command, promise: ffmpegPromise } = prepareStream(
        input,
        {
          width: this.config.width,
          height: this.config.height,
          frameRate: this.config.fps,
          bitrateVideo: this.config.bitrate,
          bitrateVideoMax: Math.round(this.config.bitrate * 1.4),
          bitrateAudio: 128,
          includeAudio: true,
          hardwareAcceleratedDecoding: false,
          minimizeLatency: false,
          noTranscoding: false,
          videoCodec: "H264",
        },
        this.abortCtrl.signal
      );

      command.on("error", (err) => {
        if (!this.abortCtrl?.signal?.aborted) {
          log.error(`ffmpeg: ${err.message}`);
        }
      });

      await playStream(
        output,
        this.streamer,
        {
          type: streamType,
          width: this.config.width,
          height: this.config.height,
          frameRate: this.config.fps,
        },
        this.abortCtrl.signal
      );

      await ffmpegPromise.catch(() => {});
      log.info("playback finished");
    } catch (err) {
      if (this.streaming || this._playLock) {
        throw err;
      }
    } finally {
      this.streaming = false;
      this._playLock = false;
      if (this.cleanupProc) {
        try {
          this.cleanupProc();
        } catch {}
        this.cleanupProc = null;
      }
      this.abortCtrl = null;
    }
  }

  async stop() {
    if (!this.streaming && !this.cleanupProc && !this._playLock) return;

    this.streaming = false;
    this._playLock = false;

    if (this.cleanupProc) {
      try {
        this.cleanupProc();
      } catch {}
      this.cleanupProc = null;
    }

    if (this.abortCtrl) {
      try {
        this.abortCtrl.abort();
      } catch {}
      this.abortCtrl = null;
    }

    try {
      this.streamer.stopStream();
    } catch {}

    await new Promise((r) => setTimeout(r, 300));
    log.info("stream stopped");
  }

  async leave() {
    await this.stop();
    try {
      this.streamer.leaveVoice();
    } catch {}
    this.guildId = null;
    this.channelId = null;
  }

  async destroy() {
    await this.leave();
    try {
      this.client.destroy();
    } catch {}
  }
}

module.exports = { VideoPlayer };
