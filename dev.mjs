import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["--experimental-sqlite", "server.mjs"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], { stdio: "inherit" }),
];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error("Could not start the Chase Desk development process:", error.message);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) shutdown(code ?? 1);
  });
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
