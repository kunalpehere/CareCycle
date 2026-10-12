import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedTestEnvironment } from "../tests/support/environment.js";

export const runSuite = async (suite, { additionalFiles = [], logName = suite } = {}) => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    if (!["unit", "integration", "browser"].includes(suite)) throw new Error("Choose unit, integration, or browser.");
    let args;
    if (suite === "browser") {
        args = [path.join(root, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.config.js"];
    } else {
        const directory = suite === "unit" ? "tests" : "tests/integration";
        const files = (await readdir(path.join(root, directory))).filter(name => name.endsWith(".test.js"))
            .sort().map(name => path.join(root, directory, name));
        if (!files.length) throw new Error(`No ${suite} tests found.`);
        // Each integration file owns a MongoDB process/replica set. Run them
        // sequentially to avoid startup timeouts and memory pressure as coverage grows.
        args = ["--test", ...(suite === "integration" ? ["--test-concurrency=1"] : []), "--test-reporter=tap", ...files, ...additionalFiles];
    }
    const logs = path.join(root, "artifacts/logs");
    await mkdir(logs, { recursive: true });
    const logPath = path.join(logs, `${logName}.log`);
    const log = createWriteStream(logPath);
    log.write(`Suite: ${suite}\nNode: ${process.version}\n`);
    const child = spawn(process.execPath, args, { cwd: root, env: isolatedTestEnvironment(), stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => { process.stdout.write(data); log.write(data); });
    child.stderr.on("data", data => { process.stderr.write(data); log.write(data); });
    const exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve(signal ? 1 : code ?? 1));
    }).finally(() => new Promise(resolve => log.end(resolve)));
    console.log(`Diagnostics: ${path.relative(root, logPath)}`);
    return exitCode;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { process.exitCode = await runSuite(process.argv[2] || "unit"); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
