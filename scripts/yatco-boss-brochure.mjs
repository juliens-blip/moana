import { chromium } from 'playwright';
import fs from 'node:fs';

const vid = String(process.env.VID ?? '').replace(/[^0-9]/g, '');
if (!vid) throw new Error('VID requis');
const searchUrl = 'https://www.yatcoboss.com/search/home/?code=L3NlYXJjaC9zZWFyY2gvc2VhcmNoY2F0ZWdvcnkvLC9zZWFyY2gvc2VhcmNoL3Jlc3VsdHNfdjIvP2ZyZXNoU2VhcmNoPVRydWU=';
const pagerUrl = 'https://www.yatcoboss.com/search/search/searchpager_v2/';
const form = (pageNumber) => ({ viewType: '1', ModifiedDate: '1/1/2025 12:00:00 AM', ActiveDateFrom: '', SoldDate: '', SpeedUnit: '1', LengthUnit: '2', VolumeUnit: '1', CurrencyType: '2557', WeightUnit: '4', Commercial: 'false', Concept: 'false', OnlyFeatured: 'false', ForCharter: 'false', ForCoBroker: 'false', FeaturedNotFirst: 'false', VesselSizeType: '0', ListingDate: '', VesselType: '0', Type: '0', Condition: '0', ListingAgreementType: '2546', 'LOA.Start': '', 'LOA.End': '', 'PriceRange.Start': '', 'PriceRange.End': '', Builder: '', ModelYear: '', 'ModelYear.Start': '', 'ModelYear.End': '', 'Year.Start': '', 'Year.End': '', VesselName: '', Model: '', 'RefitYear.Start': '', 'RefitYear.End': '', Helipad: 'false', Elevator: 'false', Cockpit: 'false', FlyBridge: 'false', HandicapAccessible: 'false', HullID: '', MinStaterooms: '', MinSleeps: '', MinDisplacement: '', MaxDisplacement: '', MinDraft: '', MaxDraft: '', EngineModel: '', MaxSpeed: '', MinBeam: '', TaxPaidID: '', BrokerageCompany: '', BrokerName: '', Keywords: '', MLSID: '', sortId: '0', page: String(pageNumber) });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ storageState: JSON.parse(fs.readFileSync('/app/auth/yatcoboss.json', 'utf8')) });
const page = await context.newPage();
await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(500);
// Most listings accept the authenticated quickpdf call directly. This avoids
// scanning the entire pager (which made the local download appear to hang).
let queued = await page.evaluate(async (listingVid) => {
  const response = await fetch(`/forsale/pdf/quickpdf/?vid=${encodeURIComponent(listingVid)}&source=1`, {
    method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  return await response.json();
}, vid);
// BOSS authorizes PDF creation only after the listing has been opened through
// the search UI. Find the result in the same pager used by the live scraper.
let resultHtml = null;
if (queued?.ResponseCode !== 0 || !queued.NewIdGUID) for (let pageNumber = 1; pageNumber <= 120 && !resultHtml; pageNumber += 1) {
  const result = await context.request.post(pagerUrl, { form: form(pageNumber), timeout: 60000 });
  const html = await result.text();
  if (html.includes(`vID=${vid}`)) resultHtml = html;
  if (!html.includes('Resulttop')) break;
}
if (!queued?.NewIdGUID || queued.ResponseCode !== 0) {
  if (!resultHtml) throw new Error(`Annonce ${vid} introuvable ou brochure non accessible dans YATCO`);
await page.setContent(resultHtml, { waitUntil: 'domcontentloaded' });
const detail = page.locator(`a[href*="/search/vesseldetails/viewlisting"][href*="vID=${vid}"], button[href*="/search/vesseldetails/viewlisting"][href*="vID=${vid}"]`).first();
if (!(await detail.count())) throw new Error(`Fiche ${vid} introuvable dans le résultat YATCO`);
await detail.click();
await page.waitForTimeout(1500);
const quickPdf = page.getByText('Quick PDF', { exact: true }).last();
if (!(await quickPdf.count())) throw new Error(`Action Quick PDF indisponible pour ${vid}`);
const quickPdfResponse = page.waitForResponse(response => response.url().includes('/forsale/pdf/quickpdf/'), { timeout: 30000 });
await quickPdf.click();
queued = await (await quickPdfResponse).json();
}

if (queued?.ResponseCode !== 0 || !queued.NewIdGUID) throw new Error(`YATCO quickpdf refusé: ${JSON.stringify(queued)}`);

let file = null;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  const filesResponse = await context.request.post('https://www.yatcoboss.com/forsale/pdf/accountfilestore_read/', {
    form: { sort: '', page: '1', pageSize: '50', group: '', filter: '' }, timeout: 60000,
  });
  const payload = await filesResponse.json();
  file = (payload.Data ?? []).find(item => item.FileID === queued.NewIdGUID);
  if (file?.Processed === 2 && file.URL) break;
  if (file?.Processed === 3) throw new Error(`YATCO PDF generation failed: ${file.Filename ?? queued.NewIdGUID}`);
}
if (!file?.URL) throw new Error('Le PDF YATCO est toujours en génération après 60 secondes');
const pdf = await context.request.get(file.URL, { timeout: 60000 });
if (!pdf.ok()) throw new Error(`Téléchargement S3 HTTP ${pdf.status()}`);
const body = await pdf.body();
process.stdout.write(JSON.stringify({ filename: file.Filename ?? `yatco-${vid}.pdf`, contentType: 'application/pdf', base64: body.toString('base64') }));
await browser.close();
