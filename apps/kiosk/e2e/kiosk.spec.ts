import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('kiosk attract screen renders accessibly', async ({ page }) => {
  await page.goto('/kiosk');

  await expect(page.getByRole('heading', { name: 'Tap to order' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start order' })).toBeVisible();
  await expect(page.getByText(/Welcome to/i)).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
