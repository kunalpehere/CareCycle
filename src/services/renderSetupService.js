import http from "node:http";
import { BlockList } from "node:net";
import { renderOrigin } from "../config/renderPlatform.js";

const infrastructure = new BlockList();
for (const [address, prefix] of [["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16], ["127.0.0.0", 8]]) infrastructure.addSubnet(address, prefix, "ipv4");
infrastructure.addAddress("::1", "ipv6");
infrastructure.addSubnet("fc00::", 7, "ipv6");
export const infrastructurePeer = value => {
    const address = String(value || "").replace(/^::ffff:/, "");
    try { return infrastructure.check(address, address.includes(":") ? "ipv6" : "ipv4") ? address : null; } catch { return null; }
};

// This setup server has no application routes, DB connection, cookies or worker.
// Forwarded client addresses, credentials, query strings and headers are not logged.
export const startRenderSetup = async ({ source = process.env, write = line => console.log(line) } = {}) => {
    const origin = renderOrigin(source);
    if (source.NODE_ENV !== "production" || source.DEMO_MODE !== "true") throw new Error("Render setup is restricted to the production synthetic demo.");
    const portText = source.PORT || "10000";
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || port < 1 || port > 65535) throw new Error("Invalid setup port.");
    const seen = new Set();
    const server = http.createServer((req, res) => {
        const peer = infrastructurePeer(req.socket.remoteAddress);
        const httpsForwarded = req.headers["x-forwarded-proto"] === "https";
        if (peer && !seen.has(`${peer}:${httpsForwarded}`) && seen.size < 32) {
            seen.add(`${peer}:${httpsForwarded}`);
            write(JSON.stringify({ event: "render.setup.proxy", address: peer, httpsForwarded }));
        }
        res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Type", "application/json");
        const route = req.url?.split("?")[0];
        if (route === "/health/live" && ["GET", "HEAD"].includes(req.method)) { res.statusCode = 200; res.end(JSON.stringify({ status: "setup" })); }
        else { res.statusCode = 503; res.end(JSON.stringify({ status: "setup_pending", message: "CareCycle deployment setup is in progress. The donation demo is not open yet." })); }
    });
    server.requestTimeout = 10000; server.headersTimeout = 10000;
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "0.0.0.0", resolve); });
    write(JSON.stringify({ event: "render.setup.started", origin }));
    return server;
};
