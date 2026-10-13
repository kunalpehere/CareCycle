import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

test("administrators can inspect private diagnostics and browser errors show a traceable reference", async ({ page }, info) => {
    const data = JSON.parse(await readFile("artifacts/day-20-fixtures.json", "utf8"))[info.project.name];
    await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": info.project.name === "desktop" ? "192.0.2.231" : "192.0.2.232" });
    await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4183" ? route.continue() : route.abort());
    await page.goto("/admin/login"); await page.getByLabel("Administration email", { exact: true }).fill(data.adminEmail); await page.getByLabel("Password", { exact: true }).fill("Review-fixture-20!");
    await page.getByRole("button", { name: "Enter CareCycle Administration" }).click();
    await page.getByRole("link", { name: "Operational diagnostics", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Operational diagnostics", exact: true })).toBeVisible();
    await expect(page.getByText("disabled", { exact: true })).toBeVisible();
    await page.addScriptTag({ url: "/__test-axe.js" });
    expect(await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } })).violations)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await mkdir("artifacts/day-23", { recursive: true });
    await page.screenshot({ path: `artifacts/day-23/diagnostics-${info.project.name}.png`, fullPage: true });
    const response = await page.goto("/synthetic-missing-day23?token=PRIVATE_DAY23_TOKEN");
    const reference = response.headers()["x-request-id"];
    await expect(page.getByText(reference, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact CareCycle", exact: true })).toBeVisible();
    await page.addScriptTag({ url: "/__test-axe.js" });
    expect(await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } })).violations)).toEqual([]);
});
