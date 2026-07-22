#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const authFile = process.argv[2] ?? process.env.YATCO_AUTH_FILE ?? 'auth/yatcoboss.json';
const outFile = process.argv[3] ?? 'market-pulse.json';
const searchUrl =
  'https://www.yatcoboss.com/search/home/?code=L3NlYXJjaC9zZWFyY2gvc2VhcmNoY2F0ZWdvcnkvLC9zZWFyY2gvc2VhcmNoL3Jlc3VsdHNfdjIvP2ZyZXNoU2VhcmNoPVRydWU=';
const feeds = [
  { feedType: 'new', useractionid: '75' },
  { feedType: 'modified', useractionid: '76' },
  { feedType: 'sold', useractionid: '77' },
];

if (!fs.existsSync(authFile)) {
  console.error(`Auth file not found: ${authFile}`);
  process.exit(1);
}

function parsePriceNumber(text) {
  if (!text) return null;
  const match = String(text).match(/[\d][\d.,]*/);
  if (!match) return null;
  const value = parseFloat(match[0].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isNaN(value) ? null : value;
}

function parseHistoryPriceChange(historyText) {
  if (!historyText) return { isPriceDrop: false, priceBeforeText: null, priceAfterText: null };
  const match = historyText.match(/Price was (.+?) changed to (.+?)\.?\s*$/i);
  if (!match) return { isPriceDrop: false, priceBeforeText: null, priceAfterText: null };
  const before = match[1].trim();
  const after = match[2].trim();
  const beforeNumber = parsePriceNumber(before);
  const afterNumber = parsePriceNumber(after);
  return {
    isPriceDrop: beforeNumber !== null && afterNumber !== null ? afterNumber < beforeNumber : true,
    priceBeforeText: before,
    priceAfterText: after,
  };
}

async function assertAuthenticated(page) {
  const hasPasswordField = (await page.locator('input[type="password"]').count()) > 0;
  if (/login|signin/i.test(page.url()) || hasPasswordField) {
    throw new Error('YATCO BOSS authentication has expired');
  }
}

async function scrapeFeed(page, feedType, useractionid) {
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await assertAuthenticated(page);
  await page.waitForSelector(`button[useractionid="${useractionid}"]`, { timeout: 30000 });
  await page.click(`button[useractionid="${useractionid}"]`);
  await page.waitForTimeout(3000);

  const rows = await page.$$eval('table.Resulttop', (headers) =>
    headers.map((header) => {
      const vesselName = header.querySelector('h4')?.textContent?.trim() ?? '';
      const detailButton = header.querySelector('button[data-vesselid]');
      const vid = detailButton?.getAttribute('data-vesselid') ?? null;
      const container = header.closest('[data-uid]') ?? header.parentElement;
      const resultTable = container?.querySelector('table.Result');
      const fields = {};
      resultTable?.querySelectorAll('p').forEach((paragraph) => {
        const text = paragraph.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const separator = text.indexOf(':');
        if (separator === -1) return;
        const label = text.slice(0, separator).trim();
        const value = text.slice(separator + 1).trim();
        if (label && value) fields[label] = value;
      });
      const broker = resultTable?.querySelector('.detailBottom p')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const historyText = resultTable?.querySelector('.HistoryText')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
      return {
        vid,
        vesselName,
        mlsId: fields['YATCO MLS #'] ?? null,
        builder: fields.Builder ?? null,
        modelYear: fields['Model Year'] ?? null,
        category: fields.Category ?? null,
        loaText: fields.Length ?? null,
        priceText: fields.Price ?? null,
        location: fields['VESSEL LOCATION'] ?? null,
        soldDate: fields['Sold Date'] ?? null,
        brokerName: broker.replace(/^Broker:\s*/, ''),
        historyText,
      };
    }),
  );

  return rows
    .filter((row) => row.vid && row.vesselName)
    .map((row) => ({ feedType, ...row, ...parseHistoryPriceChange(row.historyText) }));
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
    const results = [];

    for (const { feedType, useractionid } of feeds) {
      console.log(`Scraping Market Pulse feed ${feedType}...`);
      const rows = await scrapeFeed(page, feedType, useractionid);
      if (rows.length === 0) {
        throw new Error(`YATCO Market Pulse feed ${feedType} returned no rows`);
      }
      console.log(`${feedType}: ${rows.length} rows`);
      results.push(...rows);
    }

    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2), { mode: 0o600 });
    console.log(`Wrote ${results.length} Market Pulse rows`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
