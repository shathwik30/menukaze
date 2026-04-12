import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('seeded storefront renders the live demo tenant', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Demo Restaurant' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chef Specials' })).toBeVisible();
  await expect(page.getByText('Paneer Tikka')).toBeVisible();
  await expect(page.getByText('Masala Lemon Soda')).toBeVisible();
  await expect(page.getByPlaceholder('Search menu…')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
