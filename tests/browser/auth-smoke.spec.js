import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.route("**/*", route => {
        const url = new URL(route.request().url());
        return url.origin === "http://127.0.0.1:4183" ? route.continue() : route.abort();
    });
});

test("participant sign-in renders and invalid input keeps the user on the form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Donor or NGO sign in" })).toBeVisible();
    await expect(page.locator('input[name="_csrf"]')).not.toHaveValue("");
    await page.getByRole("button", { name: "Sign in as participant" }).click();
    await expect(page.locator(".validation-summary")).toBeFocused();
    await expect(page.locator(".validation-summary")).toContainText("Email address");
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("guest protected navigation recovers through participant login", async ({ page }) => {
    await page.goto("/donor/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole("link", { name: "Create a donor or NGO account" }).click();
    await expect(page.getByRole("heading", { name: "Create your CareCycle account" })).toBeVisible();
    await page.getByRole("radio", { name: /NGO member/ }).check();
    await expect(page.getByRole("radio", { name: /NGO member/ })).toBeChecked();
});
