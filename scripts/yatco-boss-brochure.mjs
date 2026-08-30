import { chromium } from 'playwright';
import fs from 'node:fs';

const requestedVid = String(process.env.VID ?? '').replace(/[^0-9]/g, '');
const requestedMlsId = String(process.env.MLS_ID ?? '').replace(/[^0-9]/g, '');
if (!requestedVid && !requestedMlsId) throw new Error('VID ou MLS_ID requis');

const searchUrl = 'https://www.yatcoboss.com/search/home/?code=L3NlYXJjaC9zZWFyY2gvc2VhcmNoY2F0ZWdvcnkvLC9zZWFyY2gvc2VhcmNoL3Jlc3VsdHNfdjIvP2ZyZXNoU2VhcmNoPVRydWU=';
const pagerUrl = 'https://www.yatcoboss.com/search/search/searchpager_v2/';
const loginPage = (html) => /login\s*-\s*boss|name=["']username["']/i.test(html);
const queueAccepted = (queued) => Number(queued?.ResponseCode) === 0 && Boolean(queued?.NewIdGUID);

function form(pageNumber, mlsId = '') {
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
    BrokerageCompany: '', BrokerName: '', Keywords: '', MLSID: mlsId, sortId: '0',
    page: String(pageNumber),
  };
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync('/app/auth/yatcoboss.json', 'utf8')),
  });
  const page = await context.newPage();
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(500);
  if (loginPage(await page.content())) {
    throw new Error('YATCO BOSS session expired: login page returned');
  }

  async function queueQuickPdf(vid) {
    const response = await page.evaluate(async (listingVid) => {
      const result = await fetch(`/forsale/pdf/quickpdf/?vid=${encodeURIComponent(listingVid)}&source=1`, {
        method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      return { status: result.status, body: await result.text() };
    }, vid);
    try {
      return JSON.parse(response.body);
    } catch {
      if (loginPage(response.body)) throw new Error('YATCO BOSS session expired during quick PDF');
      throw new Error(`YATCO quickpdf HTTP ${response.status}: réponse invalide`);
    }
  }

  async function queueQuickPdfFromSearchResult(vid) {
    // BOSS refuse certaines annonces si elles n'ont pas d'abord été ouvertes
    // depuis les résultats de recherche. Reproduire le clic de l'interface est
    // important : répéter simplement POST /quickpdf avec le vID résolu renvoie
    // le même refus et ne débloque jamais la brochure.
    const detail = page.locator(
      `button[data-vesselid="${vid}"], a[data-vesselid="${vid}"], a[href*="vID=${vid}"]`
    ).first();
    if (!(await detail.count())) {
      throw new Error(`Fiche YATCO ${vid} introuvable dans le résultat MLS`);
    }

    await detail.click();
    await page.waitForTimeout(1500);
    if (loginPage(await page.content())) {
      throw new Error('YATCO BOSS session expired while opening the listing');
    }

    const quickPdf = page.getByText('Quick PDF', { exact: true }).last();
    if (!(await quickPdf.count())) {
      throw new Error(`Action Quick PDF indisponible pour l’annonce YATCO ${vid}`);
    }
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/forsale/pdf/quickpdf/'),
      { timeout: 30000 }
    );
    await quickPdf.click();
    const response = await responsePromise;
    const body = await response.text();
    try {
      return JSON.parse(body);
    } catch {
      if (loginPage(body)) throw new Error('YATCO BOSS session expired during quick PDF');
      throw new Error(`YATCO quickpdf HTTP ${response.status()}: réponse invalide`);
    }
  }

  let resolvedVid = requestedVid;
  let queued = resolvedVid ? await queueQuickPdf(resolvedVid) : null;

  // Les lignes issues du sitemap public ont le numéro MLS mais pas toujours
  // le vID interne BOSS. Le filtre MLSID évite de parcourir des centaines de
  // pages et permet d'offrir une brochure pour tout l'inventaire éligible.
  if (!queueAccepted(queued) && requestedMlsId) {
    const result = await context.request.post(pagerUrl, {
      form: form(1, requestedMlsId),
      timeout: 60000,
    });
    const html = await result.text();
    if (loginPage(html)) throw new Error('YATCO BOSS session expired during MLS search');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    resolvedVid = await page.$$eval('table.Resulttop', (headers, targetMls) => {
      for (const header of headers) {
        const container = header.closest('[data-uid]') ?? header.parentElement;
        const resultTable = container?.querySelector('table.Result');
        const resultText = resultTable?.textContent?.replace(/\s+/g, ' ') ?? '';
        if (!resultText.includes(String(targetMls))) continue;
        const detail = header.querySelector('button[data-vesselid], a[data-vesselid], a[href*="vID="]')
          ?? container?.querySelector('button[data-vesselid], a[data-vesselid], a[href*="vID="]');
        const href = detail?.getAttribute('href') ?? '';
        const vid = detail?.getAttribute('data-vesselid') ?? href.match(/vID=(\d+)/)?.[1];
        if (vid) return vid;
      }
      return null;
    }, requestedMlsId) ?? '';
    if (!resolvedVid) throw new Error(`Annonce MLS ${requestedMlsId} introuvable dans YATCO BOSS`);
    queued = await queueQuickPdfFromSearchResult(resolvedVid);
  }

  if (!queueAccepted(queued)) {
    const code = queued?.ResponseCode ?? 'inconnu';
    throw new Error(`YATCO quickpdf refusé (code ${String(code)})`);
  }

  let file = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const filesResponse = await context.request.post('https://www.yatcoboss.com/forsale/pdf/accountfilestore_read/', {
      form: { sort: '', page: '1', pageSize: '50', group: '', filter: '' },
      timeout: 60000,
    });
    const payload = await filesResponse.json();
    file = (payload.Data ?? []).find((item) => String(item.FileID) === String(queued.NewIdGUID));
    if (Number(file?.Processed) === 2 && file.URL) break;
    if (Number(file?.Processed) === 3) {
      throw new Error(`YATCO PDF generation failed: ${file.Filename ?? queued.NewIdGUID}`);
    }
  }
  if (!file?.URL) throw new Error('Le PDF YATCO est toujours en génération après 60 secondes');

  const downloadUrl = new URL(file.URL, 'https://www.yatcoboss.com');
  if (downloadUrl.protocol !== 'https:') throw new Error('YATCO a retourné une URL de brochure non sécurisée');
  process.stdout.write(JSON.stringify({
    filename: file.Filename ?? `yatco-${resolvedVid}.pdf`,
    contentType: 'application/pdf',
    url: downloadUrl.href,
    vid: resolvedVid,
  }));
} finally {
  await browser.close();
}
