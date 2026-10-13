import { spawn } from "node:child_process";
import { isolatedTestEnvironment } from "../tests/support/environment.js";

const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.demo.config.js"], { env: isolatedTestEnvironment(), stdio: "inherit" });
child.once("error", () => { process.exitCode = 1; });
child.once("close", code => { process.exitCode = code ?? 1; });
