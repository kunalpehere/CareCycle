import { test, expect } from "@playwright/test";

test("retry, stale quantity recovery and withdrawal retain every attempt", async ({ page, browser }, testInfo) => {
    const project = testInfo.project.name;
    const donorContext = await browser.newContext({ viewport: page.viewportSize(), baseURL: "http://127.0.0.1:4183", extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders });
    const donorPage = await donorContext.newPage();
    const login = async (target, role) => {
        await target.context().setExtraHTTPHeaders({ "X-Forwarded-For": project === "desktop" ? "192.0.2.21" : "192.0.2.22" });
        await target.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4183" ? route.continue() : route.abort());
        target.on("dialog", dialog => dialog.accept());
        await target.goto("http://127.0.0.1:4183/login");
        await target.getByLabel("Email address", { exact: true }).fill(`${role}-day6-${project}@example.invalid`);
        await target.getByLabel("Password", { exact: true }).fill("Matching-fixture-42!");
        await target.getByRole("button", { name: "Sign in as participant" }).click();
        await expect(target).toHaveURL(new RegExp(`/${role}/dashboard`));
    };
    const openListing = async () => {
        await page.goto(`/ngo/equipment?location=${encodeURIComponent(`Day7 ${project}`)}`);
        await page.getByRole("link", { name: "View listing", exact: true }).click();
    };
    const request = async quantity => {
        await page.getByRole("spinbutton", { name: "Quantity needed" }).fill(String(quantity));
        await page.getByLabel("Who will benefit?").fill("Synthetic Day 7 beneficiaries for verification");
        await page.getByLabel("Why is this equipment needed?").fill("Synthetic Day 7 equipment need for verification");
        await page.getByRole("button", { name: "Submit request", exact: true }).click();
        await expect(page).toHaveURL(/\/ngo\/requests/);
    };
    try {
        await login(page, "ngo");
        await login(donorPage, "donor");
        await openListing();
        await request(4);
        await page.getByRole("button", { name: "Cancel request", exact: true }).click();
        // Shared accessibility confirmation uses a dialog in supported browsers.
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(page.locator(".request-status.status-cancelled")).toHaveCount(1);
        await openListing();
        await expect(page.locator(".request-form")).toContainText("preserves its history");
        await request(4);
        await donorPage.goto("/donor/dashboard");
        const card = donorPage.locator(".donation-card").filter({ hasText: "Synthetic Day 7" });
        await card.getByRole("link", { name: "Update total quantity" }).click();
        const quantityUrl = donorPage.url();
        // Hold a second copy of the old version to exercise a real stale form.
        const stalePage = await donorContext.newPage();
        await stalePage.goto(quantityUrl);
        await donorPage.getByLabel("Total units offered").fill("2");
        await donorPage.getByRole("button", { name: "Save total quantity" }).click();
        await expect(donorPage).toHaveURL(/\/donor\/dashboard/);
        await stalePage.getByLabel("Total units offered").fill("5");
        await stalePage.getByRole("button", { name: "Save total quantity" }).click();
        await expect(stalePage.getByRole("heading", { name: "This action needs a fresh review" })).toBeVisible();
        await expect(stalePage.locator("main")).toContainText("Current requestable quantity: 2");
        expect(await stalePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await stalePage.screenshot({ path: `artifacts/day-7-${project}-stale-action.png`, fullPage: true });
        await page.reload();
        await expect(page.locator(".request-status.status-cancelled")).toHaveCount(2);
        await expect(page.locator("main")).toContainText("remaining quantity is lower");
        await openListing();
        await expect(page.getByRole("spinbutton", { name: "Quantity needed" })).toHaveAttribute("max", "2");
        await request(1);
        await donorPage.reload();
        await donorPage.locator(".donation-card").filter({ hasText: "Synthetic Day 7" }).getByRole("button", { name: "Withdraw", exact: true }).click();
        await donorPage.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(donorPage.locator(".form-message")).toContainText("Listing withdrawn");
        await page.reload();
        await expect(page.locator(".request-status.status-cancelled")).toHaveCount(3);
        await expect(page.locator("main")).toContainText("donor withdrew this listing");
        await expect(page.locator(".request-card").filter({ hasText: "Synthetic Day 7 beneficiaries" }).locator(".contact-exchange")).toHaveCount(0);
    } finally { await donorContext.close(); }
});
