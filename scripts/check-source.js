import { readdirSync, statSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

const roots = ["index.js", "src", "scripts", "public", "tests", "playwright.config.js"];
const files = [];

const collect = (entry) => {
    const resolved = path.resolve(entry);
    if (statSync(resolved).isDirectory()) {
        for (const child of readdirSync(resolved)) collect(path.join(resolved, child));
    } else if (resolved.endsWith(".js") && !resolved.endsWith("check-source.js")) {
        files.push(resolved);
    }
};

for (const root of roots) collect(root);
for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
