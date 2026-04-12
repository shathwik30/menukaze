import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('login page renders the auth form accessibly', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('signup page renders the onboarding entrypoint accessibly', async ({ page }) => {
  await page.goto('/signup');

  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
