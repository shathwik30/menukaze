import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('kiosk shell renders its phase-4 placeholder accessibly', async ({ page }) => {
  await page.goto('/kiosk');

  await expect(page.getByRole('heading', { name: 'Tap to Start' })).toBeVisible();
  await expect(page.getByText('Welcome to demo')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
