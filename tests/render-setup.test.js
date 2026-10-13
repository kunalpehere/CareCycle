import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { renderOrigin } from "../src/config/renderPlatform.js";
import { parseRuntimeEnvironment } from "../src/config/runtime.js";
import { infrastructurePeer, setupProxyObservation, startRenderSetup } from "../src/services/renderSetupService.js";
import { isolatedTestEnvironment } from "./support/environment.js";

const metadata = { RENDER: "true", RENDER_SERVICE_TYPE: "web", RENDER_EXTERNAL_URL: "https://synthetic-carecycle.onrender.com", RENDER_EXTERNAL_HOSTNAME: "synthetic-carecycle.onrender.com" };

test("Render-assigned origin is validated without trusting request input or losing explicit custom origins", () => {
    assert.equal(renderOrigin(metadata), metadata.RENDER_EXTERNAL_URL);
    for (const patch of [{ RENDER: "false" }, { RENDER_SERVICE_TYPE: "worker" }, { RENDER_EXTERNAL_URL: "http://synthetic-carecycle.onrender.com" }, { RENDER_EXTERNAL_HOSTNAME: "other.onrender.com" }, { RENDER_EXTERNAL_URL: "https://user:password@synthetic-carecycle.onrender.com" }, { RENDER_EXTERNAL_URL: "https://synthetic-carecycle.onrender.com/path" }, { RENDER_EXTERNAL_URL: "https://synthetic-carecycle.onrender.com.evil.invalid" }]) assert.throws(() => renderOrigin({ ...metadata, ...patch }));
    const source = { ...isolatedTestEnvironment(), ...metadata, NODE_ENV: "production", MONGO_DB_NAME: "carecycle_demo_staging", MONGO_URI: "mongodb://synthetic:synthetic-password@db.example.invalid/?tls=true&replicaSet=rs", TRUST_PROXY: "127.0.0.1" };
    delete source.APP_URL;
    assert.equal(parseRuntimeEnvironment(source).appUrl, metadata.RENDER_EXTERNAL_URL);
    assert.equal(parseRuntimeEnvironment({ ...source, APP_URL: "https://custom.example.invalid" }).appUrl, "https://custom.example.invalid");
    assert.throws(() => parseRuntimeEnvironment({ ...source, TRUST_PROXY: "true" }));
    assert.throws(() => parseRuntimeEnvironment({ ...source, TRUST_PROXY: "1" }));
});

test("setup observes only the socket infrastructure address, never a forwarded client address", () => {
    for (const address of ["10.4.5.6", "172.18.2.3", "192.168.1.2", "127.0.0.1", "::ffff:10.4.5.6", "::1", "fd00::2"]) assert.ok(infrastructurePeer(address));
    for (const address of ["203.0.113.5", "8.8.8.8", "::ffff:203.0.113.5", "bogus", undefined]) assert.equal(infrastructurePeer(address), null);
});

test("setup distinguishes browser requests from probes and redacts public peers and arbitrary headers", () => {
    const request = { socket: { remoteAddress: "203.0.113.5" }, headers: { "x-forwarded-proto": "PRIVATE_HEADER_MARKER", "x-forwarded-for": "PRIVATE_CLIENT_MARKER" }, method: "GET", url: "/private-path?secret=PRIVATE_QUERY_MARKER" };
    const observation = setupProxyObservation(request);
    assert.deepEqual(observation, { event: "render.setup.proxy", peerClass: "public_or_unknown", httpsForwarded: false, forwardedProtocol: "other", method: "GET", probe: "other" });
    const text = JSON.stringify(observation);
    for (const value of ["203.0.113.5", "PRIVATE_HEADER_MARKER", "PRIVATE_CLIENT_MARKER", "PRIVATE_QUERY_MARKER", "private-path"]) assert.ok(!text.includes(value));
    assert.equal(setupProxyObservation({ ...request, method: "HEAD", url: "/health/live", socket: { remoteAddress: "127.0.0.1" }, headers: {} }).forwardedProtocol, "missing");
    assert.equal(setupProxyObservation({ ...request, headers: { "x-forwarded-proto": "https" } }).httpsForwarded, true);
});

test("Render entry command refuses missing provider metadata and wrong database confirmation without echoing secrets", () => {
    const source = { ...isolatedTestEnvironment(), ...metadata, NODE_ENV: "production", DEMO_MODE: "true", MONGO_DB_NAME: "carecycle_demo_staging", MONGO_URI: "PRIVATE_RENDER_URI_MARKER" };
    for (const [args, patch] of [[[], {}], [["--initialize", "wrong-name"], {}], [["--initialize", "carecycle_demo_staging"], { RENDER: "false" }]]) {
        const result = spawnSync(process.execPath, ["scripts/start-render.js", ...args], { env: { ...source, ...patch }, encoding: "utf8", timeout: 5000, windowsHide: true });
        assert.equal(result.status, 1); assert.match(result.stderr, /Render setup failed/); assert.ok(!result.stderr.includes(source.MONGO_URI));
    }
});

test("setup serves a distinct probe and refuses business/readiness routes without connecting MongoDB", async () => {
    const reservation = createServer(); await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    const output = [];
    const server = await startRenderSetup({ source: { ...metadata, NODE_ENV: "production", DEMO_MODE: "true", PORT: String(port), MONGO_URI: "PRIVATE_URI_MARKER", JWT_SECRET: "PRIVATE_JWT_MARKER" }, write: line => output.push(line) });
    try {
        const origin = `http://127.0.0.1:${port}`;
        const health = await fetch(origin + "/health/live", { headers: { "X-Forwarded-For": "203.0.113.123", "X-Forwarded-Proto": "https" } });
        assert.equal(health.status, 200); assert.equal((await health.json()).status, "setup"); assert.ok(!health.headers.has("set-cookie"));
        for (const route of ["/", "/demo", "/health/ready", "/admin/login"]) {
            const response = await fetch(origin + route); assert.equal(response.status, 503); assert.ok(!response.headers.has("set-cookie"));
        }
        const logs = output.join("\n");
        for (const secret of ["203.0.113.123", "PRIVATE_URI_MARKER", "PRIVATE_JWT_MARKER"]) assert.ok(!logs.includes(secret));
        assert.ok(output.some(line => JSON.parse(line).event === "render.setup.proxy"));
        assert.ok(!logs.includes("mongodb"));
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
