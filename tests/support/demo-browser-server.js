import { isolatedTestEnvironment } from "./environment.js";
import { startDemoFixture } from "./demo-fixture.js";

Object.assign(process.env, isolatedTestEnvironment());
const fixture = await startDemoFixture({ port: 4184 });
let stopping = false;
const stop = async () => { if (stopping) return; stopping = true; await fixture.close(); };
process.once("SIGTERM", () => stop().catch(() => { process.exitCode = 1; }));
process.once("SIGINT", () => stop().catch(() => { process.exitCode = 1; }));
