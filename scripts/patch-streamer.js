
const fs = require("fs");
const path = require("path");

function patchFile(filePath, search, replace) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  if (content.includes(replace)) return;
  if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function applyPatches() {
  const root = path.join(__dirname, "..");

  // 1. node-datachannel exports
  const datachannelPkg = path.join(
    root,
    "node_modules",
    "@lng2004",
    "node-datachannel",
    "package.json"
  );
  if (fs.existsSync(datachannelPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(datachannelPkg, "utf8"));
      if (pkg.exports && !pkg.exports["./*"]) {
        pkg.exports["./*"] = "./*";
        fs.writeFileSync(datachannelPkg, JSON.stringify(pkg, null, 2), "utf8");
      }
    } catch {}
  }

  // 2. Streamer self_deaf: false
  const streamerJs = path.join(
    root,
    "node_modules",
    "@dank074",
    "discord-video-stream",
    "dist",
    "client",
    "Streamer.js"
  );
  patchFile(
    streamerJs,
    `            self_mute: false,
            self_deaf: true,
            self_video: video_enabled,`,
    `            self_mute: false,
            self_deaf: false,
            self_video: video_enabled,`
  );

  // 3. WebRTC SDP recvonly negotiation
  const baseMediaConnJs = path.join(
    root,
    "node_modules",
    "@dank074",
    "discord-video-stream",
    "dist",
    "client",
    "voice",
    "BaseMediaConnection.js"
  );
  if (fs.existsSync(baseMediaConnJs)) {
    let content = fs.readFileSync(baseMediaConnJs, "utf8");
    if (content.includes("a=inactive")) {
      content = content.replaceAll("a=inactive", "a=recvonly");
      fs.writeFileSync(baseMediaConnJs, content, "utf8");
    }
  }

  // 4. Remove invalid audio playout delay
  const webRtcWrapperJs = path.join(
    root,
    "node_modules",
    "@dank074",
    "discord-video-stream",
    "dist",
    "client",
    "voice",
    "WebRtcWrapper.js"
  );
  if (fs.existsSync(webRtcWrapperJs)) {
    let content = fs.readFileSync(webRtcWrapperJs, "utf8");
    if (content.includes("rtpConfigAudio.playoutDelayId = 5;")) {
      content = content.replace(
        /rtpConfigAudio\.playoutDelayId = 5;\s*rtpConfigAudio\.playoutDelayMin = 0;\s*rtpConfigAudio\.playoutDelayMax = 1;\s*/,
        ""
      );
      fs.writeFileSync(webRtcWrapperJs, content, "utf8");
    }
  }

  // 5. Disable azmq filter for standard ffmpeg builds
  const newApiJs = path.join(
    root,
    "node_modules",
    "@dank074",
    "discord-video-stream",
    "dist",
    "media",
    "newApi.js"
  );
  if (fs.existsSync(newApiJs)) {
    let content = fs.readFileSync(newApiJs, "utf8");
    if (content.includes("command.audioFilters(`azmq=b=")) {
      content = content.replace(
        /command\.audioFilters\(`azmq=b=\${zmqEndpoint\.replaceAll\(":", "\\\\\\\\:"\)}`\);/,
        "// azmq filter disabled"
      );
      fs.writeFileSync(newApiJs, content, "utf8");
    }
  }
}

applyPatches();

module.exports = { applyPatches };
