#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'node:fs';

const authFile = process.argv[2];
const outputFile = process.argv[3];

if (!authFile || !outputFile) {
  console.error('Usage: auth-keepalive.mjs <auth-file> <output-file>');
  process.exit(1);
}
if (!fs.existsSync(authFile)) {
  console.error(`Auth file not found: ${authFile}`);
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    const storageState = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    const previousAuthCookie = storageState.cookies?.find((cookie) => cookie.name === 'BOSSAuthCookie');
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await page.goto('https://www.yatcoboss.com/insights/home/', { waitUntil: 'domcontentloaded' });

    const hasPasswordField = (await page.locator('input[type="password"]').count()) > 0;
    if (/login|signin/i.test(page.url()) || hasPasswordField) {
      throw new Error('YATCO BOSS authentication has expired');
    }
    await page.waitForSelector('button[useractionid="756"]', { timeout: 30000 });

    const refreshedState = await context.storageState();
    const authCookie = refreshedState.cookies.find((cookie) => cookie.name === 'BOSSAuthCookie');
    if (!authCookie || !authCookie.expires || authCookie.expires * 1000 <= Date.now()) {
      throw new Error('YATCO BOSS did not return a valid authentication cookie');
    }

    const previousExpiry = previousAuthCookie?.expires ?? 0;
    const remainingMs = previousExpiry * 1000 - Date.now();
    const renewalMarginMs = 8 * 60 * 60 * 1000;
    if (remainingMs <= renewalMarginMs && authCookie.expires <= previousExpiry + 60) {
      throw new Error('YATCO BOSS did not renew a cookie that expires in less than eight hours');
    }

    fs.writeFileSync(outputFile, JSON.stringify(refreshedState, null, 2), { mode: 0o600 });
    console.log(`YATCO BOSS session valid until ${new Date(authCookie.expires * 1000).toISOString()}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
