import { chromium } from 'playwright';
import fs from 'node:fs';

const SEARCH_URL = 'https://www.yatcoboss.com/search/home/?code=L3NlYXJjaC9zZWFyY2gvc2VhcmNoY2F0ZWdvcnkvLC9zZWFyY2gvc2VhcmNoL3Jlc3VsdHNfdjIvP2ZyZXNoU2VhcmNoPVRydWU=';
const PAGER_URL = 'https://www.yatcoboss.com/search/search/searchpager_v2/';
const PAGE_SIZE = 12;
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 600);

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ storageState: JSON.parse(fs.readFileSync('/app/auth/yatcoboss.json', 'utf8')) });
const page = await context.newPage();
await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1200);
if (/login\s*-\s*boss|name=["']username["']/i.test(await page.content())) {
  throw new Error('YATCO BOSS session expired: login page returned');
}

function form(pageNumber) {
  return {
    viewType: '1', ModifiedDate: '1/1/2025 12:00:00 AM', ActiveDateFrom: '', SoldDate: '',
    SpeedUnit: '1', LengthUnit: '2', VolumeUnit: '1', CurrencyType: '2557', WeightUnit: '4',
    Commercial: 'false', Concept: 'false', OnlyFeatured: 'false', ForCharter: 'false',
    ForCoBroker: 'false', FeaturedNotFirst: 'false', VesselSizeType: '0', ListingDate: '',
    VesselType: '0', Type: '0', Condition: '0', ListingAgreementType: '2546',
    'LOA.Start': '', 'LOA.End': '', 'PriceRange.Start': '', 'PriceRange.End': '', Builder: '',
    ModelYear: '', 'ModelYear.Start': '', 'ModelYear.End': '', 'Year.Start': '', 'Year.End': '',
    VesselName: '', Model: '', 'RefitYear.Start': '', 'RefitYear.End': '', Helipad: 'false',
    Elevator: 'false', Cockpit: 'false', FlyBridge: 'false', HandicapAccessible: 'false',
    HullID: '', MinStaterooms: '', MinSleeps: '', MinDisplacement: '', MaxDisplacement: '',
    MinDraft: '', MaxDraft: '', EngineModel: '', MaxSpeed: '', MinBeam: '', TaxPaidID: '',
    BrokerageCompany: '', BrokerName: '', Keywords: '', MLSID: '', sortId: '0',
    page: String(pageNumber), viewType: '1',
  };
}

async function extract(html) {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  return page.$$eval('table.Resulttop', (headers) => headers.map((header) => {
    const vesselName = header.querySelector('h4')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const detail = header.querySelector('button[data-vesselid], a[href*="vID="]');
    const href = detail?.getAttribute('href') ?? '';
    const vid = detail?.getAttribute('data-vesselid') ?? href.match(/vID=(\d+)/)?.[1] ?? null;
    const container = header.closest('[data-uid]') ?? header.parentElement;
    const result = container?.querySelector('table.Result');
    const fields = {};
    result?.querySelectorAll('p').forEach((p) => {
      const text = p.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const index = text.indexOf(':');
      if (index > 0) fields[text.slice(0, index).trim()] = text.slice(index + 1).trim();
    });
    const field = (name) => Object.entries(fields).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null;
    const broker = result?.querySelector('.detailBottom p')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return {
      vid, vesselName, mlsId: fields['YATCO MLS #'] ?? null, builder: fields.Builder ?? null,
      model: field('Model'), modelYear: field('Model Year') ?? field('Year Built'),
      loaText: field('Length'), staterooms: field('Staterooms'),
      priceText: field('Price'), location: field('Vessel Location'),
      brokerName: broker.replace(/^Broker:\s*/i, ''), rawText: result?.innerText ?? '',
    };
  }).filter((row) => row.vid && row.mlsId));
}

const rows = [];
const parallelPages = 8;
let stop = false;
for (let firstPage = 1; firstPage <= MAX_PAGES && !stop; firstPage += parallelPages) {
  const responses = await Promise.all(Array.from({ length: parallelPages }, (_, offset) => {
    const pageNumber = firstPage + offset;
    return context.request.post(PAGER_URL, { form: form(pageNumber), timeout: 60000 }).then(async (response) => ({ pageNumber, html: await response.text() }));
  }));
  for (const response of responses.sort((a, b) => a.pageNumber - b.pageNumber)) {
    if (/login\s*-\s*boss|name=["']username["']/i.test(response.html)) {
      throw new Error('YATCO BOSS session expired: login page returned by search pager');
    }
    const batch = await extract(response.html);
    if (!batch.length) { stop = true; break; }
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) { stop = true; break; }
  }
  if (firstPage % 25 === 1) console.error(`BOSS pages=${Math.min(firstPage + parallelPages - 1, 600)} rows=${rows.length}`);
}
await browser.close();
const unique = [...new Map(rows.map((row) => [row.mlsId, row])).values()];
if (unique.length === 0) throw new Error('YATCO BOSS returned no listings; authentication or search access must be checked');
process.stdout.write(JSON.stringify(unique));
