/**
 * Brochure Video Upload Tests
 *
 * Tests handleBrochureVideoUpload (the injectable core used by
 * app/api/brochure-video/route.ts's POST, kept in lib/ because a Next.js
 * route.ts module may only export HTTP method handlers and route config)
 * with a fully simulated SSH executor — no network, no MOANA_SSH_KEY, no
 * secret ever touched.
 *
 * Tests:
 * - Rejects a missing/empty file, non-PDF MIME, non-.pdf extension,
 *   oversized file and a file without the %PDF- signature — all before any
 *   SSH call is made
 * - A valid PDF returns 200 with exactly {jobId, statusUrl}, jobId matches
 *   the strict frontend contract ^[A-Za-z0-9]{16,32}$ (a subset of the
 *   backend's ^[A-Za-z0-9_-]{1,128}$), and statusUrl points at
 *   /api/brochure-video/{jobId}/status
 * - createProductionDeps requires MOANA_SSH_HOST (throws a controlled
 *   configuration error, never falls back to a hardcoded host) and, once
 *   configured, generates cryptographically random, unique, 16-32 char
 *   alphanumeric jobIds without touching the network
 * - The remote layout (mkdir, input.pdf, manifest.json with a 64-hex
 *   document_digest, each written to a .tmp path then renamed atomically) is
 *   created before `sudo systemctl --no-block start moana-brochure-video@{jobId}` is
 *   observed, exactly once, with no extra arguments
 * - An SSH failure (non-zero exit code) returns a 5xx with a generic message
 *   that never echoes runSsh's stderr/stdout
 * - POST rejects unauthenticated callers with 401 before any MOANA_SSH_KEY
 *   access (static source check on route.ts — getSession() requires a real
 *   Next.js request scope unavailable to a bare script, same constraint
 *   documented in tests/frontend/yatco-stats.test.ts)
 *
 * Run: npx tsx tests/frontend/brochure-video-route.test.ts
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  createProductionDeps,
  handleBrochureVideoUpload,
  type BrochureVideoDeps,
} from '@/lib/brochure-video-upload';

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app/api/brochure-video/route.ts'),
  'utf-8'
);

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function run(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ test: name, passed: true });
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ test: name, passed: false, error: message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${message}`);
  }
}

const VALID_PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('fake body')]);
const JOB_ID_RE = /^[A-Za-z0-9]{16,32}$/;

function buildRequest(formData: FormData): NextRequest {
  return new NextRequest('http://localhost/api/brochure-video', {
    method: 'POST',
    body: formData,
  });
}

function pdfFormData(overrides: Partial<{ bytes: Buffer; name: string; type: string }> = {}): FormData {
  const bytes = overrides.bytes ?? VALID_PDF_BYTES;
  const name = overrides.name ?? 'brochure.pdf';
  const type = overrides.type ?? 'application/pdf';
  const formData = new FormData();
  formData.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return formData;
}

interface RecordedCall {
  command: string;
  input?: Buffer | string;
}

function fakeDeps(overrides: Partial<{
  jobId: string;
  calls: RecordedCall[];
  failOn: (command: string) => boolean;
}> = {}): { deps: BrochureVideoDeps; calls: RecordedCall[] } {
  const calls = overrides.calls ?? [];
  const jobId = overrides.jobId ?? 'a1b2c3d4e5f6g7h8i9j0k1l2';
  const deps: BrochureVideoDeps = {
    generateJobId: () => jobId,
    runSsh: async (command, opts) => {
      calls.push({ command, input: opts?.input });
      if (overrides.failOn?.(command)) {
        return { code: 1, stdout: '', stderr: 'boom: secret-should-not-leak' };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  };
  return { deps, calls };
}

async function main() {

await run('rejects a missing file field before any SSH call', async () => {
  const { deps, calls } = fakeDeps();
  const response = await handleBrochureVideoUpload(buildRequest(new FormData()), deps);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

await run('rejects a non-PDF MIME type before any SSH call', async () => {
  const { deps, calls } = fakeDeps();
  const formData = pdfFormData({ type: 'image/png' });
  const response = await handleBrochureVideoUpload(buildRequest(formData), deps);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

await run('rejects a non-.pdf extension before any SSH call', async () => {
  const { deps, calls } = fakeDeps();
  const formData = pdfFormData({ name: 'brochure.txt' });
  const response = await handleBrochureVideoUpload(buildRequest(formData), deps);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

await run('rejects content without the %PDF- signature before any SSH call', async () => {
  const { deps, calls } = fakeDeps();
  const formData = pdfFormData({ bytes: Buffer.from('not a pdf at all') });
  const response = await handleBrochureVideoUpload(buildRequest(formData), deps);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

await run('rejects an oversized file before any SSH call', async () => {
  const { deps, calls } = fakeDeps();
  const oversized = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(51 * 1024 * 1024, 0x41)]);
  const formData = pdfFormData({ bytes: oversized });
  const response = await handleBrochureVideoUpload(buildRequest(formData), deps);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

await run('a valid PDF returns 200 with exactly {jobId, statusUrl} conforming to the frontend contract', async () => {
  const { deps } = fakeDeps({ jobId: 'abc123DEF456ghi789JKL012' });
  const response = await handleBrochureVideoUpload(buildRequest(pdfFormData()), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['jobId', 'statusUrl']);
  assert.equal(body.jobId, 'abc123DEF456ghi789JKL012');
  assert.match(body.jobId, JOB_ID_RE);
  assert.equal(body.statusUrl, `/api/brochure-video/${body.jobId}/status`);
});

await run('createProductionDeps throws a controlled configuration error when MOANA_SSH_HOST is missing, never falling back to a hardcoded host', () => {
  const previous = process.env.MOANA_SSH_HOST;
  delete process.env.MOANA_SSH_HOST;
  try {
    assert.throws(
      () => createProductionDeps('/nonexistent/fake-key-path'),
      (error: unknown) => error instanceof Error && error.message === 'Configuration serveur manquante: MOANA_SSH_HOST'
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MOANA_SSH_HOST;
    } else {
      process.env.MOANA_SSH_HOST = previous;
    }
  }
});

await run('createProductionDeps generates cryptographically random, unique, 16-32 char alphanumeric jobIds without touching the network', () => {
  const previous = process.env.MOANA_SSH_HOST;
  process.env.MOANA_SSH_HOST = 'ubuntu@203.0.113.10';
  try {
    const { generateJobId } = createProductionDeps('/nonexistent/fake-key-path');
    const ids = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const id = generateJobId();
      assert.match(id, JOB_ID_RE);
      ids.add(id);
    }
    assert.equal(ids.size, 50, 'generated ids must be unique across repeated calls');
  } finally {
    if (previous === undefined) {
      delete process.env.MOANA_SSH_HOST;
    } else {
      process.env.MOANA_SSH_HOST = previous;
    }
  }
});

await run('creates the remote job layout before starting the unit, and the SSH call observes exactly systemctl start moana-brochure-video@{jobId}', async () => {
  const jobId = 'jobObserved1abcdEFGH5678';
  const { deps, calls } = fakeDeps({ jobId });
  const response = await handleBrochureVideoUpload(buildRequest(pdfFormData()), deps);
  assert.equal(response.status, 200);

  const startCalls = calls.filter((call) => call.command === `sudo systemctl --no-block start moana-brochure-video@${jobId}`);
  assert.equal(startCalls.length, 1, 'expected exactly one systemctl start call with the exact contract string');

  const jobDir = `/home/ubuntu/moana/var/brochure-video-jobs/${jobId}`;
  const startIndex = calls.findIndex((call) => call.command.startsWith('sudo systemctl --no-block start'));
  const pdfIndex = calls.findIndex(
    (call) => call.command === `cat > ${jobDir}/input.pdf.tmp && mv -f ${jobDir}/input.pdf.tmp ${jobDir}/input.pdf`
  );
  const manifestIndex = calls.findIndex(
    (call) => call.command === `cat > ${jobDir}/manifest.json.tmp && mv -f ${jobDir}/manifest.json.tmp ${jobDir}/manifest.json`
  );
  const mkdirIndex = calls.findIndex((call) => call.command === `mkdir -p ${jobDir}`);

  assert.ok(mkdirIndex >= 0 && pdfIndex >= 0 && manifestIndex >= 0 && startIndex >= 0, 'all four remote steps must be observed');
  assert.ok(mkdirIndex < pdfIndex, 'mkdir must happen before the pdf transfer');
  assert.ok(pdfIndex < manifestIndex, 'pdf must be written (and renamed into place) before the manifest');
  assert.ok(manifestIndex < startIndex, 'the layout must exist before systemctl start');

  const expectedDigest = createHash('sha256').update(VALID_PDF_BYTES).digest('hex');
  const manifestCall = calls[manifestIndex];
  const manifestBody = JSON.parse(String(manifestCall.input));
  assert.equal(manifestBody.document_digest, expectedDigest);
  assert.match(manifestBody.document_digest, /^[0-9a-f]{64}$/);
});

await run('an SSH failure returns a 5xx without leaking stderr/stdout', async () => {
  const jobId = 'jobFails1abcdEFGH5678wxyz';
  const { deps } = fakeDeps({ jobId, failOn: (command) => command.startsWith('sudo systemctl --no-block start') });
  const response = await handleBrochureVideoUpload(buildRequest(pdfFormData()), deps);
  assert.ok(response.status >= 500 && response.status < 600);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.ok(!JSON.stringify(body).includes('secret-should-not-leak'));
});

await run('POST requires an authenticated session before any SSH/config work', () => {
  const sessionGuardIndex = routeSource.indexOf('const session = await getSession();');
  const sshKeyReadIndex = routeSource.indexOf('const sshKey = process.env.MOANA_SSH_KEY;');
  assert.ok(/import \{ getSession \} from '@\/lib\/supabase\/auth';/.test(routeSource), 'missing getSession import');
  assert.ok(sessionGuardIndex !== -1, 'missing getSession() call');
  assert.ok(/if \(!session\) \{/.test(routeSource), 'missing session guard');
  assert.ok(
    /error: 'Non authentifié' \}, \{ status: 401 \}/.test(routeSource),
    'missing 401 envelope for unauthenticated callers'
  );
  assert.ok(sshKeyReadIndex !== -1, 'missing MOANA_SSH_KEY read');
  assert.ok(
    sessionGuardIndex < sshKeyReadIndex,
    'session must be checked before MOANA_SSH_KEY is read, so an anonymous caller never triggers SSH work'
  );
});

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} deterministic checks passed`);

if (failed.length > 0) {
  process.exitCode = 1;
}

}

main();
