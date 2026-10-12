import { test, expect } from "@playwright/test";

test("donor transfer, NGO discrepancy resolution and agreed remainder close accurately", async ({ page, browser }, testInfo) => {
    test.setTimeout(60000);
    const project = testInfo.project.name;
    const context = await browser.newContext({ viewport: page.viewportSize(), baseURL: "http://127.0.0.1:4183" });
    const donorPage = await context.newPage();
    const login = async (target, role) => {
        await target.context().setExtraHTTPHeaders({ "X-Forwarded-For": project === "desktop" ? "192.0.2.51" : "192.0.2.52" });
        await target.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4183" ? route.continue() : route.abort());
        await target.goto("/login"); await target.getByLabel("Email address", { exact: true }).fill(`${role}-day11-${project}@example.invalid`);
        await target.getByLabel("Password", { exact: true }).fill("Matching-fixture-42!"); await target.getByRole("button", { name: "Sign in as participant" }).click();
    };
    const open = async (target, role, equipment) => {
        await target.goto(`/${role}/requests`);
        await target.locator(".request-card").filter({ hasText: equipment }).getByRole("link", { name: "Arrange pickup (confirmed)", exact: true }).click();
    };
    const handover = async () => {
        await donorPage.getByLabel("Actual quantity handed over", { exact: true }).fill("2");
        for (const name of ["equipmentMatches", "conditionReviewed", "accessoriesExplained"]) await donorPage.locator(`input[name="${name}"]`).check();
        await donorPage.getByLabel("Handover notes (optional)", { exact: true }).fill("Synthetic equipment inspected together before physical transfer.");
        await donorPage.getByRole("button", { name: "Record handover", exact: true }).click();
    };
    try {
        await login(donorPage, "donor"); await login(page, "ngo");
        await open(donorPage, "donor", "wheelchair"); await open(page, "ngo", "wheelchair");
        await handover(); await expect(donorPage.locator(".fulfillment-summary")).toContainText("NGO acknowledged: 0");
        await expect(donorPage.getByRole("button", { name: "Acknowledge receipt", exact: true })).toHaveCount(0);
        await page.reload();
        await page.getByLabel("Quantity received with discrepancy", { exact: true }).fill("1");
        await page.getByLabel("Quantity or condition discrepancy", { exact: true }).fill("Synthetic discrepancy: one unit physically transferred, condition discussed.");
        await page.getByRole("button", { name: "Report receipt discrepancy", exact: true }).click();
        await expect(page.locator(".fulfillment-transfers")).toContainText("Status: disputed");
        await expect(page.getByRole("button", { name: "Submit revised proposal", exact: true })).toHaveCount(0);
        await page.screenshot({ path: `artifacts/day-11-${project}-discrepancy.png`, fullPage: true });
        await donorPage.reload();
        await donorPage.getByLabel("Proposed actual transfer quantity", { exact: true }).fill("1");
        await donorPage.getByLabel("Resolution explanation", { exact: true }).fill("Synthetic agreement: exactly one unit transferred and condition resolved.");
        await donorPage.getByRole("button", { name: "Propose receipt resolution", exact: true }).click();
        await page.reload();
        await page.getByLabel("Confirm agreed actual quantity", { exact: true }).fill("1");
        await page.getByLabel("Receipt resolution confirmation note", { exact: true }).fill("Synthetic receipt confirmation of one unit and the condition resolution.");
        await page.locator('form[action$="/resolution-confirm"] input[name="receiptConfirmed"]').check();
        await page.getByRole("button", { name: "Confirm receipt resolution", exact: true }).click();
        await expect(page.locator(".fulfillment-summary")).toContainText("Remaining reservation: 1");
        await donorPage.reload();
        await donorPage.getByLabel("Remaining-unit resolution reason", { exact: true }).fill("Synthetic agreement to release the one unfulfilled unit.");
        await donorPage.locator('input[name="noFurtherHandover"]').check();
        await donorPage.getByRole("button", { name: "Propose remaining-unit release", exact: true }).click();
        await page.reload();
        await page.getByLabel("Remaining-unit resolution reason", { exact: true }).fill("Synthetic confirmation that no further equipment was handed over.");
        await page.locator('input[name="noFurtherHandover"]').check();
        await page.getByRole("button", { name: "Confirm remaining-unit release", exact: true }).click();
        await expect(page.locator(".fulfillment-summary")).toContainText("This request is complete");
        await expect(page.locator(".fulfillment-summary")).toContainText("Actual acknowledged quantity: 1");
        await expect(page.locator(".fulfillment-transfers")).toContainText("Donor originally recorded 2 units");
        await page.screenshot({ path: `artifacts/day-11-${project}-completed.png`, fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.goto("/ngo/requests"); await expect(page.getByRole("link", { name: "View collection history (acknowledged)", exact: true })).toBeVisible();
        await open(donorPage, "donor", "stethoscope"); await open(page, "ngo", "stethoscope"); await handover(); await page.reload();
        await page.getByLabel("Quantity received", { exact: true }).fill("2");
        await page.locator('form[action$="/acknowledge"] input[name="receiptConfirmed"]').check();
        await page.getByRole("button", { name: "Acknowledge receipt", exact: true }).click();
        await expect(page.locator(".fulfillment-summary")).toContainText("Actual acknowledged quantity: 2");
        await expect(page.getByRole("button", { name: "Acknowledge receipt", exact: true })).toHaveCount(0);
    } finally { await context.close(); }
});
