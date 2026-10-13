import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

test("administrator reviews evidence, moderation and commitments with private accessible history", async ({ page }, info) => {
    test.setTimeout(90000);
    const data = JSON.parse(await readFile("artifacts/day-20-fixtures.json", "utf8"))[info.project.name];
    await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": info.project.name === "desktop" ? "192.0.2.201" : "192.0.2.202" });
    await page.goto("/admin/login"); await page.getByLabel("Administration email", { exact: true }).fill(data.adminEmail); await page.getByLabel("Password", { exact: true }).fill("Review-fixture-20!"); await page.getByRole("button", { name: "Enter CareCycle Administration" }).click();
    const audit = async name => {
        await page.addScriptTag({ url: "/__test-axe.js" });
        const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } })).violations);
        expect(violations, name).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await mkdir("artifacts/day-20", { recursive: true }); await page.screenshot({ path: `artifacts/day-20/${name}-${info.project.name}.png`, fullPage: true });
    };
    await page.goto(`/admin/organizations/${data.organization}/review`); await audit("organization-review");
    const approve = page.locator(`form[action="/admin/organizations/${data.organization}/approve"]`);
    await approve.getByRole("checkbox").check(); await approve.getByLabel("Reason for approval").fill("Synthetic reviewed organization evidence"); await approve.getByRole("button", { name: "Approve organization" }).click();
    await Promise.all([page.waitForURL(/\/admin\/dashboard\?message=/), page.getByRole("dialog").getByRole("button", { name: "Continue", exact: true }).click()]);
    await page.goto(`/admin/organizations/${data.organization}/review`); await expect(page.getByText("Synthetic reviewed organization evidence", { exact: true })).toBeVisible();
    await page.goto("/admin/listings"); await audit("listing-queue");
    await page.goto(`/admin/listings/${data.listing}/review`); await page.getByLabel("Review reason or follow-up note").fill("Synthetic equipment listing requires review"); await page.getByRole("button", { name: "Hide from new requests" }).click(); await page.getByRole("dialog").getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("button", { name: "Restore discovery visibility" })).toBeVisible(); await audit("listing-history");
    await page.goto("/admin/users?role=donor");
    // Open the page containing the account through stable user review, then find its form.
    let form = page.locator(`form[action="/admin/users/${data.donor}/suspended"]`);
    while (!await form.count() && await page.getByRole("link", { name: "Next page", exact: true }).count()) { await page.getByRole("link", { name: "Next page", exact: true }).click(); }
    await form.getByLabel("Suspension reason").fill("Synthetic participant moderation follow-up");
    await Promise.all([page.waitForURL(/\/admin\/users\?message=/), form.getByRole("button", { name: "Suspend", exact: true }).click()]);
    await page.goto("/admin/exceptions?status=suspended"); await expect(page.locator(`a[href="/admin/requests/${data.request}/review"]`)).toBeVisible(); await audit("exceptions");
    await page.goto(`/admin/users/${data.donor}/review`); await expect(page.getByText("Synthetic participant moderation follow-up", { exact: true }).last()).toBeVisible(); await audit("account-history");
    await page.goto(`/admin/requests/${data.request}/review`); await page.getByLabel("Review reason or follow-up note").fill("Synthetic follow-up recorded without releasing units"); await page.getByRole("button", { name: "Record administrative review note" }).click(); await page.getByRole("dialog").getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Synthetic follow-up recorded without releasing units", { exact: true })).toBeVisible(); await audit("commitment-history");
    await expect(page.getByText("PRIVATE_REVIEW20_BROWSER_BENEFICIARY")).toHaveCount(0);
});
