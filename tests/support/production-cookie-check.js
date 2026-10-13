import { createApp } from "../../src/app.js";
import session from "express-session";
// Cookie/proxy probe only; this explicit callback stub is never a runtime default.
class ProbeStore extends session.Store {
    get(sid, callback) { callback(null, null); }
    set(sid, value, callback) { callback(null); }
}

// Only renders the guest login page. No database connection or account mutation.
const server = createApp({ sessionStore: new ProbeStore() }).listen(0, "127.0.0.1");
try {
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/login`, { headers: { "X-Forwarded-Proto": "https" } });
    await response.text();
    const cookie = response.headers.get("set-cookie") || "";
    console.log(JSON.stringify({ status: response.status, cookieIssued: Boolean(cookie), secureCookie: /;\s*Secure(?:;|$)/i.test(cookie), hostCookie: cookie.startsWith("__Host-carecycle.sid="), httpOnly: /;\s*HttpOnly/i.test(cookie), sameSiteLax: /SameSite=Lax/i.test(cookie), rootPath: /Path=\//.test(cookie), domainAbsent: !/Domain=/i.test(cookie), hsts: response.headers.get("strict-transport-security") }));
} finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
