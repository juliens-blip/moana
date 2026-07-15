import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { KycQueryInput, KycReport, KycSource } from './types';

const MAX_SEARCH_QUERIES = 3;
const MAX_SOURCES = 5;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_PAGE_CHARS = 250_000;

const PUBLIC_EMAIL_DOMAINS = new Set([
  'aol.com',
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'mail.com',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
]);

interface SearchHit {
  url: string;
  title: string;
  snippet: string;
}

export type KycSearch = (query: string) => Promise<SearchHit[]>;
export type KycCrawl = (hit: SearchHit) => Promise<SearchHit | null>;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function safePublicUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;

    const host = url.hostname.toLowerCase();
    const unwrappedHost = host.replace(/^\[|\]$/g, '');
    if (
      isIP(unwrappedHost) !== 0 ||
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }

    if (host.endsWith('duckduckgo.com')) {
      const redirected = url.searchParams.get('uddg');
      return redirected ? safePublicUrl(redirected) : null;
    }

    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase();
  return value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb') ||
    /^127\./.test(value) ||
    /^10\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^169\.254\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.') ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(value);
}

async function resolvesPublicly(url: string): Promise<boolean> {
  try {
    const addresses = await lookup(new URL(url).hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}

function parseDuckDuckGoResults(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const resultBlocks = html.match(/<div[^>]+class="[^"]*result[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi) ?? [];

  for (const block of resultBlocks) {
    const anchor = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      ?? block.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;

    const url = safePublicUrl(decodeHtml(anchor[1]));
    if (!url) continue;

    const snippetMatch = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    hits.push({
      url,
      title: decodeHtml(anchor[2]).slice(0, 240),
      snippet: decodeHtml(snippetMatch?.[1] ?? '').slice(0, 500),
    });
  }

  return hits;
}

async function defaultSearch(query: string): Promise<SearchHit[]> {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; MoanaKYC/1.0; +https://moana-yachting.com)',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) return [];
  return parseDuckDuckGoResults((await response.text()).slice(0, MAX_PAGE_CHARS));
}

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';

  try {
    while (result.length < MAX_PAGE_CHARS) {
      const { value, done } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return result.slice(0, MAX_PAGE_CHARS);
}

async function defaultCrawl(hit: SearchHit): Promise<SearchHit | null> {
  const initialUrl = safePublicUrl(hit.url);
  if (!initialUrl) return null;
  let currentUrl: string = initialUrl;

  let response: Response | null = null;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!(await resolvesPublicly(currentUrl))) return null;
    response = await fetch(currentUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain',
        'User-Agent': 'Mozilla/5.0 (compatible; MoanaKYC/1.0; +https://moana-yachting.com)',
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status < 300 || response.status >= 400) break;
    const redirectLocation: string | null = response.headers.get('location');
    const redirectUrl: string | null = redirectLocation
      ? safePublicUrl(new URL(redirectLocation, currentUrl).toString())
      : null;
    if (!redirectUrl) return null;
    currentUrl = redirectUrl;
    response = null;
  }

  if (!response) return null;
  const finalUrl = safePublicUrl(response.url);
  const contentType = response.headers.get('content-type') ?? '';
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (
    !response.ok ||
    !finalUrl ||
    (!contentType.includes('text/html') && !contentType.includes('text/plain')) ||
    (contentLength > 0 && contentLength > 1_000_000)
  ) {
    return null;
  }

  const html = await readLimitedText(response);
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? hit.title);
  const description = decodeHtml(
    html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1]
      ?? '',
  );
  const visibleText = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .slice(0, 80_000),
  );

  return {
    url: finalUrl,
    title: title.slice(0, 240),
    snippet: [hit.snippet, description, visibleText].filter(Boolean).join(' ').slice(0, 4_000),
  };
}

