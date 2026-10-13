import { test, expect } from "@playwright/test";

test("synthetic entry, role switching, restrictions and responsive labels", async ({ page }, testInfo) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4184" ? route.continue() : route.abort());
    await page.goto("/login");
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Try the equipment donation workflow");
    await expect(page.getByRole("complementary", { name: "Synthetic demo" })).toContainText("Do not enter personal information");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/day-25-${testInfo.project.name}-entry.png`, fullPage: true });
    await page.getByRole("button", { name: "Try as NGO", exact: true }).click();
    await expect(page).toHaveURL(/\/ngo\/dashboard$/);
    await page.goto("/ngo/equipment");
    await expect(page.locator("main")).toContainText("wheelchair");
    await expect(page.locator("main")).toContainText("Demo City");
    await page.getByRole("link", { name: "Try or switch roles", exact: true }).click();
    await page.getByRole("button", { name: "Try as donor", exact: true }).click();
    await expect(page).toHaveURL(/\/donor\/dashboard$/);
    await expect(page.locator("main")).toContainText("wheelchair");
    await expect(page.getByRole("complementary", { name: "Synthetic demo" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/day-25-${testInfo.project.name}-donor.png`, fullPage: true });
    const response = await page.goto("/admin/login"); expect(response.status()).toBe(403);
    await expect(page.locator("body")).toContainText("unavailable in the synthetic demo");
});
