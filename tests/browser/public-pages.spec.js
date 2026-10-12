import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4183" ? route.continue() : route.abort());
});

test("guests understand the workflow and enter the correct registration role", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Donate medical equipment to verified NGOs." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Keep a donation receipt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/day-14-home-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("link", { name: "Register as an NGO", exact: true }).click();
    await expect(page.getByRole("radio", { name: /NGO member/ })).toBeChecked();
    await page.getByRole("link", { name: "How CareCycle works" }).click();
    await page.getByRole("link", { name: "Register to donate equipment" }).click();
    await expect(page.getByRole("radio", { name: /Equipment donor/ })).toBeChecked();
});

test("guest navigation and contact failure preserve useful recovery", async ({ page }, testInfo) => {
    await page.goto("/about");
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (await menu.isVisible()) {
        await menu.focus(); await page.keyboard.press("Enter");
        await expect(menu).toHaveAttribute("aria-expanded", "true");
    }
    await page.getByRole("link", { name: "Contact", exact: true }).click();
    await page.getByLabel("Full name").fill("Synthetic Guest");
    await page.getByLabel("Email address").fill("guest@example.invalid");
    await page.getByLabel("How can we help?").fill("Synthetic question about CareCycle");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status")).toContainText("not been sent or saved");
    await expect(page.getByLabel("How can we help?")).toHaveValue("Synthetic question about CareCycle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/day-14-contact-${testInfo.project.name}.png`, fullPage: true });
    for (const url of ["/home", "/about", "/login", "/register"]) {
        await page.goto(url);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const effects = await page.evaluate(() => [...document.querySelectorAll('body *')].some(element => {
            const style = getComputedStyle(element);
            return style.backgroundImage.includes('gradient') || style.animationName !== 'none';
        }));
        expect(effects).toBe(false);
        await page.screenshot({ path: `artifacts/day-14-${url.slice(1)}-${testInfo.project.name}.png`, fullPage: true });
    }
});
