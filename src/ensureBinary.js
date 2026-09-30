const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const log = require("./logger");

const binDir = path.join(__dirname, "..", "node_modules", "youtube-dl-exec", "bin");
const binPath = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} while downloading binary`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            try {
              fs.chmodSync(dest, 0o755);
            } catch {}
            resolve();
          });
        });
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function ensureBinary() {
  if (process.platform === "linux") {
    let hasPython = false;
    try {
      execSync("python3 --version", { stdio: "ignore" });
      hasPython = true;
    } catch {}

    if (!hasPython) {
      log.warn("python3 not found, checking standalone binary...");
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }

      let needsDownload = true;
      if (fs.existsSync(binPath)) {
        try {
          const buf = Buffer.alloc(4);
          const fd = fs.openSync(binPath, "r");
          fs.readSync(fd, buf, 0, 4, 0);
          fs.closeSync(fd);
          if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
            needsDownload = false;
          }
        } catch {}
      }

      if (needsDownload) {
        log.info("downloading standalone yt-dlp binary with embedded Python...");
        const url =
          process.arch === "arm64"
            ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64"
            : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
        await downloadFile(url, binPath);
        log.success("standalone yt-dlp binary installed successfully!");
      }
    }
  }
}

module.exports = { ensureBinary };
