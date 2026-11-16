import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openWorkspace } from './workspace-navigation';
const accounts = JSON.parse(readFileSync('.data/local-accounts.json', 'utf8')) as { email: string; password: string }[];

test('public website has working section links, local imagery and mobile navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Great service starts before the visit.');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', /\/api\/auth\/login/);
  const image = page.getByAltText('Two HVAC technicians reviewing a tablet beside commercial cooling equipment');
  await expect(image).toBeVisible();
  expect(await image.evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const teamImage = page.getByAltText('Field technicians discussing their next service task'); await teamImage.scrollIntoViewIfNeeded(); await teamImage.evaluate((node) => (node as HTMLImageElement).decode()); await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.data/redesign-landing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle website navigation' }).click();
  await page.getByRole('navigation', { name: 'Website navigation' }).getByRole('link', { name: 'How it works' }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole('button', { name: 'Toggle website navigation' })).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.data/redesign-landing-mobile.png', fullPage: true });
});

test('owner navigation presents every workspace, actual overview counts and retained mobile form input', async ({ page }) => {
  const account = accounts.find((item) => item.email === 'owner.alpha@example.test')!;
  await page.goto('/'); await page.getByRole('link', { name: 'Sign in', exact: true }).click(); await page.locator('#username').fill(account.email); await page.locator('#password').fill(account.password); await page.locator('#kc-login').click(); await page.getByRole('button', { name: /Fictional Cooling Alpha/ }).click();
  await openWorkspace(page, 'Overview');
  const result = await (await page.request.get('/api/v1/jobs?limit=1', { headers: { 'X-Organization-Id': '00000000-0000-4000-8000-000000000001' } })).json() as { total: number };
  await expect(page.locator('.metric-card').filter({ hasText: 'Service requests' }).locator('strong')).toHaveText(result.total.toLocaleString());
  await page.screenshot({ path: '.data/redesign-overview-desktop.png', fullPage: true });
  for (const [section, heading] of [['Dispatch','Dispatch workspace'], ['Workforce','Technicians & availability'], ['Parts & locations','Parts & stock locations'], ['Inventory','Stock ledger'], ['Manuals & evidence','Equipment manual library'], ['Reports & data','Onboarding & reports'], ['Team & access','People in this company']]) {
    await openWorkspace(page, section!);
    // Only the selected workflow is exposed to keyboard and accessibility navigation.
    await expect(page.locator('.workspace-pane:not([hidden])').getByRole('heading', { name: heading!, exact: true })).toBeVisible();
    if (section === 'Manuals & evidence') { await page.getByRole('button', { name: 'Open manual library', exact: true }).click(); await page.getByRole('button', { name: 'View AI usage', exact: true }).click(); await expect(page.getByRole('region', { name: 'AI usage summary' })).toBeVisible(); }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `.data/redesign-${section!.split(' ')[0]!.toLowerCase()}-desktop.png`, fullPage: true });
  }
  await openWorkspace(page, 'Dispatch');
  await page.screenshot({ path: '.data/redesign-dispatch-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open workspace navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace sidebar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open workspace navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'New service request', exact: true }).click();
  await page.getByLabel('Complaint', { exact: true }).fill('Unsaved redesign navigation check');
  await openWorkspace(page, 'Workforce'); await openWorkspace(page, 'Dispatch');
  await expect(page.getByLabel('Complaint', { exact: true })).toHaveValue('Unsaved redesign navigation check');
  await page.getByLabel('Complaint', { exact: true }).fill('');
  page.once('dialog', (dialog) => void dialog.accept()); await page.getByRole('button', { name: 'Job queue', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.data/redesign-dispatch-mobile.png', fullPage: true });
});
