#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const authFile = process.argv[2] ?? process.env.YATCO_AUTH_FILE ?? 'auth/yatcoboss.json';
const outFile = process.argv[3] ?? 'vessel-stats.json';

if (!fs.existsSync(authFile)) {
  console.error(`Auth file not found: ${authFile}`);
  process.exit(1);
}

async function assertAuthenticated(page) {
  const hasPasswordField = (await page.locator('input[type="password"]').count()) > 0;
  if (/login|signin/i.test(page.url()) || hasPasswordField) {
    throw new Error('YATCO BOSS authentication has expired');
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    const storageState = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    console.log('Loading YATCO Vessel Statistics...');
    await page.goto('https://www.yatcoboss.com/insights/home/', { waitUntil: 'domcontentloaded' });
    await assertAuthenticated(page);

    await page.waitForSelector('button[useractionid="756"]', { timeout: 30000 });
    await page.click('button[useractionid="756"]');
    await page.waitForTimeout(1500);
    await page.waitForSelector('button[useractionid="769"]', { timeout: 30000 });
    await page.click('button[useractionid="769"]');
    await page.waitForTimeout(2000);
    await page.click('input[value="Generate Report"]');
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('#VesselStatisticsGrid tbody tr')).some(
          (row) => !row.classList.contains('k-no-data') && row.querySelectorAll('td').length >= 8,
        ),
      { timeout: 30000 },
    );

    const rows = await page.$$eval('#VesselStatisticsGrid tbody tr', (tableRows) =>
      tableRows
        .filter((row) => !row.classList.contains('k-no-data'))
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '');
          return {
            mlsId: (cells[0] || '').replace(/^YATCO MLS #:\s*/i, '').trim() || null,
            vesselName: cells[1] || '',
            loaText: cells[2] || '',
            impressions: parseInt(cells[3], 10) || 0,
            detailViews: parseInt(cells[4], 10) || 0,
            phoneClicks: parseInt(cells[5], 10) || 0,
            galleryViews: parseInt(cells[6], 10) || 0,
            leads: parseInt(cells[7], 10) || 0,
          };
        })
        .filter((row) => row.vesselName),
    );

    if (rows.length === 0) {
      throw new Error('YATCO Vessel Statistics returned no vessel rows');
    }

    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(rows, null, 2), { mode: 0o600 });
    console.log(`Wrote ${rows.length} vessel statistics rows`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
