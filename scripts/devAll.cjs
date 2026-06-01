const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const clientDir = path.join(rootDir, "CoursePlannerr");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const children = [];

function start(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[dev] ${name} stopped by ${signal}`);
    } else if (code && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
    }
    stopAll(child);
  });

  return child;
}

function stopAll(origin) {
  children.forEach((child) => {
    if (child !== origin && !child.killed) {
      child.kill();
    }
  });
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

console.log("[dev] Starting API server on http://localhost:3001");
start("api", "node", ["server.cjs"], rootDir);

console.log("[dev] Starting website on http://localhost:5173");
start("client", npmCommand, ["run", "dev:client"], clientDir);
