import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
    const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
    const parent = path.join(root, ".local-data");
    await mkdir(parent, { recursive: true });
    if (!(await realpath(parent)).startsWith(`${root}${path.sep}`)) throw new Error("unsafe-path");
    const directory = path.join(parent, "carecycle-dev-replica");
    await mkdir(directory); // Deliberately refuses any existing data directory.
    await writeFile(path.join(directory, "carecycle-development-only.json"), JSON.stringify({ preparedEmpty: true, initialized: false }), { flag: "wx" });
    console.log("Fresh development data directory prepared at .local-data/carecycle-dev-replica. Follow the documented mongod command.");
} catch (error) {
    console.error(error.code === "EEXIST" ? "Development data directory already exists. It was not erased or reused by this command; follow the documented restart instructions for an initialized set." : "Unable to prepare a fresh directory inside this project. Check permissions and the documented development path.");
    process.exitCode = 1;
}
