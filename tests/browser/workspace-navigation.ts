import { expect, type Page } from '@playwright/test';
export async function openWorkspace(page: Page, section: string) {
  const nav = page.getByRole('navigation', { name: 'Workspace navigation', exact: true });
  const button = nav.getByRole('button', { name: section, exact: true });
  const toggle = page.locator('.app-topbar .mobile-menu');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await button.click();
  await expect(page.locator('.topbar-breadcrumb strong')).toHaveText(section);
}
