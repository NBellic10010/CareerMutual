import { spawn } from "node:child_process";
import process from "node:process";

const serviceRole = process.env.SERVICE_ROLE;

function runPnpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) reject(new Error(`pnpm terminated with ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

async function main() {
  if (serviceRole === "web") {
    const migrationExitCode = await runPnpm(["db:migrate"]);
    if (migrationExitCode !== 0) process.exit(migrationExitCode);
    const webExitCode = await runPnpm(["--filter", "@onlyboth/web", "start"]);
    process.exit(webExitCode);
  }
  if (serviceRole === "worker") {
    const workerExitCode = await runPnpm(["--filter", "@onlyboth/worker", "start"]);
    process.exit(workerExitCode);
  }
  throw new Error("SERVICE_ROLE must be either 'web' or 'worker'.");
}

await main();
