/**
 * Brochure Video Status Route Tests
 *
 * Tests readBrochureVideoStatus (the injectable core used by
 * app/api/brochure-video/[jobId]/status/route.ts's GET, kept in lib/ for the
 * same reason as handleBrochureVideoUpload: a Next.js route.ts module may
 * only export HTTP method handlers and route config) with a fully simulated
 * SSH executor — no network, no MOANA_SSH_KEY, no secret ever touched.
 *
 * Tests:
 * - An invalid jobId is rejected before any SSH call, with the exact
 *   {status, videoUrl, error} envelope and status "failed"
 * - A running marker (and an absent marker — the job just started and
 *   AtomicJobStateStore.begin() hasn't persisted its snapshot yet) both
 *   report {status: "running", videoUrl: null, error: null}
 * - A done marker with a result.object_key reports {status: "done", videoUrl:
 *   <public Supabase Storage URL>, error: null}
 * - A failed marker reports {status: "failed", videoUrl: null, error:
 *   <the worker's own already-redacted reason>}
 * - A malformed marker (invalid JSON, non-object, unknown status) reports a
 *   generic {status: "failed", error: "Statut du job illisible"} without ever
 *   echoing the raw marker content
 * - An SSH-level failure (thrown error or non-zero exit code) reports the
 *   dedicated STATUS_TRANSPORT_ERROR_MESSAGE, and stderr is never echoed
 * - Every SSH call for a valid jobId carries the bounded STATUS_SSH_TIMEOUT_MS
 * - No call to console.error/console.log ever contains a leaked secret
 * - GET rejects unauthenticated callers with 401 before any MOANA_SSH_KEY
 *   access, and never lets a missing MOANA_SSH_HOST escape as an unhandled
 *   rejection (static source checks on route.ts — cookies()/getSession()
 *   require a real Next.js request scope unavailable to a bare script, same
 *   constraint documented in tests/frontend/yatco-stats.test.ts)
 * - boundedAppend caps accumulation in place and ignores further chunks once
 *   overflowed, so createSshRunner never buffers past MAX_MARKER_BYTES, using
 *   UTF-8 byte length (not JS string length) so multibyte output is bounded
 *   correctly too
 * - The done-marker videoUrl test uses a realistic object_key shaped exactly
 *   like workers/video_assembler.py:_object_key ("videos/{digest16}/{job}.mp4")
 *   to prove the public URL mirrors bucket + object_key exactly, like
 *   _object_url does server-side, with no accidental deduplication
 *
 * Run: npx tsx tests/frontend/brochure-video-status-route.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  readBrochureVideoStatus,
  boundedAppend,
  STATUS_SSH_TIMEOUT_MS,
  STATUS_TRANSPORT_ERROR_MESSAGE,
  type BrochureVideoStatusDeps,
} from '@/lib/brochure-video-upload';

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app/api/brochure-video/[jobId]/status/route.ts'),
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

const VALID_JOB_ID = 'abc123DEF456ghi789JKL012';

interface RecordedCall {
  command: string;
  opts?: { input?: Buffer | string; timeoutMs?: number };
}

function fakeDeps(overrides: Partial<{
  calls: RecordedCall[];
  respond: (command: string) => { code: number; stdout: string; stderr: string };
  throwOnCall: boolean;
}> = {}): { deps: BrochureVideoStatusDeps; calls: RecordedCall[] } {
  const calls = overrides.calls ?? [];
  const deps: BrochureVideoStatusDeps = {
    runSsh: async (command, opts) => {
      calls.push({ command, opts });
      if (overrides.throwOnCall) {
        throw new Error('boom: secret-should-not-leak');
      }
      return overrides.respond
        ? overrides.respond(command)
        : { code: 0, stdout: '', stderr: '' };
    },
  };
  return { deps, calls };
}

async function main() {

await run('rejects an invalid jobId before any SSH call, with the exact envelope', async () => {
  const { deps, calls } = fakeDeps();
  const result = await readBrochureVideoStatus('not a valid id!!', deps);
  assert.deepEqual(Object.keys(result).sort(), ['error', 'status', 'videoUrl']);
  assert.equal(result.status, 'failed');
  assert.equal(result.videoUrl, null);
  assert.equal(typeof result.error, 'string');
  assert.equal(calls.length, 0, 'an invalid jobId must never trigger an SSH call');
});

await run('an absent marker (empty stdout) reports status running', async () => {
  const { deps } = fakeDeps({ respond: () => ({ code: 0, stdout: '', stderr: '' }) });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.deepEqual(result, { status: 'running', videoUrl: null, error: null });
});

await run('a running marker reports status running', async () => {
  const marker = JSON.stringify({ job_id: VALID_JOB_ID, status: 'running', started_at: 1_000 });
  const { deps } = fakeDeps({ respond: () => ({ code: 0, stdout: marker, stderr: '' }) });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.deepEqual(result, { status: 'running', videoUrl: null, error: null });
});

await run('a done marker reports status done with a public Supabase Storage videoUrl matching the worker\'s real object_key shape', async () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  try {
    // Forme réelle produite par workers/video_assembler.py:_object_key —
    // "videos/{digest[:16]}/{idempotency_key}.mp4" — jamais une clé plate de
    // synthèse : c'est cette forme qui exercerait un bucket public mal aligné.
    const digest16 = 'a'.repeat(16);
    const objectKey = `videos/${digest16}/${VALID_JOB_ID}.mp4`;
    const marker = JSON.stringify({
      job_id: VALID_JOB_ID,
      status: 'done',
      started_at: 1_000,
      result: { object_key: objectKey, content_digest: 'a'.repeat(64), clip_count: 3 },
    });
    const { deps } = fakeDeps({ respond: () => ({ code: 0, stdout: marker, stderr: '' }) });
    const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
    assert.equal(result.status, 'done');
    assert.equal(result.error, null);
    // Doit refléter exactement bucket + object_key, comme
    // video_assembler.py:_object_url le fait côté serveur (self._bucket +
    // "/" + object_key) — jamais une déduplication du segment "videos".
    assert.equal(result.videoUrl, `https://example.supabase.co/storage/v1/object/public/videos/${objectKey}`);
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  }
});

await run('a done marker without a usable object_key is treated as illegible rather than exposing partial data', async () => {
  const marker = JSON.stringify({ job_id: VALID_JOB_ID, status: 'done', started_at: 1_000, result: {} });
  const { deps } = fakeDeps({ respond: () => ({ code: 0, stdout: marker, stderr: '' }) });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.equal(result.status, 'failed');
  assert.equal(result.videoUrl, null);
  assert.equal(result.error, 'Statut du job illisible');
});

await run('a failed marker reports status failed with the worker\'s own redacted reason', async () => {
  const marker = JSON.stringify({
    job_id: VALID_JOB_ID,
    status: 'failed',
    started_at: 1_000,
    reason: 'InvalidJobInputError:manifest marker is not readable UTF-8 JSON',
  });
  const { deps } = fakeDeps({ respond: () => ({ code: 0, stdout: marker, stderr: '' }) });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.deepEqual(result, {
    status: 'failed',
    videoUrl: null,
    error: 'InvalidJobInputError:manifest marker is not readable UTF-8 JSON',
  });
});

await run('a malformed marker (invalid JSON) reports a generic failed status without echoing raw content', async () => {
  const { deps } = fakeDeps({ respond: () => ({ code: 0, stdout: '{not-json', stderr: '' }) });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.deepEqual(result, { status: 'failed', videoUrl: null, error: 'Statut du job illisible' });
});

await run('a marker with an unknown status value reports a generic failed status', async () => {
  const marker = JSON.stringify({ job_id: VALID_JOB_ID, status: 'unknown-state', started_at: 1_000 });
  const { deps } = fakeDeps({ respond: () => ({ code: 0, stdout: marker, stderr: '' }) });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.deepEqual(result, { status: 'failed', videoUrl: null, error: 'Statut du job illisible' });
});

await run('an oversized marker is rejected as illegible without being parsed', async () => {
  const oversized = JSON.stringify({ status: 'done', result: { object_key: 'x'.repeat(64 * 1024) } });
  const { deps } = fakeDeps({ respond: () => ({ code: 0, stdout: oversized, stderr: '' }) });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.deepEqual(result, { status: 'failed', videoUrl: null, error: 'Statut du job illisible' });
});

await run('a non-zero SSH exit code reports STATUS_TRANSPORT_ERROR_MESSAGE without leaking stderr', async () => {
  const { deps } = fakeDeps({ respond: () => ({ code: 255, stdout: '', stderr: 'boom: secret-should-not-leak' }) });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.deepEqual(result, { status: 'failed', videoUrl: null, error: STATUS_TRANSPORT_ERROR_MESSAGE });
  assert.ok(!JSON.stringify(result).includes('secret-should-not-leak'));
});

await run('a thrown SSH error reports STATUS_TRANSPORT_ERROR_MESSAGE without leaking the error message', async () => {
  const { deps } = fakeDeps({ throwOnCall: true });
  const result = await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.deepEqual(result, { status: 'failed', videoUrl: null, error: STATUS_TRANSPORT_ERROR_MESSAGE });
  assert.ok(!JSON.stringify(result).includes('secret-should-not-leak'));
});

await run('every SSH call for a valid jobId carries the bounded STATUS_SSH_TIMEOUT_MS', async () => {
  const { deps, calls } = fakeDeps({ respond: () => ({ code: 0, stdout: '', stderr: '' }) });
  await readBrochureVideoStatus(VALID_JOB_ID, deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts?.timeoutMs, STATUS_SSH_TIMEOUT_MS);
  assert.ok(typeof STATUS_SSH_TIMEOUT_MS === 'number' && STATUS_SSH_TIMEOUT_MS > 0 && Number.isFinite(STATUS_SSH_TIMEOUT_MS));
});

await run('no console.error/console.log call ever leaks a secret while handling an SSH failure', async () => {
  const originalError = console.error;
  const originalLog = console.log;
  const captured: string[] = [];
  console.error = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
  console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
  try {
    const { deps } = fakeDeps({ respond: () => ({ code: 1, stdout: '', stderr: 'boom: secret-should-not-leak' }) });
    await readBrochureVideoStatus(VALID_JOB_ID, deps);
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
  assert.ok(
    captured.every((entry) => !entry.includes('secret-should-not-leak')),
    'no captured log line may contain the leaked secret'
  );
});

await run('GET requires an authenticated session before any SSH/config work', () => {
  const sessionGuardIndex = routeSource.indexOf('const session = await getSession();');
  const jobIdReadIndex = routeSource.indexOf('const jobId = params.jobId;');
  assert.ok(/import \{ getSession \} from '@\/lib\/supabase\/auth';/.test(routeSource), 'missing getSession import');
  assert.ok(sessionGuardIndex !== -1, 'missing getSession() call');
  assert.ok(/if \(!session\) \{/.test(routeSource), 'missing session guard');
  assert.ok(
    /error: 'Non authentifié' \}, 401\)/.test(routeSource),
    'missing 401 envelope for unauthenticated callers'
  );
  assert.ok(jobIdReadIndex !== -1, 'missing jobId read');
  assert.ok(
    sessionGuardIndex < jobIdReadIndex,
    'session must be checked before jobId/SSH work, so an anonymous caller never reaches MOANA_SSH_KEY'
  );
});

await run('GET never lets a missing MOANA_SSH_HOST escape as an unhandled rejection: the stable envelope wraps createProductionDeps', () => {
  const tryIndex = routeSource.indexOf('try {');
  const createDepsIndex = routeSource.indexOf('createProductionDeps(keyPath)');
  const catchIndex = routeSource.indexOf('} catch {');
  assert.ok(tryIndex !== -1 && createDepsIndex !== -1 && catchIndex !== -1, 'missing try/createProductionDeps/catch scaffolding');
  assert.ok(
    tryIndex < createDepsIndex && createDepsIndex < catchIndex,
    'createProductionDeps (which throws when MOANA_SSH_HOST is missing) must run inside the try that the catch-all covers'
  );
  assert.ok(
    /error: 'Configuration serveur indisponible' \}, 500\)/.test(routeSource),
    'missing stable 500 envelope on config/SSH error'
  );
});

await run('boundedAppend caps accumulation at maxBytes and ignores further chunks once overflowed', () => {
  const first = boundedAppend('', 'a'.repeat(10), 16, false);
  assert.equal(first.value.length, 10);
  assert.equal(first.overflowed, false);

  const second = boundedAppend(first.value, 'b'.repeat(10), 16, first.overflowed);
  assert.equal(second.value.length, 16, 'must truncate exactly at maxBytes, never buffer the full chunk');
  assert.equal(second.overflowed, true);

  const third = boundedAppend(second.value, 'c'.repeat(1000), 16, second.overflowed);
  assert.equal(third.value, second.value, 'once overflowed, further chunks must be dropped, not appended');
  assert.equal(third.overflowed, true);
});

await run('boundedAppend bounds by UTF-8 byte length, not JS string length, for multibyte chunks', () => {
  // 'é' is 1 JS UTF-16 code unit but 2 UTF-8 bytes; '🚀' is 2 code units but
  // 4 bytes. A char-length bound would let this pass 16; the byte bound must
  // not.
  const multibyte = 'é'.repeat(8) + '🚀'.repeat(2); // 8*2 + 2*4 = 24 bytes, 12 JS chars
  assert.equal(multibyte.length, 12);
  assert.equal(Buffer.byteLength(multibyte, 'utf8'), 24);

  const result = boundedAppend('', multibyte, 16, false);
  assert.equal(result.overflowed, true, 'must overflow on byte length even though .length (12) is under 16');
  assert.ok(
    Buffer.byteLength(result.value, 'utf8') <= 16,
    'truncated value must never exceed maxBytes once re-encoded to UTF-8'
  );
  // Re-decoding must not throw even if a multibyte codepoint was cut mid-sequence.
  assert.equal(typeof result.value, 'string');
});

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} deterministic checks passed`);

if (failed.length > 0) {
  process.exitCode = 1;
}

}

main();
