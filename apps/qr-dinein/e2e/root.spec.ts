import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('qr dine-in shell resolves tenant context accessibly', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Menukaze QR Dine-In' })).toBeVisible();
  await expect(page.getByText('Scan a table QR for demo')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
