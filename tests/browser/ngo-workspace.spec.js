import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const login = async (page, kind, project) => {
    await page.context().setExtraHTTPHeaders({ 'X-Forwarded-For': project === 'desktop' ? '192.0.2.211' : '192.0.2.212' });
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4183' ? route.continue() : route.abort());
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(`${kind}-day18-${project}@example.invalid`);
    await page.getByLabel('Password', { exact: true }).fill('Accessibility-fixture-42!');
    await page.getByRole('button', { name: 'Sign in as participant', exact: true }).click();
};

test('NGO workspace links to collection, filters history and restores discovery context', async ({ page }, info) => {
    await login(page, 'ngo', info.project.name);
    await expect(page.getByRole('heading', { name: 'Requests and collection steps' })).toBeVisible();
    await expect(page.locator('.ngo-task-list')).toContainText('Review confirmed pickup');
    await page.getByRole('link', { name: 'View all request history' }).click();
    await page.getByLabel('Request status', { exact: true }).selectOption('accepted');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('.request-card')).toHaveCount(2);
    await expect(page.locator('.request-list')).toContainText('Still to collect:');
    await page.getByLabel('Request status', { exact: true }).selectOption('rejected');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('heading', { name: 'No matching requests' })).toBeVisible();
    await page.getByRole('link', { name: 'Clear request filters' }).click();
    await expect(page.locator('.request-card')).toHaveCount(5);
    await page.goto(`/ngo/equipment?equipment=walker&location=${encodeURIComponent(`Day18 ${info.project.name}`)}`);
    await page.getByRole('link', { name: 'View listing', exact: true }).first().click();
    await page.getByRole('link', { name: 'Back to available equipment' }).click();
    await expect(page.getByRole('combobox', { name: 'Equipment', exact: true })).toHaveValue('walker');
    await expect(page.getByLabel('Location', { exact: true })).toHaveValue(`Day18 ${info.project.name}`);
    await page.getByLabel('Location', { exact: true }).fill('SyntheticNoResults16');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByRole('link', { name: 'Show all available equipment' }).click();
    await expect(page.getByLabel('Location', { exact: true })).toHaveValue('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('/ngo/dashboard');
    await page.screenshot({ path: `artifacts/day-16-workspace-${info.project.name}.png`, fullPage: true });
});

test('rejected NGOs see their remediation and verification boundary', async ({ page }, info) => {
    await login(page, 'rejected', info.project.name);
    await expect(page.locator('.application-card')).toContainText('provide updated organization evidence');
    await expect(page.getByRole('link', { name: 'Correct & resubmit' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Equipment discovery unlocks after verification' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Requests and collection steps' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Correct & resubmit' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/ngo\/organizations\/.*\/edit$/);
});
