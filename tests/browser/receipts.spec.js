import { test, expect } from "@playwright/test";

test("receipt downloads, outcome revisions, agreed corrections and A4 printing", async ({ page, browser }, testInfo) => {
    test.setTimeout(60000);
    const project = testInfo.project.name;
    const context = await browser.newContext({ viewport: page.viewportSize(), baseURL: "http://127.0.0.1:4183" });
    const donorPage = await context.newPage();
    const login = async (target, role) => {
        await target.context().setExtraHTTPHeaders({ "X-Forwarded-For": project === "desktop" ? "192.0.2.61" : "192.0.2.62" });
        await target.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4183" ? route.continue() : route.abort());
        await target.goto("/login"); await target.getByLabel("Email address", { exact: true }).fill(`${role}-day12-${project}@example.invalid`);
        await target.getByLabel("Password", { exact: true }).fill("Matching-fixture-42!"); await target.getByRole("button", { name: "Sign in as participant" }).click();
        await target.goto(`/${role}/requests`); await target.getByRole("link", { name: "Donation receipt", exact: true }).click();
    };
    try {
        await login(donorPage, "donor"); await login(page, "ngo");
        await donorPage.getByRole("button", { name: "Issue donation receipt", exact: true }).click();
        await page.reload(); await expect(page.locator(".receipt-summary")).toContainText("Actual acknowledged quantity: 1");
        const originalUrl = await page.getByRole("link", { name: "Download revision 1", exact: true }).getAttribute("href");
        const initial = await (await page.request.get(originalUrl)).body();
        expect(initial.toString()).not.toContain("PRIVATE_SYNTHETIC");
        await page.getByLabel("Aggregate use or outcome note (optional)", { exact: true }).fill(("Synthetic aggregate community mobility use. ".repeat(15)).slice(0, 500));
        await page.locator('form[action$="/outcome"] input[name="aggregateOnly"]').check();
        await page.getByRole("button", { name: "Save outcome as new revision", exact: true }).click();
        await donorPage.reload();
        await donorPage.getByLabel("Donor name on receipt", { exact: true }).fill("Synthetic Donor " + "D".repeat(64));
        await donorPage.getByLabel("Organization name on receipt", { exact: true }).fill("Synthetic Organization " + "O".repeat(127));
        await donorPage.getByLabel("Reason for receipt correction", { exact: true }).fill(("Synthetic correction of participant spelling for the archived receipt. ".repeat(10)).slice(0, 500));
        await donorPage.locator('form[action$="/amend"] input[name="aggregateOnly"]').check();
        await donorPage.getByRole("button", { name: "Propose receipt correction", exact: true }).click();
        await page.reload();
        await expect(page.locator(".receipt-summary")).toContainText("Current revision: 2");
        await page.getByLabel("Correction confirmation or withdrawal reason", { exact: true }).fill(("Synthetic NGO confirmation of the corrected participant names. ".repeat(10)).slice(0, 500));
        await page.locator('form[action$="/confirm"] input[name="aggregateOnly"]').check();
        await page.getByRole("button", { name: "Confirm correction as new revision", exact: true }).click();
        await expect(page.locator(".receipt-summary")).toContainText("Current revision: 3");
        expect(await (await page.request.get(originalUrl)).body()).toEqual(initial);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        const documentUrl = await page.getByRole("link", { name: "Open printable receipt / Save as PDF", exact: true }).getAttribute("href");
        const printPage = await page.context().newPage(); await printPage.goto(documentUrl);
        await expect(printPage.locator(".quantity")).toContainText("NGO: 1");
        expect(await printPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await printPage.screenshot({ path: `artifacts/day-12-${project}-receipt.png`, fullPage: true });
        await printPage.emulateMedia({ media: "print" });
        await printPage.pdf({ path: `artifacts/day-12-${project}-receipt.pdf`, format: "A4", preferCSSPageSize: true, printBackground: false, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="font:9px Arial;width:100%;text-align:center">CareCycle receipt | <span class="pageNumber"></span> of <span class="totalPages"></span></div>' });
        const currentUrl = await page.getByRole("link", { name: "Download receipt (.html)", exact: true }).getAttribute("href");
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download receipt (.html)", exact: true }).click()]);
        expect(download.suggestedFilename()).toMatch(/^CC-.*-r3\.html$/);
        expect(await (await page.request.get(currentUrl)).body()).toEqual(await (await page.request.get(currentUrl)).body());
        await printPage.close();
    } finally { await context.close(); }
});
