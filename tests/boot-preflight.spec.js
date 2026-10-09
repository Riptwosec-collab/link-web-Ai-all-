const { test, expect } = require('@playwright/test');

// Runs before the expensive suite. On a boot failure, report what the browser
// actually observed instead of timing out in every dependent feature test.
test('browser boot preflight is ready for end-to-end tests', async ({ page }) => {
  test.setTimeout(45000); // allow diagnostics to finish even if document load is delayed
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?e2e=1', { waitUntil: 'domcontentloaded' });

  try {
    await page.locator('html.slh-v7-ready').waitFor({ state: 'attached', timeout: 8000 });
    await expect(page.locator('#smartlink-auth-gate')).toHaveClass(/hidden/);
  } catch (error) {
    const state = await page.evaluate(() => ({
      location: location.href,
      ready: document.documentElement.className,
      e2e: Boolean(window.__SLH_E2E__?.enabled),
      sessionPresent: Boolean(localStorage.getItem('smartlink_session_token')),
      bootErrors: window.__SLH_BOOT_ERRORS__ || null,
      fatalBootText: document.querySelector('.v7-boot-error')?.textContent || null,
      hasV7: Boolean(window.SmartLinkV7),
      hasV81: Boolean(window.SmartLinkV81),
      gateHidden: document.querySelector('#smartlink-auth-gate')?.classList.contains('hidden') ?? null,
    })).catch(e => ({ diagnosticsError: e.message }));
    console.error('E2E_BOOT_PREFLIGHT_FAILED', JSON.stringify({ state, errors: errors.slice(0, 15) }, null, 2));
    throw error;
  }
  expect(errors.filter(message => /boot stage failed|uncaught|unhandled/i.test(message))).toEqual([]);
});
