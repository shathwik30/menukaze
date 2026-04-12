import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('super-admin shell renders accessibly', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Menukaze Super Admin' })).toBeVisible();
  await expect(page.getByText('Platform owner console')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
