import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("CSP permits intended assets and rejects injected scripts and foreign form actions", async ({ page }) => {
    const fontPaths = process.platform === "win32" ? ["C:/Windows/Fonts/arial.ttf"] : ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"];
    let font;
    for (const file of fontPaths) { try { font = await readFile(file); break; } catch {} }
    expect(font, "A local test font is available").toBeTruthy();
    // Route-controlled fixtures verify the existing CDN allowlist without external delivery.
    await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "@font-face{font-family:Fixture21;src:url(https://fonts.gstatic.com/synthetic21.ttf) format('truetype')}" }));
    await page.route("https://fonts.gstatic.com/**", route => route.fulfill({ contentType: "font/ttf", body: font }));
    await page.addInitScript(() => { window.policyViolations = []; document.addEventListener("securitypolicyviolation", event => window.policyViolations.push(event.effectiveDirective)); });
    const response = await page.goto("/login");
    const policy = response.headers()["content-security-policy"];
    expect(policy).toContain("script-src 'self'"); expect(policy).not.toContain("unsafe-inline"); expect(policy).not.toContain("unsafe-eval");
    expect(await page.evaluate(() => document.fonts.load("16px Fixture21").then(fonts => fonts.length))).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Sign in as participant" }).click();
    await expect(page.locator(".validation-summary")).toBeFocused();
    expect(await page.evaluate(() => window.policyViolations)).toEqual([]);
    await page.evaluate(() => {
        const script = document.createElement("script"); script.textContent = "window.injectedSecurityProbe=true"; document.head.append(script);
        const external = document.createElement("script"); external.src = "https://blocked.example.invalid/script.js"; document.head.append(external);
        const frame = document.createElement("iframe"); frame.name = "security-policy-target"; document.body.append(frame);
        const form = document.createElement("form"); form.target = frame.name; form.action = "https://blocked.example.invalid/submit"; form.method = "POST"; document.body.append(form); form.submit();
    });
    await expect.poll(() => page.evaluate(() => window.policyViolations.filter(value => value.startsWith("script-src")).length)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => page.evaluate(() => window.policyViolations.includes("form-action"))).toBe(true);
    expect(await page.evaluate(() => window.injectedSecurityProbe)).toBeUndefined();
    expect(await page.evaluate(() => location.href)).toMatch(/\/login$/);
    await expect(page.getByRole("heading", { name: "Donor or NGO sign in" })).toBeVisible();
});
