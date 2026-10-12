import { test, expect } from "@playwright/test";

test("participants receive private lifecycle updates, mark read and save optional email preferences", async ({ page, browser }, testInfo) => {
    const project = testInfo.project.name;
    const context = await browser.newContext({ viewport: page.viewportSize(), baseURL: "http://127.0.0.1:4183" });
    const donorPage = await context.newPage();
    const login = async (target, role) => {
        await target.context().setExtraHTTPHeaders({ "X-Forwarded-For": project === "desktop" ? "192.0.2.131" : "192.0.2.132" });
        await target.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4183" ? route.continue() : route.abort());
        await target.goto("/login");
        await target.getByLabel("Email address", { exact: true }).fill(`${role}-day13-${project}@example.invalid`);
        await target.getByLabel("Password", { exact: true }).fill("Matching-fixture-42!");
        await target.getByRole("button", { name: "Sign in as participant" }).click();
    };
    try {
        await login(donorPage, "donor"); await login(page, "ngo");
        await donorPage.goto("/donor/requests");
        await donorPage.getByRole("button", { name: "Accept request", exact: true }).click();
        for (const target of [donorPage, page]) {
            await target.goto("/notifications");
            await expect.poll(async () => { await target.reload(); return target.locator(".notification-inbox h3").allTextContents(); }).toContain("Equipment request accepted");
            await expect(target.getByLabel("Notification email", { exact: true })).toHaveValue("disabled");
            await expect(target.locator(".notification-inbox")).not.toContainText("PRIVATE_DAY13");
            await target.getByRole("button", { name: "Mark read", exact: true }).click();
            await expect(target.locator(".notification-inbox")).toContainText("Read");
            await expect(target.getByRole("button", { name: "Mark read", exact: true })).toHaveCount(0);
            await expect(target.getByRole("link", { name: "Review update", exact: true })).toHaveCount(1);
            expect(await target.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        }
        await page.getByLabel("Notification email", { exact: true }).selectOption("enabled");
        await page.getByRole("button", { name: "Save notification preferences", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("Notification preferences saved");
        await page.reload(); await expect(page.getByLabel("Notification email", { exact: true })).toHaveValue("enabled");
        await page.screenshot({ path: `artifacts/browser/day-13-notifications-${project}.png`, fullPage: true });
        await page.getByRole("link", { name: "Review update", exact: true }).click();
        await expect(page).toHaveURL(/\/ngo\/requests$/);
    } finally { await context.close(); }
});
