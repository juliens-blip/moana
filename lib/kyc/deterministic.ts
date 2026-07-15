import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { KycQueryInput, KycReport, KycSource } from './types';

const MAX_SEARCH_QUERIES = 3;
const MAX_SOURCES = 5;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_PAGE_CHARS = 250_000;
const DNS_TIMEOUT_MS = 2_000;
const CRAWL_DEADLINE_MS = 12_000;

const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001::', 32],
  ['2001:db8::', 32], ['2002::', 16], ['64:ff9b:1::', 48],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');
}
BLOCKED_ADDRESSES.addAddress('::', 'ipv6');
BLOCKED_ADDRESSES.addAddress('::1', 'ipv6');

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
    if (url.username || url.password) return null;
    if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
      return null;
    }

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
  const family = isIP(address);
  if (family === 4) return BLOCKED_ADDRESSES.check(address, 'ipv4');
  if (family !== 6) return true;

  const mappedIpv4 = address.toLowerCase().match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  return BLOCKED_ADDRESSES.check(address, 'ipv6') ||
    Boolean(mappedIpv4 && BLOCKED_ADDRESSES.check(mappedIpv4, 'ipv4'));
}

async function resolvesPublicly(url: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(new URL(url).hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('DNS lookup timeout')), DNS_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readHtmlAttribute(attributes: string, name: string): string {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

export function parseDuckDuckGoResults(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const resultAnchors: Array<{ start: number; end: number; url: string | null; title: string }> = [];
  let anchor: RegExpExecArray | null;

  while ((anchor = anchorPattern.exec(html)) !== null) {
    const attributes = anchor[1];
    const className = readHtmlAttribute(attributes, 'class');
    if (!/(?:^|\s)(?:result__a|result-link)(?:\s|$)/i.test(className)) continue;

    resultAnchors.push({
      start: anchor.index,
      end: anchorPattern.lastIndex,
      url: safePublicUrl(readHtmlAttribute(attributes, 'href')),
      title: decodeHtml(anchor[2]).slice(0, 240),
    });
  }

  for (const [index, resultAnchor] of resultAnchors.entries()) {
    const url = resultAnchor.url;
    if (!url) continue;
    if (seen.has(url)) continue;

    const boundary = Math.min(
      resultAnchor.end + 2_500,
      resultAnchors[index + 1]?.start ?? html.length,
    );
    const resultHtml = html.slice(resultAnchor.end, boundary);
    const snippetMatch = resultHtml.match(
      /class\s*=\s*["'][^"']*(?:result__snippet|result-snippet)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|td)>/i,
    );

    hits.push({
      url,
      title: resultAnchor.title,
      snippet: decodeHtml(snippetMatch?.[1] ?? '').slice(0, 500),
    });
    seen.add(url);
  }

  return hits;
}

export function parseWikipediaOpenSearchResults(body: string): SearchHit[] {
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1]) || !Array.isArray(parsed[2]) || !Array.isArray(parsed[3])) {
    throw new Error('Invalid Wikipedia OpenSearch response');
  }

  const titles = parsed[1] as unknown[];
  const descriptions = parsed[2] as unknown[];
  const urls = parsed[3] as unknown[];

  return urls.flatMap((rawUrl, index) => {
    if (typeof rawUrl !== 'string') return [];
    const url = safePublicUrl(rawUrl);
    if (!url) return [];
    return [{
      url,
      title: decodeHtml(typeof titles[index] === 'string' ? titles[index] : '').slice(0, 240),
      snippet: decodeHtml(typeof descriptions[index] === 'string' ? descriptions[index] : '').slice(0, 500),
    }];
  });
}

export function parseGoogleNewsRssResults(xml: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const rawUrl = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '';
    const url = safePublicUrl(decodeHtml(rawUrl.replace(/^<!\[CDATA\[|\]\]>$/g, '')));
    if (!url || seen.has(url)) continue;

    const rawTitle = item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const rawDescription = item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '';
    hits.push({
      url,
      title: decodeHtml(rawTitle.replace(/^<!\[CDATA\[|\]\]>$/g, '')).slice(0, 240),
      snippet: decodeHtml(decodeHtml(rawDescription.replace(/^<!\[CDATA\[|\]\]>$/g, ''))).slice(0, 500),
    });
    seen.add(url);
  }

  return hits;
}

