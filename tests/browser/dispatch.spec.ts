import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ timezoneId: 'Asia/Kolkata' });
const accounts = JSON.parse(readFileSync('.data/local-accounts.json', 'utf8')) as { email: string; password: string }[];
const alpha = '00000000-0000-4000-8000-000000000001'; const branchId = '60000000-0000-4000-8000-000000000001'; const partId = 'a0000000-0000-4000-8000-000000000001'; const locationId = 'b0000000-0000-4000-8000-000000000001';
async function openJob(page: Page, email: string, marker: string, start: string) {
  const account = accounts.find((item) => item.email === email)!;
  await page.goto('/'); await page.getByRole('link', { name: 'Sign in', exact: true }).click(); await page.locator('#username').fill(email); await page.locator('#password').fill(account.password); await page.locator('#kc-login').click(); await page.getByRole('button', { name: /Fictional Cooling Alpha/ }).click();
  await expect(page.getByRole('heading', { name: 'Dispatch workspace', exact: true })).toBeVisible();
  const session = await (await page.request.get('/api/auth/session')).json() as { csrfToken: string };
  const headers = { 'X-Organization-Id': alpha, 'X-CSRF-Token': session.csrfToken, Origin: process.env.E2E_BASE_URL ?? 'http://localhost:8080' };
  // Use a new fictional shift day so repeat runs cannot collide with earlier approved demo jobs.
  const directory = await (await page.request.get('/api/v1/technicians?limit=100', { headers })).json() as { items: { id: string; version: number; availability: { startsAt: string; endsAt: string }[] }[] };
  const tech = directory.items.find((item) => item.id === '80000000-0000-4000-8000-000000000001')!;
  const day = new Date('2030-01-01T00:00:00Z');
  while (tech.availability.some((block) => new Date(block.startsAt) < new Date(`${day.toISOString().slice(0, 10)}T18:00:00+05:30`) && new Date(block.endsAt) > new Date(`${day.toISOString().slice(0, 10)}T08:00:00+05:30`))) day.setUTCDate(day.getUTCDate() + 1);
  const visitDate = day.toISOString().slice(0, 10);
  expect((await page.request.post(`/api/v1/technicians/${tech.id}/availability`, { headers, data: { version: tech.version, kind: 'SHIFT', startsAt: `${visitDate}T08:00:00+05:30`, endsAt: `${visitDate}T18:00:00+05:30`, reason: `Fictional approval browser fixture ${marker}` } })).status()).toBe(201);
  const created = await page.request.post('/api/v1/jobs', { headers, data: { customerId: '20000000-0000-4000-8000-000000000001', siteId: '30000000-0000-4000-8000-000000000001', equipmentId: '40000000-0000-4000-8000-000000000001', complaint: marker, serviceCategory: 'HVAC_INSPECTION', priority: 'HIGH', arrivalStart: `${visitDate}T${start}:00+05:30`, arrivalEnd: `${visitDate}T16:00:00+05:30`, estimatedDurationMinutes: 60, travelBufferMinutes: 30 } }); expect(created.status()).toBe(201);
  const job = await created.json() as { id: string }; expect((await page.request.post(`/api/v1/jobs/${job.id}/transitions`, { headers, data: { version: 1, status: 'TRIAGED', reason: '' } })).status()).toBe(200);
  expect((await page.request.put(`/api/v1/job-scheduling/${job.id}`, { headers, data: { version: 2, branchId, generalInspection: true, allowCrossBranch: false, requirements: [] } })).status()).toBe(200);
  await page.getByLabel('Search jobs', { exact: true }).fill(marker); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.locator('.job-card').filter({ hasText: marker }).click();
  const panel = page.getByRole('region', { name: 'Readiness and approved assignment' });
  await panel.getByLabel('I reviewed which parts are needed for this visit', { exact: true }).check(); await panel.getByLabel('I reviewed mandatory safety and access prerequisites', { exact: true }).check(); await panel.getByRole('button', { name: 'Save visit preparation plan', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Mark job ready', exact: true })).toBeEnabled();
  return { panel, jobId: job.id, headers };
}
test('required evidence gates approval and a lost assignment response can be retried safely', async ({ page }) => {
  const marker = `Fictional approval ${Date.now()}`; const { panel, jobId, headers } = await openJob(page, 'owner.alpha@example.test', marker, '12:00');
  await panel.getByText('Parts requirements and confirmations', { exact: true }).click();
  await panel.getByLabel('Required catalog part', { exact: true }).selectOption(partId); await panel.getByLabel('Part stock location', { exact: true }).selectOption(locationId); await panel.getByLabel('Part requirement state', { exact: true }).selectOption('REQUIRED'); await panel.getByLabel('Part classification reason', { exact: true }).fill('Fictional required replacement filter'); await panel.getByRole('button', { name: 'Add job part', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Fictional air filter · REQUIRED', exact: true })).toBeVisible(); await expect(panel.getByRole('button', { name: 'Mark job ready', exact: true })).toBeDisabled();
  await panel.getByLabel('Confirmation note for DEMO-FILTER-001', { exact: true }).fill('Fictional physical check in stores'); await panel.getByRole('button', { name: 'Record confirmation for DEMO-FILTER-001', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Mark job ready', exact: true })).toBeEnabled();
  await panel.getByText('Mandatory safety and access checks', { exact: true }).click(); await panel.getByLabel('Prerequisite code', { exact: true }).fill('SAFE_ACCESS'); await panel.getByLabel('Prerequisite label', { exact: true }).fill('Isolation verified'); await panel.getByLabel('Prerequisite rationale', { exact: true }).fill('Fictional mandatory safety check'); await panel.getByRole('button', { name: 'Add mandatory prerequisite', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'SAFETY: Isolation verified', exact: true })).toBeVisible(); await expect(panel.getByRole('button', { name: 'Mark job ready', exact: true })).toBeDisabled();
  await panel.getByLabel('Evidence for SAFE_ACCESS', { exact: true }).fill('Fictional isolation evidence reviewed'); await panel.getByRole('button', { name: 'Record evidence for SAFE_ACCESS', exact: true }).click(); await expect(panel.getByRole('button', { name: 'Mark job ready', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Mark job ready', exact: true }).click(); await expect(page.getByText(/READY · v/)).toBeVisible(); await panel.getByRole('button', { name: 'Compare ranked technicians', exact: true }).click();
  await panel.getByLabel('Technician to assign', { exact: true }).selectOption('80000000-0000-4000-8000-000000000001'); await panel.getByLabel('Assignment approval reason', { exact: true }).fill('Reviewed all evidence and accepted the recommended technician');
  let committedId = '';
  await page.route(`**/api/v1/preparation/${jobId}/assignments`, async (route) => { const response = await route.fetch(); expect(response.status()).toBe(201); committedId = (await response.json() as { assignmentId: string }).assignmentId; await route.abort('failed'); });
  await panel.getByRole('button', { name: 'Approve assignment', exact: true }).click(); await expect(panel.getByRole('alert')).toBeVisible(); await page.unroute(`**/api/v1/preparation/${jobId}/assignments`);
  await panel.getByRole('button', { name: 'Approve assignment', exact: true }).click(); await expect(panel.getByRole('heading', { name: 'Assignment approved', exact: true })).toBeVisible(); await expect(page.getByText(/ASSIGNED · v/)).toBeVisible();
  const assignment = await (await page.request.get(`/api/v1/preparation/${jobId}/assignment`, { headers })).json() as { assignment: { id: string } }; expect(assignment.assignment.id).toBe(committedId);
  await panel.screenshot({ path: '.data/phase-5-desktop.png' });
});
test('mobile suspected-parts warnings require an explicit acknowledgment and explain ranking', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const { panel } = await openJob(page, 'dispatcher.alpha@example.test', `Fictional warning ${Date.now()}`, '14:00');
  await panel.getByText('Parts requirements and confirmations', { exact: true }).click(); await panel.getByLabel('Required catalog part', { exact: true }).selectOption(partId); await panel.getByLabel('Part stock location', { exact: true }).selectOption(locationId); await panel.getByLabel('Part classification reason', { exact: true }).fill('Fictional suspected filter; inspect first'); await panel.getByRole('button', { name: 'Add job part', exact: true }).click();
  await expect(panel.getByText('NEEDS_REVIEW', { exact: true })).toBeVisible(); await expect(panel.getByRole('button', { name: 'Mark job ready', exact: true })).toBeDisabled();
  await panel.getByLabel(/^Reason to accept warning PART:/).fill('Inspection first; no confirmed replacement requirement'); await panel.getByRole('button', { name: 'Acknowledge warning', exact: true }).click(); await expect(panel.getByRole('button', { name: 'Mark job ready', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Mark job ready', exact: true }).click(); await expect(page.getByText(/READY · v/)).toBeVisible(); await panel.getByRole('button', { name: 'Compare ranked technicians', exact: true }).click(); await expect(panel.getByRole('heading', { name: 'Technician ranking · dispatch-v2', exact: true })).toBeVisible(); await expect(panel.getByText(/Missing completed visit history contributes zero/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await panel.screenshot({ path: '.data/phase-5-mobile.png' });
});
