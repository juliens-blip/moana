import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeterministicKycReport } from '../lib/kyc/deterministic';

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
