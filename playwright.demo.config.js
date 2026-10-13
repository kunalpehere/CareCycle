import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/demo-browser", workers: 1, retries: 0, timeout: 30000,
    outputDir: "artifacts/demo-browser-results", reporter: [["list"]],
    use: { baseURL: "http://127.0.0.1:4184", browserName: "chromium", screenshot: "only-on-failure", trace: "retain-on-failure" },
    projects: [
        { name: "desktop", use: { viewport: { width: 1366, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.71" } } },
        { name: "mobile", use: { viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.72" } } }
    ],
    webServer: { command: "node tests/support/demo-browser-server.js", url: "http://127.0.0.1:4184/demo", reuseExistingServer: false, timeout: 180000, gracefulShutdown: { signal: "SIGTERM", timeout: 15000 } }
});
