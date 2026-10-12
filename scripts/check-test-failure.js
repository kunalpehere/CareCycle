import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runSuite } from "./run-tests.js";

// Inject only into this subprocess's explicit file list, never the passing suite.
await mkdir(path.resolve("artifacts"), { recursive: true });
const probe = await mkdtemp(path.resolve("artifacts/failure-probe-"));
try {
    const file = path.join(probe, "deliberate-failure.test.mjs");
    await writeFile(file, 'import test from "node:test"; import assert from "node:assert/strict";\ntest("DAY3_DELIBERATE_FAILURE", () => assert.fail("DAY3_DIAGNOSTIC: expected failure probe"));\n');
    const code = await runSuite("unit", { additionalFiles: [file], logName: "failure-probe" });
    assert.notEqual(code, 0, "The underlying test command must reject a failing test.");
    const log = await readFile("artifacts/logs/failure-probe.log", "utf8");
    assert.match(log, /not ok.*DAY3_DELIBERATE_FAILURE/);
    assert.match(log, /DAY3_DIAGNOSTIC: expected failure probe/);
    console.log(`Failure propagation verified: test subprocess exited ${code}; diagnostic saved. Probe removed.`);
} finally {
    await rm(probe, { recursive: true, force: true });
}
