#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const authFile = process.argv[2] ?? process.env.YATCO_AUTH_FILE ?? 'auth/yatcoboss.json';
const outFile = process.argv[3] ?? 'market-review.json';

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

function parseTable(page, headingText) {
  return page.evaluate((heading) => {
    const headings = Array.from(document.querySelectorAll('h3, h4, .title, strong'));
    const headingElement = headings.find((element) => element.textContent?.trim().includes(heading));
    if (!headingElement) return null;

    let table = headingElement.nextElementSibling;
    let guard = 0;
    while (table && table.tagName !== 'TABLE' && guard < 10) {
      table = table.querySelector('table') || table.nextElementSibling;
      guard += 1;
    }
    if (!table || table.tagName !== 'TABLE') return null;

    const rows = Array.from(table.querySelectorAll('tr'));
    const headers = Array.from(rows[0]?.querySelectorAll('th, td') ?? []).map(
      (cell) => cell.textContent?.trim() ?? '',
    );
    const years = headers.slice(1);
    const result = {};
    for (const row of rows.slice(1)) {
      const cells = Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() ?? '');
      if (!cells[0]) continue;
      result[cells[0]] = {};
      years.forEach((year, index) => {
        result[cells[0]][year] = cells[index + 1] ?? null;
      });
    }
    return result;
  }, headingText);
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

    console.log('Loading YATCO Market Review...');
    await page.goto('https://www.yatcoboss.com/insights/home/', { waitUntil: 'domcontentloaded' });
    await assertAuthenticated(page);
    await page.waitForSelector('button[useractionid="757"]', { timeout: 30000 });
    await page.click('button[useractionid="757"]');
    await page.waitForTimeout(1500);
    await page.waitForSelector('button[useractionid="781"]', { timeout: 30000 });
    await page.click('button[useractionid="781"]');
    await page.waitForTimeout(3000);

    const output = {
      soldVessels: await parseTable(page, 'Sold Vessels by Size Range'),
      totalSoldValue: await parseTable(page, 'Total Sold Value'),
      avgDaysOnMarket: await parseTable(page, 'Average Days on Market'),
    };

    for (const [section, value] of Object.entries(output)) {
      if (!value || Object.keys(value).length === 0) {
        throw new Error(`YATCO Market Review section ${section} is empty`);
      }
    }

    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2), { mode: 0o600 });
    console.log('Wrote a complete Market Review snapshot');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
