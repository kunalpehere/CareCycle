import { test, expect } from "@playwright/test";

test("partial acceptance remains discoverable with an accurate request limit", async ({ page, browser }, testInfo) => {
    const project = testInfo.project.name;
    const ngoContext = await browser.newContext({ viewport: page.viewportSize(), baseURL: "http://127.0.0.1:4183", extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders });
    const ngoPage = await ngoContext.newPage();
    const login = async (target, role) => {
        await target.context().setExtraHTTPHeaders({ "X-Forwarded-For": project === "desktop" ? "192.0.2.11" : "192.0.2.12" });
        await target.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4183" ? route.continue() : route.abort());
        await target.goto("http://127.0.0.1:4183/login");
        await target.getByLabel("Email address", { exact: true }).fill(`${role}-day6-${project}@example.invalid`);
        await target.getByLabel("Password", { exact: true }).fill("Matching-fixture-42!");
        await target.getByRole("button", { name: "Sign in as participant" }).click();
        await expect(target).toHaveURL(new RegExp(`/${role}/dashboard`));
    };
    try {
        await login(ngoPage, "ngo");
        await ngoPage.goto(`/ngo/equipment?location=${encodeURIComponent(`Day6 ${project}`)}`);
        await expect(ngoPage.locator(".equipment-facts")).toContainText("5 available");
        await login(page, "donor");
        await page.goto("/donor/requests");
        await page.getByRole("button", { name: "Accept request", exact: true }).click();
        await expect(page.locator(".request-status")).toHaveText("accepted");
        await ngoPage.reload();
        await expect(ngoPage.locator(".equipment-facts")).toContainText("3 available");
        await ngoPage.getByRole("link", { name: "View listing", exact: true }).click();
        await expect(ngoPage.getByRole("spinbutton", { name: "Quantity needed" })).toHaveAttribute("max", "3");
        await expect(ngoPage.locator("main")).not.toContainText(`donor-day6-${project}@example.invalid`);
        await expect(ngoPage.locator(".detail-copy > dl")).toContainText("Available quantity3");
        expect(await ngoPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await ngoPage.screenshot({ path: `artifacts/day-6-${project}-remaining-stock.png`, fullPage: true });
        await ngoPage.getByRole("spinbutton", { name: "Quantity needed" }).fill("3");
        await ngoPage.getByLabel("Who will benefit?").fill("Synthetic community beneficiaries for testing");
        await ngoPage.getByLabel("Why is this equipment needed?").fill("Synthetic rehabilitation equipment need for browser verification");
        await ngoPage.getByRole("button", { name: "Submit request", exact: true }).click();
        await expect(ngoPage).toHaveURL(/\/ngo\/requests/);
        await page.reload();
        await page.getByRole("button", { name: "Accept request", exact: true }).click();
        await expect(page.locator(".request-status.status-accepted")).toHaveCount(2);
        await ngoPage.goto(`/ngo/equipment?location=${encodeURIComponent(`Day6 ${project}`)}`);
        await expect(ngoPage.getByRole("heading", { name: "No matching equipment" })).toBeVisible();
    } finally { await ngoContext.close(); }
});
