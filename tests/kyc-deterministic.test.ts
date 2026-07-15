import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeterministicKycReport,
  parseDuckDuckGoResults,
  parseMojeekResults,
} from '../lib/kyc/deterministic';

test('keeps risk undetermined while resolving converging public identity evidence', async () => {
  const report = await buildDeterministicKycReport(
    {
      full_name: 'Jane Example',
      email: 'jane@example.com',
      company_name: 'Example Yachting',
      country: 'France',
      city: 'Antibes',
    },
    async () => [{
      url: 'https://example.com/team/jane-example',
      title: 'Jane Example — Example Yachting',
      snippet: 'Contact Jane Example at jane@example.com.',
    }],
    async (hit) => hit.title || hit.snippet ? hit : null,
  );

  assert.equal(report.identity_resolution.status, 'probable');
  assert.equal(report.identity_resolution.confidence_score, 70);
  assert.equal(report.kyc_assessment.overall_risk, 'undetermined');
  assert.equal(report.kyc_assessment.recommended_review, 'manual_review');
  assert.equal(report.risk_screening.sanctions.status, 'not_enough_data');
  assert.equal(report.sources.length, 1);
});

test('returns a silent insufficient-data result when no robust source is found', async () => {
  const report = await buildDeterministicKycReport(
    { full_name: 'Unknown Person', email: 'unknown@gmail.com' },
    async () => [],
  );

  assert.equal(report.identity_resolution.status, 'unresolved');
  assert.equal(report.identity_resolution.confidence_score, 0);
  assert.equal(report.kyc_assessment.recommended_review, 'insufficient_data');
  assert.deepEqual(report.sources, []);
});

test('does not search without the minimum name and email input', async () => {
  let calls = 0;
  const report = await buildDeterministicKycReport(
    { full_name: 'Name Only', email: '' },
    async () => {
      calls += 1;
      return [];
    },
  );

  assert.equal(calls, 0);
  assert.equal(report.identity_resolution.status, 'unresolved');
  assert.equal(report.kyc_assessment.recommended_review, 'insufficient_data');
});

test('parses DuckDuckGo HTML and Lite result links regardless of attribute order', () => {
  const html = `
    <div class="result">
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fprofile" class="result__a">Jane Doe</a>
      <a class="result__snippet">Jane Doe — Managing Director</a>
    </div>
    <tr>
      <td><a rel="nofollow" href="https://example.org/about" class='result-link'>Company profile</a></td>
      <td class='result-snippet'>Official company biography</td>
    </tr>
  `;

  const hits = parseDuckDuckGoResults(html);

  assert.deepEqual(hits.map((hit) => hit.url), [
    'https://example.com/profile',
    'https://example.org/about',
  ]);
  assert.match(hits[0].snippet, /Managing Director/);
  assert.match(hits[1].snippet, /Official company biography/);
});

test('rejects unsafe or duplicate result URLs before crawling', () => {
  const html = `
    <a class="result__a" href="javascript:alert(1)">Unsafe scheme</a>
    <a class="result__a" href="http://127.0.0.1/admin">Loopback</a>
    <a class="result__a" href="http://169.254.169.254/latest/meta-data">Cloud metadata</a>
    <a class="result__a" href="https://example.com:8443/admin">Non-standard port</a>
    <a class="result__a" href="https://user:pass@example.com/private">Embedded credentials</a>
    <a class="result__a" href="https://example.com/profile">Public</a>
    <a class="result__a" href="https://example.com/profile#duplicate">Duplicate</a>
  `;

  const hits = parseDuckDuckGoResults(html);

  assert.deepEqual(hits.map((hit) => hit.url), ['https://example.com/profile']);
});

test('does not borrow a snippet from the next search result', () => {
  const html = `
    <div class="result"><a class="result__a" href="https://first.example/profile">First Person</a></div>
    <div class="result">
      <a class=result__a href=https://second.example/profile>Second Person</a>
      <a class="result__snippet">Second Person second@example.com</a>
    </div>
  `;

  const hits = parseDuckDuckGoResults(html);

  assert.equal(hits[0].snippet, '');
  assert.equal(hits[1].snippet, 'Second Person second@example.com');
});

test('parses Mojeek results without crossing their list-item boundary', () => {
  const html = `
    <li class="r1">
      <h2><a class="title" href="https://first.example/profile">First Person</a></h2>
    </li>
    <li class="r2">
      <h2><a href="https://second.example/profile" class="title">Second Person</a></h2>
      <p class="s">Second Person second@example.com</p>
    </li>
  `;

  const hits = parseMojeekResults(html);

  assert.equal(hits[0].snippet, '');
  assert.equal(hits[1].snippet, 'Second Person second@example.com');
});

test('searches a public-email lead by exact name without adding a generic company term', async () => {
  const queries: string[] = [];
  await buildDeterministicKycReport(
    {
      full_name: 'Jane Doe',
      email: 'jane.doe@gmail.com',
      company_name: '',
      country: '',
      city: '',
    },
    async (query) => {
      queries.push(query);
      return [];
    },
    async () => null,
  );

  assert.ok(queries.includes('"Jane Doe"'));
  assert.ok(!queries.some((query) => query.includes('gmail.com') && query.includes('Jane Doe')));
  assert.ok(!queries.some((query) => /\bcompany\b/i.test(query)));
});

test('distinguishes a search-provider outage from a genuine empty result', async () => {
  const report = await buildDeterministicKycReport(
    {
      full_name: 'Jane Doe',
      email: 'jane@example.net',
      company_name: '',
      country: '',
      city: '',
    },
    async () => {
      throw new Error('provider unavailable');
    },
    async () => null,
  );

  assert.deepEqual(report.kyc_assessment.key_reasons, [
    'Moteur de recherche publique temporairement indisponible. Réessayer plus tard.',
  ]);
});

test('never crawls an email domain unless search returned it as a source', async () => {
  let crawlCalls = 0;
  const report = await buildDeterministicKycReport(
    {
      full_name: 'Jane Doe',
      email: 'jane@untrusted-domain.example',
      company_name: '',
      country: '',
      city: '',
    },
    async () => [],
    async () => {
      crawlCalls += 1;
      return null;
    },
  );

  assert.equal(crawlCalls, 0);
  assert.equal(report.sources.length, 0);
});
