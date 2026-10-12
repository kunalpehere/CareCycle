import { createApp } from "../../src/app.js";

// Only renders the guest login page. No database connection or account mutation.
const server = createApp().listen(0, "127.0.0.1");
try {
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/login`, { headers: { "X-Forwarded-Proto": "https" } });
    await response.text();
    const cookie = response.headers.get("set-cookie") || "";
    console.log(JSON.stringify({ status: response.status, cookieIssued: Boolean(cookie), secureCookie: /;\s*Secure(?:;|$)/i.test(cookie) }));
} finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
