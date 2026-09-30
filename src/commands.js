const log = require("./logger");

const COOLDOWN_MS = 2500;
const lastCommandAt = new Map();

function registerCommands(client, player, config) {
  const { prefix, allowedIds } = config;

  client.on("messageCreate", async (msg) => {
    if (!msg.content || !msg.content.startsWith(prefix)) return;
    if (msg.author?.bot) return;

    if (allowedIds.length > 0 && !allowedIds.includes(msg.author.id)) return;

    const now = Date.now();
    const last = lastCommandAt.get(msg.author.id) || 0;
    if (now - last < COOLDOWN_MS) return;
    lastCommandAt.set(msg.author.id, now);

    const args = msg.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    try {
      const playCmds = ["play", "p", "شغل", "بث"];
      const liveCmds = ["live", "لايف", "شاشة"];
      const camCmds = ["cam", "camera", "كام", "كاميرا"];
      const stopCmds = ["stop", "pause", "وقف", "ايقاف", "إيقاف", "توقف"];
      const leaveCmds = ["leave", "dc", "اخرج", "غادر", "طلع"];
      const helpCmds = ["help", "مساعدة", "اوامر", "أوامر"];

      if (playCmds.includes(cmd) || liveCmds.includes(cmd) || camCmds.includes(cmd)) {
        let url = args.join(" ").trim().replace(/^<|>$/g, "");

        if (!url) {
          return msg.reply(`اكتب الرابط: \`${prefix}${cmd} <رابط>\``);
        }

        if (url.length > 2000) {
          return msg.reply("الرابط طويل جداً.");
        }

        const voice = msg.member?.voice?.channel;
        if (!voice) {
          return msg.reply("أدخل روم صوتي عشان تقدر تستخدم الأمر.");
        }

        const mode = camCmds.includes(cmd)
          ? "camera"
          : liveCmds.includes(cmd)
            ? "go-live"
            : player.config.streamType;

        const status = await msg.reply(
          `جاري التشغيل [${mode === "camera" ? "كاميرا" : "شاشة"}]...`
        );

        try {
          await player.join(voice.guild.id, voice.id);
          await new Promise((r) => setTimeout(r, 500));

          player.play(url, mode).catch((err) => {
            log.error(`playback error: ${err.message}`);
            msg.channel.send(`خطأ أثناء التشغيل: ${err.message}`).catch(() => {});
            status.edit(`فشل التشغيل: ${err.message}`).catch(() => {});
          });

          await status.edit(
            `تم بدء البث [${mode === "camera" ? "كاميرا" : "شاشة"}]`
          ).catch(() => {});
        } catch (err) {
          log.error(`join/play setup error: ${err.message}`);
          await status.edit(`خطأ: ${err.message}`).catch(() => {});
        }
        return;
      }

      if (stopCmds.includes(cmd)) {
        if (!player.streaming && !player._playLock) {
          return msg.reply("مافي فيديو شغال حالياً.");
        }
        await player.stop();
        return msg.reply("تم الإيقاف.");
      }

      if (leaveCmds.includes(cmd)) {
        if (!player.channelId) {
          return msg.reply("أنا مو داخل روم صوتي أصلاً.");
        }
        await player.leave();
        return msg.reply("تم الخروج من الروم.");
      }

      if (helpCmds.includes(cmd)) {
        return msg.reply(
          [
            `**الأوامر** (البادئة: \`${prefix}\`)`,
            `\`${prefix}cam <رابط>\` أو \`${prefix}كام\` — بث كاميرا (صوت مباشر)`,
            `\`${prefix}play <رابط>\` أو \`${prefix}شغل\` — بث شاشة (Go-Live)`,
            `\`${prefix}stop\` أو \`${prefix}وقف\` — إيقاف البث`,
            `\`${prefix}leave\` أو \`${prefix}اخرج\` — مغادرة الروم الصوتي`,
            "",
            "الملفات المحلية ضعها داخل مجلد `media/` فقط.",
          ].join("\n")
        );
      }
    } catch (err) {
      log.error(`command error: ${err.message}`);
      msg.reply(`خطأ: ${err.message}`).catch(() => {});
    }
  });

  log.success(`commands loaded (prefix: "${prefix}")`);
}

module.exports = { registerCommands };