function buildQueries(input: KycQueryInput): string[] {
  const name = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const domain = email.split('@')[1] ?? '';
  const queries = [
    email ? `"${email}"` : '',
    name && domain ? `"${name}" "${domain}"` : '',
    name ? `"${name}" ${input.country || input.company_name || 'company'}` : '',
  ];

  return [...new Set(queries.filter(Boolean))].slice(0, MAX_SEARCH_QUERIES);
}

function classifySource(url: string): KycSource['type'] {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('sanction') || host.includes('ofac') || host.includes('europa.eu')) return 'sanctions_db';
  if (host.includes('company') || host.includes('registry') || host.includes('registre')) return 'official_registry';
  if (host.includes('news') || host.includes('press') || host.includes('reuters')) return 'news';
  return 'other';
}

function hostMatchesDomain(url: string, domain: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  const expected = domain.toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

function emptyReport(input: KycQueryInput): KycReport {
  const unverifiedScreening = { status: 'not_enough_data' as const, details: [] as string[] };

  return {
    query_input: input,
    identity_resolution: {
      status: 'unresolved',
      confidence_score: 0,
      matched_persons: [],
      selected_profile_rationale: '',
    },
    person_profile: {
      full_name: '', aliases: [], current_title: '', current_company: '', location: '', country: '',
      emails: [], phones: [], websites: [],
      profiles: { linkedin: '', company_profile: '', other: [] },
    },
    company_profile: {
      company_name: '', legal_form: '', status: '', jurisdiction: '', registration_number: '',
      vat_number: '', lei: '', incorporation_date: '', address: '', industry: '', directors: [],
      shareholders: [], ubo: [], subsidiaries: [],
      financials: { revenue: '', net_income: '', employees: '', share_capital: '', currency: '', year: '' },
      website: '',
    },
    risk_screening: {
      sanctions: { ...unverifiedScreening },
      pep: { ...unverifiedScreening },
      watchlists: { ...unverifiedScreening },
      offshore_leaks: { ...unverifiedScreening },
    },
    adverse_media: [],
    maritime_screening: { status: 'non_determinable', assets: [] },
    economic_coherence: { level: 'undetermined', indicators: [] },
    kyc_assessment: {
      overall_risk: 'undetermined',
      recommended_review: 'insufficient_data',
      key_reasons: [],
      missing_critical_items: ['Identité confirmée', 'Contrôles officiels sanctions/PEP', 'UBO', 'Source of wealth'],
    },
    sources: [],
  };
}

export async function buildDeterministicKycReport(
  rawInput: Partial<KycQueryInput>,
  search: KycSearch = defaultSearch,
  crawl: KycCrawl = defaultCrawl,
): Promise<KycReport> {
  const input: KycQueryInput = {
    full_name: rawInput.full_name?.trim() ?? '',
    email: rawInput.email?.trim().toLowerCase() ?? '',
    company_name: rawInput.company_name?.trim() ?? '',
    country: rawInput.country?.trim() ?? '',
    city: rawInput.city?.trim() ?? '',
  };
  const report = emptyReport(input);

  if (!input.full_name || !input.email) {
    report.kyc_assessment.key_reasons = ['Nom complet ou email manquant.'];
    return report;
  }

  const settled = await Promise.allSettled(buildQueries(input).map((query) => search(query)));
  const uniqueHits = new Map<string, SearchHit>();
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const hit of result.value) {
      const safeUrl = safePublicUrl(hit.url);
      if (safeUrl && !uniqueHits.has(safeUrl)) uniqueHits.set(safeUrl, { ...hit, url: safeUrl });
      if (uniqueHits.size >= MAX_SOURCES) break;
    }
  }

  const emailDomain = input.email.split('@')[1] ?? '';
  if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
    const companyUrl = safePublicUrl(`https://${emailDomain}`);
    if (companyUrl && !uniqueHits.has(companyUrl)) {
      uniqueHits.set(companyUrl, { url: companyUrl, title: '', snippet: '' });
    }
  }

  const seeds = [...uniqueHits.values()]
    .sort((left, right) => {
      const leftCompany = emailDomain && hostMatchesDomain(left.url, emailDomain) ? 1 : 0;
      const rightCompany = emailDomain && hostMatchesDomain(right.url, emailDomain) ? 1 : 0;
      return rightCompany - leftCompany;
    })
    .slice(0, MAX_SOURCES);
  const crawled = await Promise.allSettled(seeds.map((hit) => crawl(hit)));
  const hits = seeds
    .map((seed, index) => {
      const result = crawled[index];
      if (result.status === 'fulfilled' && result.value) return result.value;
      return seed.title || seed.snippet ? seed : null;
    })
    .filter((hit): hit is SearchHit => hit !== null);
  const combinedEvidence = normalizeText(hits.map((hit) => `${hit.title} ${hit.snippet} ${hit.url}`).join(' '));
  const normalizedName = normalizeText(input.full_name);
  const exactEmailFound = combinedEvidence.includes(normalizeText(input.email));
  const exactNameFound = normalizedName.length > 2 && combinedEvidence.includes(normalizedName);
  const professionalDomainFound = Boolean(
    emailDomain &&
    !PUBLIC_EMAIL_DOMAINS.has(emailDomain) &&
    hits.some((hit) => hostMatchesDomain(hit.url, emailDomain)),
  );

  report.sources = hits.map((hit) => ({
    type: emailDomain && hostMatchesDomain(hit.url, emailDomain)
      ? 'company_website'
      : classifySource(hit.url),
    url: hit.url,
    note: [hit.title, hit.snippet].filter(Boolean).join(' — ').slice(0, 500),
  }));

  const evidence: string[] = [];
  if (exactEmailFound) evidence.push('Adresse email exacte présente dans un résultat public.');
  if (exactNameFound) evidence.push('Nom complet exact présent dans les résultats collectés.');
  if (professionalDomainFound && (exactEmailFound || exactNameFound)) {
    evidence.push('Source concordante trouvée sur le domaine professionnel de l’email.');
  }

  if (exactEmailFound && exactNameFound) {
    report.identity_resolution.status = 'probable';
    report.identity_resolution.confidence_score = professionalDomainFound ? 70 : 60;
  } else if (exactNameFound && professionalDomainFound) {
    report.identity_resolution.status = 'probable';
    report.identity_resolution.confidence_score = 55;
  } else if (exactEmailFound || exactNameFound) {
    report.identity_resolution.status = 'ambiguous';
    report.identity_resolution.confidence_score = exactEmailFound ? 45 : 30;
  }

  if (evidence.length > 0) {
    report.identity_resolution.matched_persons = [{
      name: input.full_name,
      headline: '',
      location: input.city || input.country,
      company: input.company_name,
      evidence,
    }];
    report.identity_resolution.selected_profile_rationale =
      'Attribution textuelle uniquement; confirmation humaine requise avant décision KYC.';
  }

  report.person_profile.full_name = evidence.length > 0 ? input.full_name : '';
  report.person_profile.country = evidence.length > 0 ? input.country : '';
  report.person_profile.emails = exactEmailFound ? [input.email] : [];
  report.person_profile.websites = report.sources.map((source) => source.url);
  report.person_profile.profiles.linkedin = report.sources.find((source) => source.type === 'linkedin')?.url ?? '';

  if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
    report.company_profile.website = `https://${emailDomain}`;
  }

  report.kyc_assessment.key_reasons = hits.length > 0
    ? [
        `${hits.length} source(s) publique(s) collectée(s).`,
        'Contrôles sanctions/PEP non conclusifs sans registre officiel intégré.',
      ]
    : ['Aucune source publique suffisamment robuste trouvée.'];
  report.kyc_assessment.recommended_review = hits.length > 0 ? 'manual_review' : 'insufficient_data';

  return report;
}
