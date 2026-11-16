import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const accounts = JSON.parse(readFileSync('.data/local-accounts.json', 'utf8')) as { email: string; password: string }[];
const alpha = '00000000-0000-4000-8000-000000000001';
const beta = '00000000-0000-4000-8000-000000000002';
async function signIn(page: Page, email: string, url = '/') {
  const account = accounts.find((entry) => entry.email === email);
  if (!account) throw new Error('Run pnpm setup:env before browser tests');
  await page.goto(url);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.locator('#username').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#kc-login').click();
  await expect(page.getByRole('heading', { name: 'Your team. Your workspace.' })).toBeVisible();
}

test('real OIDC login, company selection and cross-company protection', async ({ page, context }) => {
  await signIn(page, 'owner.alpha@example.test');
  const cookie = (await context.cookies()).find((entry) => entry.name === 'sg_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  await page.getByRole('button', { name: /Fictional Cooling Alpha/ }).click();
  await expect(page.getByRole('heading', { name: 'People in this company' })).toBeVisible();
  const forbidden = await page.request.get(`/api/v1/organizations/${beta}`, { headers: { 'X-Organization-Id': alpha } });
  expect(forbidden.status()).toBe(404);
  await page.getByRole('button', { name: /Fictional Cooling Beta/ }).click();
  await expect(page.getByRole('heading', { name: 'People in this company' })).toHaveCount(0);
  const members = await page.request.get('/api/v1/memberships', { headers: { 'X-Organization-Id': beta } });
  expect(members.status()).toBe(403);
});

test('technician sees only their company and cannot use owner endpoints on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'technician.alpha@example.test');
  await expect(page.getByRole('button', { name: /Fictional Cooling Beta/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Fictional Cooling Alpha/ }).click();
  await expect(page.getByText('TECHNICIAN', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/audit-events', { headers: { 'X-Organization-Id': alpha } })).status()).toBe(403);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('owner creates a private invitation link and can sign out', async ({ page }) => {
  await signIn(page, 'owner.alpha@example.test');
  await page.getByRole('button', { name: /Fictional Cooling Alpha/ }).click();
  await page.getByLabel('Email address', { exact: true }).fill(`browser-${Date.now()}@example.test`);
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.getByLabel('Invitation link', { exact: true })).toHaveValue(/#invite=[A-Za-z0-9_-]{43}$/);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/auth/session')).status()).toBe(401);
});

test('invited user signs in, accepts the link and joins only the invited company', async ({ page, browser }) => {
  await signIn(page, 'owner.alpha@example.test');
  await page.getByRole('button', { name: /Fictional Cooling Alpha/ }).click();
  await page.getByLabel('Email address', { exact: true }).fill('new.member@example.test');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const link = page.getByLabel('Invitation link', { exact: true });
  await expect(link).toHaveValue(/#invite=[A-Za-z0-9_-]{43}$/);
  const recipient = await browser.newContext();
  try {
    const invitedPage = await recipient.newPage();
    await signIn(invitedPage, 'new.member@example.test', await link.inputValue());
    await invitedPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(invitedPage.getByRole('button', { name: /Fictional Cooling Alpha/ })).toBeVisible();
    await expect(invitedPage.getByRole('button', { name: /Fictional Cooling Beta/ })).toHaveCount(0);
    await invitedPage.getByRole('button', { name: /Fictional Cooling Alpha/ }).click();
    await expect(invitedPage.getByText('TECHNICIAN', { exact: true })).toBeVisible();
  } finally {
    await recipient.close();
    const current = await (await page.request.get('/api/auth/session')).json() as { csrfToken: string };
    const team = await (await page.request.get('/api/v1/memberships', { headers: { 'X-Organization-Id': alpha } })).json() as { items: { id: string; email: string }[] };
    const member = team.items.find((entry) => entry.email === 'new.member@example.test');
    if (member) {
      const response = await page.request.patch(`/api/v1/memberships/${member.id}`, { headers: { 'X-Organization-Id': alpha, 'X-CSRF-Token': current.csrfToken, Origin: process.env.E2E_BASE_URL ?? 'http://localhost:8080' }, data: { role: 'TECHNICIAN', active: false } });
      expect(response.status()).toBe(200);
    }
  }
});
