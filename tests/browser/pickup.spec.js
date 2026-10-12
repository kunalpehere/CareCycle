import { test, expect } from "@playwright/test";

test("participants propose, confirm and reschedule a private pickup", async ({ page, browser }, testInfo) => {
    const project = testInfo.project.name;
    const context = await browser.newContext({ viewport: page.viewportSize(), baseURL: "http://127.0.0.1:4183" });
    const donorPage = await context.newPage();
    const login = async (target, role) => {
        await target.context().setExtraHTTPHeaders({ "X-Forwarded-For": project === "desktop" ? "192.0.2.31" : "192.0.2.32" });
        await target.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4183" ? route.continue() : route.abort());
        await target.goto("/login");
        await target.getByLabel("Email address", { exact: true }).fill(`${role}-day9-${project}@example.invalid`);
        await target.getByLabel("Password", { exact: true }).fill("Matching-fixture-42!");
        await target.getByRole("button", { name: "Sign in as participant" }).click();
        await target.goto(`/${role}/requests`);
        await target.getByRole("link", { name: "Arrange pickup", exact: true }).click();
    };
    const noOverflow = async target => expect(await target.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    try {
        await login(donorPage, "donor"); await login(page, "ngo");
        await donorPage.getByLabel("Window start", { exact: true }).fill("2090-01-10T10:00");
        await donorPage.getByLabel("Window end", { exact: true }).fill("2090-01-10T09:00");
        await donorPage.getByLabel("Pickup address", { exact: true }).fill("12 Synthetic Pickup Road");
        await donorPage.getByLabel("Private coordination instructions (optional)", { exact: true }).fill("Synthetic instructions: call on arrival.");
        await donorPage.getByRole("button", { name: "Submit pickup proposal", exact: true }).click();
        await expect(donorPage.getByRole("status")).toContainText("end after its start");
        await expect(donorPage.getByLabel("Pickup address", { exact: true })).toHaveValue("12 Synthetic Pickup Road");
        await donorPage.getByLabel("Window end", { exact: true }).fill("2090-01-10T12:00");
        await donorPage.getByRole("button", { name: "Submit pickup proposal", exact: true }).click();
        await expect(donorPage.locator(".pickup-current")).toContainText("Waiting for the other participant");
        await expect(donorPage.getByRole("button", { name: "Confirm pickup", exact: true })).toHaveCount(0);
        await page.reload();
        // Keep a stale proposal form while the counterparty confirms.
        const stale = await context.newPage(); await stale.goto(donorPage.url());
        await page.getByRole("button", { name: "Confirm pickup", exact: true }).click();
        await expect(page.locator(".pickup-current")).toContainText("Status: confirmed");
        await stale.getByRole("button", { name: "Submit revised proposal", exact: true }).click();
        await expect(stale.getByRole("status")).toContainText("outdated");
        await expect(stale.locator(".pickup-current")).toContainText("Status: confirmed");
        await page.getByLabel("Window start", { exact: true }).fill("2090-01-11T14:00");
        await page.getByLabel("Window end", { exact: true }).fill("2090-01-11T16:00");
        await page.getByRole("button", { name: "Submit revised proposal", exact: true }).click();
        await expect(page.locator(".pickup-current")).toContainText("Status: proposed");
        await donorPage.reload();
        await donorPage.getByRole("button", { name: "Confirm pickup", exact: true }).click();
        await expect(donorPage.locator(".pickup-history li")).toHaveCount(4);
        await expect(donorPage.locator(".pickup-current")).toContainText("Asia/Kolkata");
        await page.reload();
        await noOverflow(page); await noOverflow(donorPage); await noOverflow(stale);
        await page.screenshot({ path: `artifacts/day-9-${project}-pickup.png`, fullPage: true });
        await donorPage.goto("/donor/requests");
        await expect(donorPage.getByRole("link", { name: "Arrange pickup (confirmed)", exact: true })).toBeVisible();
    } finally { await context.close(); }
});
