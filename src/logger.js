const chalk = require("chalk");

function format(tag, msg, color) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  return `${chalk.gray(`[${time}]`)} ${chalk[color](`[${tag}]`)} ${msg}`;
}

module.exports = {
  info: (msg) => console.log(format("info", msg, "cyan")),
  success: (msg) => console.log(format("ok", msg, "green")),
  warn: (msg) => console.log(format("warn", msg, "yellow")),
  error: (msg) => console.error(format("error", msg, "red")),
  stream: (msg) => console.log(format("stream", msg, "magenta")),
};
