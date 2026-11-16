import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const accounts = JSON.parse(readFileSync('.data/local-accounts.json', 'utf8')) as { email: string; password: string }[];
const alpha = '00000000-0000-4000-8000-000000000001';
const beta = '00000000-0000-4000-8000-000000000002';
async function signIn(page: Page, email = 'dispatcher.alpha@example.test') {
  const account = accounts.find((item) => item.email === email)!;
  await page.goto('/'); await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.locator('#username').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('#kc-login').click();
  await page.getByRole('button', { name: /Fictional Cooling Alpha/ }).click();
  await expect(page.getByRole('heading', { name: 'Dispatch workspace' })).toBeVisible();
}

test('dispatcher creates customer, site, equipment and intake, edits and triages with recorded history', async ({ page }) => {
  await signIn(page); const name = `Fictional Browser ${Date.now()}`;
  await page.getByRole('button', { name: 'Customers & equipment', exact: true }).click();
  await page.getByLabel('Customer name', { exact: true }).fill(name);
  await page.getByLabel('Customer email', { exact: true }).fill('demo@example.test');
  await page.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add service site', exact: true })).toBeVisible();
  await page.getByLabel('Site name', { exact: true }).fill('Fictional kitchen');
  await page.getByLabel('Street address', { exact: true }).fill('42 Fictional Street');
  await page.getByLabel('Access notes', { exact: true }).fill('Ask reception');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add equipment', exact: true })).toBeVisible();
  await page.getByLabel('Manufacturer', { exact: true }).fill('Demo'); await page.getByLabel('Model', { exact: true }).fill('Cool 2'); await page.getByLabel('Serial number', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save equipment', exact: true }).click();
  await expect(page.getByText('Equipment created.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New service request', exact: true }).click();
  await page.getByLabel('Complaint', { exact: true }).fill('Fictional compressor noise');
  await page.getByLabel('Arrival window start', { exact: true }).fill('2026-12-02T09:00'); await page.getByLabel('Arrival window end', { exact: true }).fill('2026-12-02T12:00');
  await page.getByRole('button', { name: 'Create service request', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Service request details' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByLabel('Complaint', { exact: true }).fill('Fictional cooling failure'); await page.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByText('Draft updated.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Triage job', exact: true }).click();
  await expect(page.getByText('TRIAGED · v3', { exact: true })).toBeVisible();
  await page.getByLabel('Reason to return to draft', { exact: true }).fill('Customer changed the arrival window'); await page.getByRole('button', { name: 'Return to draft', exact: true }).click();
  await expect(page.getByText('DRAFT · v4', { exact: true })).toBeVisible();
  await expect(page.getByText('Customer changed the arrival window', { exact: true })).toBeVisible();
  await page.getByLabel('Search jobs', { exact: true }).fill(name); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await page.locator('.intake-panel').screenshot({ path: '.data/phase-3-desktop.png' });
});

test('stale browser edits are preserved and latest changes can be reloaded', async ({ page }) => {
  await signIn(page);
  const session = await (await page.request.get('/api/auth/session')).json() as { csrfToken: string };
  const headers = { 'X-Organization-Id': alpha, 'X-CSRF-Token': session.csrfToken, Origin: process.env.E2E_BASE_URL ?? 'http://localhost:8080' };
  const marker = `Fictional concurrency ${Date.now()}`;
  const input = { customerId: '20000000-0000-4000-8000-000000000001', siteId: '30000000-0000-4000-8000-000000000001', equipmentId: '40000000-0000-4000-8000-000000000001', complaint: marker, priority: 'NORMAL', arrivalStart: '2026-12-03T09:00:00Z', arrivalEnd: '2026-12-03T12:00:00Z', estimatedDurationMinutes: 60, travelBufferMinutes: 30 };
  const created = await page.request.post('/api/v1/jobs', { headers, data: input }); expect(created.status()).toBe(201);
  const job = await created.json() as { id: string };
  await page.getByLabel('Search jobs', { exact: true }).fill(marker); await page.getByRole('button', { name: 'Search', exact: true }).click();
  const filteredJob = page.locator('.job-card').filter({ hasText: marker });
  await expect(filteredJob).toHaveCount(1);
  await filteredJob.click(); await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByLabel('Complaint', { exact: true }).fill('My unsaved correction');
  expect((await page.request.patch(`/api/v1/jobs/${job.id}`, { headers, data: { ...input, complaint: 'Other dispatcher correction', version: 1 } })).status()).toBe(200);
  await page.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This job changed');
  await expect(page.getByLabel('Complaint', { exact: true })).toHaveValue('My unsaved correction');
  page.once('dialog', (dialog) => void dialog.accept()); await page.getByRole('button', { name: 'Reload latest job', exact: true }).click();
  await expect(page.getByText('Other dispatcher correction', { exact: true })).toBeVisible();
  await expect(page.getByText('DRAFT · v2', { exact: true })).toBeVisible();
});

test('mobile intake fits the screen and switching company clears Alpha records', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page, 'owner.alpha@example.test');
  await page.getByLabel('Search jobs', { exact: true }).fill('DEMO-001'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.job-card').first()).toContainText('DEMO-001');
  await page.locator('.job-card').first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.intake-panel').screenshot({ path: '.data/phase-3-mobile.png' });
  await page.getByRole('button', { name: /Fictional Cooling Beta/ }).click();
  await expect(page.getByRole('heading', { name: 'Service request details' })).toHaveCount(0);
  await expect(page.locator('.job-card').first()).toContainText('DEMO-002');
  expect((await page.request.get('/api/v1/jobs', { headers: { 'X-Organization-Id': alpha } })).status()).toBe(404);
  expect((await page.request.get('/api/v1/jobs', { headers: { 'X-Organization-Id': beta } })).status()).toBe(200);
});
