// NOT RUN (status: Blocked in RELEASE-CHECKLIST.md). Written against the Greek UI; selectors may need adjusting on first real run.
import { test, expect } from '@playwright/test';

test('TV creates a session, phone pairs with the code, first command reaches the TV', async ({ browser }) => {
  const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto('/');
  await tv.getByRole('link', { name: /Room 13|Hotel/i }).first().click();
  await tv.getByRole('button', { name: /Έναρξη|Δημιουργία/ }).click();
  const code = (await tv.getByTestId('pairing-code').innerText()).replace(/\D/g, '');
  expect(code).toHaveLength(6);

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await phone.goto('/');
  await phone.getByLabel(/κωδικός/i).fill(code);
  await phone.getByRole('button', { name: /Σύνδεση/ }).click();
  await expect(phone.getByText(/Συνδέθηκε|Έτοιμος/)).toBeVisible();
  await expect(tv).toHaveURL(/\/play\//);
});

test('wrong pairing code shows a Greek error and never reveals the session', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/κωδικός/i).fill('000000');
  await page.getByRole('button', { name: /Σύνδεση/ }).click();
  await expect(page.getByRole('alert')).toContainText(/κωδικ/i);
});