function primaryQuotedTerm(query: string): string {
  return normalizeText(query.match(/"([^"]+)"/)?.[1] ?? query);
}

function matchesPrimaryQuery(hit: SearchHit, query: string): boolean {
  const required = primaryQuotedTerm(query);
  if (!required) return false;
  return normalizeText(`${hit.title} ${hit.snippet} ${hit.url}`).includes(required);
}

async function defaultSearch(query: string): Promise<SearchHit[]> {
  const endpoints = [
    {
      name: 'wikipedia-opensearch',
      url: `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json`,
      parse: parseWikipediaOpenSearchResults,
      valid: (body: string) => {
        try {
          const parsed: unknown = JSON.parse(body);
          return Array.isArray(parsed) && parsed.length >= 4;
        } catch {
          return false;
        }
      },
    },
    {
      name: 'google-news-rss',
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`,
      parse: parseGoogleNewsRssResults,
      valid: (body: string) => /<rss\b[\s\S]*<channel\b/i.test(body),
    },
    {
      name: 'duckduckgo-html',
      url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      parse: parseDuckDuckGoResults,
      valid: (body: string) => /result__a|no results|result--no-result/i.test(body),
    },
    {
      name: 'duckduckgo-lite',
      url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
      parse: parseDuckDuckGoResults,
      valid: (body: string) => /result-link|no results/i.test(body),
    },
  ];
  let validResponseReceived = false;
  const failures: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (compatible; MoanaKYC/1.0; +https://moana-yachting.com)',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        failures.push(`${endpoint.name}:http-${response.status}`);
        continue;
      }

      const html = await readLimitedText(response);
      if (/anomaly|challenge|bots use duckduckgo/i.test(html)) {
        failures.push(`${endpoint.name}:anti-bot`);
        continue;
      }

      const hits = endpoint.parse(html);
      if (endpoint.valid(html)) validResponseReceived = true;
      const relevantHits = hits.filter((hit) => matchesPrimaryQuery(hit, query));
      if (relevantHits.length > 0) return relevantHits;
    } catch (error) {
      failures.push(`${endpoint.name}:${error instanceof Error ? error.name : 'error'}`);
      // Try the next public search endpoint before reporting an outage.
    }
  }

  if (validResponseReceived) return [];
  console.warn('[KYC search] Public providers unavailable', { failures });
  throw new Error('Public search provider unavailable');
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
  const deadline = Date.now() + CRAWL_DEADLINE_MS;

  let response: Response | null = null;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return null;
    if (!(await resolvesPublicly(currentUrl))) return null;
    response = await fetch(currentUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain',
        'User-Agent': 'Mozilla/5.0 (compatible; MoanaKYC/1.0; +https://moana-yachting.com)',
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remainingMs)),
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
  const context = input.company_name.trim() || input.country.trim();
  const professionalDomain = domain && !PUBLIC_EMAIL_DOMAINS.has(domain) ? domain : '';
  const queries = [
    name && (context || professionalDomain) ? `"${name}" "${context || professionalDomain}"` : '',
    name ? `"${name}"` : '',
    email ? `"${email}"` : '',
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

  const uniqueHits = new Map<string, SearchHit>();
  let successfulSearches = 0;
  let failedSearches = 0;
  for (const query of buildQueries(input)) {
    try {
      const hits = await search(query);
      successfulSearches += 1;
      for (const hit of hits) {
        const safeUrl = safePublicUrl(hit.url);
        if (safeUrl && !uniqueHits.has(safeUrl)) uniqueHits.set(safeUrl, { ...hit, url: safeUrl });
        if (uniqueHits.size >= MAX_SOURCES) break;
      }
      if (uniqueHits.size >= MAX_SOURCES) break;
    } catch {
      failedSearches += 1;
    }
  }

  const emailDomain = input.email.split('@')[1] ?? '';

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
    : successfulSearches === 0 && failedSearches > 0
      ? ['Moteur de recherche publique temporairement indisponible. Réessayer plus tard.']
      : failedSearches > 0
        ? ['Aucune source publique suffisamment robuste trouvée; certaines recherches ont échoué.']
        : ['Aucune source publique suffisamment robuste trouvée.'];
  report.kyc_assessment.recommended_review = hits.length > 0 ? 'manual_review' : 'insufficient_data';

  return report;
}
