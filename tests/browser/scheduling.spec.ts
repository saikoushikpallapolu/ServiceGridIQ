import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ timezoneId: 'Asia/Kolkata' });
// Earlier browser files exercise the same seeded owner at automation speed.
// Respect the real 300/user/minute protection before the next owner-heavy group.
// Keep this pacing in tests; do not disable or raise application rate limits.
test.beforeAll(async () => {
  test.setTimeout(75_000);
  await new Promise((resolve) => setTimeout(resolve, 60_000));
});
const accounts = JSON.parse(readFileSync('.data/local-accounts.json', 'utf8')) as { email: string; password: string }[];
const alpha = '00000000-0000-4000-8000-000000000001';
const mainBranch = '60000000-0000-4000-8000-000000000001';
async function signIn(page: Page, email: string) {
  const account = accounts.find((item) => item.email === email)!;
  await page.goto('/'); await page.getByRole('link', { name: 'Sign in', exact: true }).click(); await page.locator('#username').fill(email); await page.locator('#password').fill(account.password); await page.locator('#kc-login').click();
  await page.getByRole('button', { name: /Fictional Cooling Alpha/ }).click(); await expect(page.getByRole('heading', { name: 'Technicians & availability' })).toBeVisible();
}
async function createAndOpenJob(page: Page, marker: string) {
  const session = await (await page.request.get('/api/auth/session')).json() as { csrfToken: string };
  const headers = { 'X-Organization-Id': alpha, 'X-CSRF-Token': session.csrfToken, Origin: process.env.E2E_BASE_URL ?? 'http://localhost:8080' };
  const response = await page.request.post('/api/v1/jobs', { headers, data: { customerId: '20000000-0000-4000-8000-000000000001', siteId: '30000000-0000-4000-8000-000000000001', equipmentId: '40000000-0000-4000-8000-000000000001', complaint: marker, priority: 'NORMAL', arrivalStart: '2026-12-01T09:00:00+05:30', arrivalEnd: '2026-12-01T12:00:00+05:30', estimatedDurationMinutes: 60, travelBufferMinutes: 30 } }); expect(response.status()).toBe(201);
  const job = await response.json() as { id: string };
  expect((await page.request.post(`/api/v1/jobs/${job.id}/transitions`, { headers, data: { version: 1, status: 'TRIAGED', reason: '' } })).status()).toBe(200);
  await page.getByLabel('Search jobs', { exact: true }).fill(marker); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('.job-card').filter({ hasText: marker }).click(); await expect(page.getByRole('heading', { name: 'Appointment eligibility', exact: true })).toBeVisible();
}
test('owner verifies a qualification and dispatcher preview explains qualified and blocked technicians', async ({ page }) => {
  await signIn(page, 'owner.alpha@example.test'); const skillName = `Fictional browser qualification ${Date.now()}`;
  await page.getByText('Manage branches, skill catalog and technician profiles', { exact: true }).click();
  await page.getByLabel('Skill name', { exact: true }).fill(skillName); await page.getByRole('button', { name: 'Create skill', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create skill', exact: true })).toBeEnabled();
  await page.getByLabel('Technician profile', { exact: true }).selectOption('80000000-0000-4000-8000-000000000001');
  await page.getByLabel('Qualification skill', { exact: true }).selectOption({ label: skillName });
  await page.getByLabel('Qualification level', { exact: true }).selectOption('3');
  await page.getByLabel('Verification evidence', { exact: true }).fill('Fictional browser evidence reviewed by owner');
  await page.getByRole('button', { name: 'Record qualification verification', exact: true }).click();
  await expect(page.locator('.qualification-list')).toContainText(skillName);
  await createAndOpenJob(page, `Fictional qualification preview ${Date.now()}`);
  await page.getByLabel('Service branch', { exact: true }).selectOption(mainBranch);
  await page.getByLabel(skillName, { exact: true }).check();
  await page.getByLabel(`Minimum level for ${skillName}`, { exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Save scheduling requirements', exact: true }).click();
  await expect(page.getByText('TRIAGED · v3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check technician eligibility', exact: true }).click();
  const eligible = page.locator('.candidate-card').filter({ hasText: 'Alpha Technician' });
  await expect(eligible.locator('.eligibility-badge')).toHaveText('Eligible');
  await expect(page.locator('.candidate-card').filter({ hasText: 'Fictional Annex Technician' }).locator('.eligibility-badge')).toHaveText('Not eligible');
  await expect(eligible).toContainText(skillName);
  await page.locator('.eligibility-panel').screenshot({ path: '.data/phase-4-desktop.png' });
});
test('dispatcher manages an unavailable interval and can preview but cannot verify skills on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page, 'dispatcher.alpha@example.test');
  await expect(page.getByText('Manage branches, skill catalog and technician profiles', { exact: true })).toHaveCount(0);
  await page.getByLabel('Technician profile', { exact: true }).selectOption('80000000-0000-4000-8000-000000000001');
  await expect(page.getByRole('button', { name: 'Record qualification verification', exact: true })).toHaveCount(0);
  await page.getByLabel('Availability type', { exact: true }).selectOption('UNAVAILABLE');
  await page.getByLabel('Availability start', { exact: true }).fill('2026-12-01T09:00'); await page.getByLabel('Availability end', { exact: true }).fill('2026-12-01T09:30');
  const reason = `Fictional browser absence ${Date.now()}`;
  await page.getByLabel('Availability reason', { exact: true }).fill(reason); await page.getByRole('button', { name: 'Add availability interval', exact: true }).click();
  await expect(page.locator('.availability-list')).toContainText(reason);
  try {
    await createAndOpenJob(page, `Fictional unavailable preview ${Date.now()}`);
    await page.getByLabel('Service branch', { exact: true }).selectOption(mainBranch);
    await page.getByLabel('General inspection: no specialized qualifications required', { exact: true }).check();
    await page.getByRole('button', { name: 'Save scheduling requirements', exact: true }).click(); await expect(page.getByText('TRIAGED · v3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Check technician eligibility', exact: true }).click();
    const candidate = page.locator('.candidate-card').filter({ hasText: 'Alpha Technician' });
    await expect(candidate.locator('.eligibility-badge')).toHaveText('Not eligible'); await expect(candidate).toContainText('Blocked: Travel and work must not overlap an unavailable interval.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.eligibility-panel').screenshot({ path: '.data/phase-4-mobile.png' });
  } finally {
    const interval = page.locator('.availability-list li').filter({ hasText: reason }); page.once('dialog', (dialog) => void dialog.accept()); await interval.getByRole('button', { name: 'Remove interval', exact: true }).click(); await expect(interval).toHaveCount(0);
  }
});
