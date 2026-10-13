import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
const axeSource = await readFile(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");

test("email confirmation, new-action gate, recovery and expired authentication", async ({ page, browser }, info) => {
    test.setTimeout(90000);
    const fixture = JSON.parse(await readFile("artifacts/day-19-fixtures.json", "utf8"))[info.project.name];
    await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": info.project.name === "desktop" ? "192.0.2.191" : "192.0.2.192" });
    const audit = async name => {
        await page.addScriptTag({ content: axeSource });
        const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } })).violations);
        expect(violations, name).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await mkdir("artifacts/day-19", { recursive: true });
        await page.screenshot({ path: `artifacts/day-19/${name}-${info.project.name}.png`, fullPage: true });
    };
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill("Recovery-fixture-19!");
    await page.getByRole("button", { name: "Sign in as participant" }).click();
    await page.goto("/donate"); await expect(page).toHaveURL(/\/account\/email$/);
    await audit("email-status");
    await page.goto(fixture.verification); await audit("verification-confirm");
    await page.getByRole("button", { name: "Verify email address" }).click();
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await page.goto("/donate"); await expect(page).toHaveURL(/\/donate$/);
    const oldCookies = await page.context().cookies();
    await page.goto("/forgot-password"); await audit("forgot-password");
    await page.getByLabel("Account email").fill("absent-browser@example.invalid");
    await page.getByRole("button", { name: "Request reset email" }).click();
    await expect(page.getByRole("status")).toContainText("If an eligible account exists");
    await page.goto(fixture.reset); await audit("reset-password");
    await page.getByLabel("New password", { exact: true }).fill("Updated-fixture-19!");
    await page.getByLabel("Confirm new password").fill("Updated-fixture-19!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?message=/);
    const oldContext = await browser.newContext({ baseURL: "http://127.0.0.1:4183" });
    try {
        await oldContext.addCookies(oldCookies); const other = await oldContext.newPage();
        await other.goto("/donor/dashboard"); await expect(other).toHaveURL(/\/login/);
    } finally { await oldContext.close(); }
    await page.goto(fixture.reset); await expect(page.getByRole("heading", { name: "Link unavailable" })).toBeVisible(); await audit("used-link");
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill("Updated-fixture-19!");
    await page.getByRole("button", { name: "Sign in as participant" }).click();
    await expect(page).toHaveURL(/\/donor\/dashboard$/);
});
