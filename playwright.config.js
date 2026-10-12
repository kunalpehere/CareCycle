import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/browser",
    testMatch: "**/*.spec.js",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 30000,
    forbidOnly: Boolean(process.env.CI),
    outputDir: "artifacts/browser-results",
    reporter: [["list"], ["html", { outputFolder: "artifacts/browser-report", open: "never" }], ["junit", { outputFile: "artifacts/browser-results.xml" }]],
    use: {
        baseURL: "http://127.0.0.1:4183",
        browserName: "chromium",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        video: "off"
    },
    projects: [
        { name: "desktop", use: { viewport: { width: 1366, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.1" } } },
        { name: "mobile", use: { viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.2" } } }
    ],
    webServer: {
        command: "node tests/support/browser-server.js",
        url: "http://127.0.0.1:4183/login",
        reuseExistingServer: false,
        timeout: 180000,
        stdout: "pipe",
        stderr: "pipe",
        gracefulShutdown: { signal: "SIGTERM", timeout: 15000 }
    }
});
