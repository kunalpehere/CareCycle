import { test, expect } from "@playwright/test";

const login = async (page, project, role = 'donor') => {
    await page.context().setExtraHTTPHeaders({ 'X-Forwarded-For': project === 'desktop' ? '192.0.2.171' : '192.0.2.172' });
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4183' ? route.continue() : route.abort());
    if ((await page.context().cookies()).some(cookie => cookie.name === 'token')) {
        await page.goto('/home');
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    }
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(`${role}-${role === 'donor' ? 'day17' : 'day6'}-${project}@example.invalid`);
    await page.getByLabel('Password', { exact: true }).fill(role === 'donor' ? 'Workspace-fixture-42!' : 'Matching-fixture-42!');
    await page.getByRole('button', { name: 'Sign in as participant' }).click();
};
const common = async (page, project, description = 'Synthetic Day 17 equipment') => {
    await page.getByLabel('Quantity', { exact: true }).fill('3');
    await page.getByLabel('Condition', { exact: true }).selectOption('good');
    await page.getByLabel('Description', { exact: true }).fill(description);
    await page.getByLabel('City', { exact: true }).fill(`Day17 ${project}`);
    await page.getByLabel('State', { exact: true }).fill('Maharashtra');
    await page.getByLabel('Postal code', { exact: true }).fill('411001');
};

test('equipment details, image previews and category switching work without carrying stale specifications', async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    await login(page, project); await page.goto('/donate'); await common(page, project);
    await page.getByLabel('Brand', { exact: true }).fill('Synthetic Brand');
    await page.getByLabel('Model', { exact: true }).fill('Model 17');
    await page.getByLabel('Reported functional condition').selectOption('partly_working');
    await page.getByLabel('Known defects or faults').fill('Brake needs repair');
    await page.getByLabel('Missing accessories or parts').fill('One footrest');
    await page.getByLabel('Seat width (cm)').fill('42.5');
    await page.locator('[data-category="wheelchair"]').getByLabel('Folding frame').selectOption('yes');
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=', 'base64');
    await page.locator('#images').setInputFiles({ name: 'synthetic-pixel.png', mimeType: 'image/png', buffer: pixel });
    await expect(page.locator('.file-preview')).toContainText('synthetic-pixel.png');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    await page.screenshot({ path: `artifacts/day-17-form-${project}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Create listing', exact: true }).click();
    const card = page.locator('.donation-card').filter({ hasText: 'Synthetic Day 17 equipment' });
    await card.locator('summary').filter({ hasText: 'Equipment details' }).click();
    await expect(card).toContainText('Brake needs repair');
    await card.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Equipment type').selectOption('cane');
    await expect(page.locator('[data-category="wheelchair"]')).toBeHidden();
    await expect(page.locator('#wheelchair_spec_seatWidthCm')).toHaveValue('');
    await page.locator('[data-category="cane"]').getByLabel('Height adjustable').selectOption('no');
    await page.getByLabel('Remove existing image').check();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(card.locator('.card-image')).toHaveCount(0);
    await card.locator('summary').filter({ hasText: 'Equipment details' }).click();
    await expect(card.locator('.equipment-detail-list')).toContainText('Height adjustable');
    await expect(card.locator('.equipment-detail-list')).not.toContainText('Seat width');
    await login(page, project, 'ngo');
    await page.goto(`/ngo/equipment?location=${encodeURIComponent(`Day17 ${project}`)}`);
    await page.getByRole('link', { name: 'View listing', exact: true }).click();
    await expect(page.locator('.equipment-detail-record')).toContainText('Reported partly working');
    await expect(page.locator('.equipment-detail-record')).toContainText('One footrest');
    await page.screenshot({ path: `artifacts/day-17-detail-${project}.png`, fullPage: true });
});

test('server errors retain text and place errors by fields while rejecting false image formats', async ({ page }, testInfo) => {
    await login(page, testInfo.project.name); await page.goto('/donate'); await common(page, testInfo.project.name, 'Synthetic validation draft');
    await page.getByLabel('Brand', { exact: true }).fill('Kept brand');
    await page.getByLabel('Known defects or faults').fill('<script>synthetic draft</script>');
    await page.getByLabel('Quantity', { exact: true }).fill('0');
    await page.locator('form.listing-form').evaluate(form => form.noValidate = true);
    await page.getByRole('button', { name: 'Create listing', exact: true }).click();
    await expect(page.locator('.server-errors')).toBeFocused();
    await expect(page.locator('#quantity')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#error-quantity')).toBeVisible();
    await expect(page.getByLabel('Brand', { exact: true })).toHaveValue('Kept brand');
    await expect(page.getByLabel('Known defects or faults')).toHaveValue('<script>synthetic draft</script>');
    await page.getByLabel('Quantity', { exact: true }).fill('2');
    await page.locator('#images').setInputFiles({ name: 'false.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
    await page.getByRole('button', { name: 'Create listing', exact: true }).click();
    await expect(page.locator('#error-images')).toContainText('does not match');
    await expect(page.locator('#images')).toHaveValue('');
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Synthetic validation draft');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    await page.screenshot({ path: `artifacts/day-17-errors-${testInfo.project.name}.png`, fullPage: true });
});

test('without JavaScript category-specific inputs remain usable and server saves only the selected category', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://127.0.0.1:4183', viewport: testInfo.project.use.viewport });
    try {
        const page = await context.newPage(); await login(page, testInfo.project.name); await page.goto('/donate'); await common(page, testInfo.project.name, 'Synthetic no-script stethoscope');
        await page.getByLabel('Equipment type').selectOption('stethoscope');
        await page.getByLabel('Seat width (cm)').fill('45');
        await page.getByLabel('Chestpiece type or description').fill('Single head');
        await page.getByLabel('Reported tubing condition').selectOption('not_checked');
        await page.getByRole('button', { name: 'Create listing', exact: true }).click();
        const card = page.locator('.donation-card').filter({ hasText: 'Synthetic no-script stethoscope' });
        await card.locator('summary').filter({ hasText: 'Equipment details' }).click();
        await expect(card.locator('.equipment-detail-list')).toContainText('Single head');
        await expect(card.locator('.equipment-detail-list')).not.toContainText('Seat width');
    } finally { await context.close(); }
});
