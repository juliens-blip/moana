/**
 * Brochure Video Page — client job controller tests
 *
 * There is no jsdom/testing-library dependency in this project (tests run
 * directly via `tsx`, see package.json's `test` script), so rendering
 * BrochureVideoUploader/page.tsx isn't possible here. Instead, exactly like
 * lib/brochure-video-upload.ts separates handleBrochureVideoUpload/
 * readBrochureVideoStatus (the injectable, testable core) from the thin
 * route.ts wrappers, lib/hooks/useBrochureVideoJob.ts separates
 * BrochureVideoJobController (framework-free, injectable fetch + timer) from
 * the thin useBrochureVideoJob React wrapper. These tests exercise the
 * controller directly with a fully simulated fetch and timer — no network,
 * no React, no real setTimeout.
 *
 * Tests:
 * - A non-PDF MIME type or non-.pdf extension is rejected before any POST
 * - A valid PDF walks uploading -> running -> polls statusUrl every 2000ms
 *   -> done, exposing the final videoUrl
 * - A running marker keeps polling every 2000ms without ever starting a
 *   second in-flight statusUrl fetch before the previous one resolves
 * - A failed marker stops polling and surfaces the worker's reason
 * - A non-ok POST response surfaces the server's error message and never
 *   schedules a poll
 * - A thrown network error on POST and on a status poll both surface a
 *   network error state
 * - dispose() (component unmount) ignores a status resolution that arrives
 *   afterwards and does not reschedule a new poll
 * - React Strict Mode's setup -> cleanup -> setup sequence reactivates the
 *   controller so the upload state remains visible after the first click
 *
 * Run: npx tsx tests/frontend/brochure-video-page.test.ts
 */

import assert from 'node:assert/strict';
import {
  BrochureVideoJobController,
  BROCHURE_VIDEO_POLL_INTERVAL_MS,
  validatePdfFile,
  type BrochureVideoJobTimer,
  type UploadPdfResult,
} from '@/lib/hooks/useBrochureVideoJob';
import type { VideoJobStatus } from '@/lib/video-job-types';

/** Upload direct vers Storage déjà réussi — la plupart des tests n'exercent que la phase job (post-upload). */
const defaultUploadPdf = async (): Promise<UploadPdfResult> => ({ path: 'fake-upload-path.pdf' });

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

function pdfFile(overrides: Partial<{ name: string; type: string }> = {}): File {
  return new File([new Uint8Array([1, 2, 3])], overrides.name ?? 'brochure.pdf', {
    type: overrides.type ?? 'application/pdf',
  });
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

interface FakeTimerEntry {
  handle: number;
  callback: () => void;
  delayMs: number;
}

interface FakeTimer extends BrochureVideoJobTimer {
  pending: FakeTimerEntry[];
}

function createFakeTimer(): FakeTimer {
  let nextHandle = 1;
  const pending: FakeTimerEntry[] = [];
  return {
    pending,
    setTimer(callback, delayMs) {
      const handle = nextHandle++;
      pending.push({ handle, callback, delayMs });
      return handle;
    },
    clearTimer(handle) {
      const index = pending.findIndex((entry) => entry.handle === handle);
      if (index >= 0) pending.splice(index, 1);
    },
  };
}

/** Laisse le micro-tick de la promesse fetch/json se résoudre avant d'observer l'état. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function collectStatuses(controller: BrochureVideoJobController): VideoJobStatus[] {
  const seen: VideoJobStatus[] = [];
  controller.subscribe((status) => seen.push(status));
  return seen;
}

async function main() {

await run('validatePdfFile rejects a non-PDF MIME type', () => {
  const error = validatePdfFile(pdfFile({ type: 'image/png' }));
  assert.ok(error);
  assert.equal(error?.code, 'invalid_file');
});

await run('validatePdfFile rejects a non-.pdf extension', () => {
  const error = validatePdfFile(pdfFile({ name: 'brochure.txt' }));
  assert.ok(error);
  assert.equal(error?.code, 'invalid_file');
});

await run('submit rejects an invalid PDF before any fetch call, surfacing an idle-to-failed transition', async () => {
  let fetchCalls = 0;
  const timer = createFakeTimer();
  const controller = new BrochureVideoJobController({
    fetchImpl: async () => { fetchCalls += 1; return jsonResponse({}); },
    timer,
    uploadPdf: defaultUploadPdf,
  });
  await controller.submit(pdfFile({ type: 'image/png' }));
  assert.equal(fetchCalls, 0);
  const status = controller.getStatus();
  assert.equal(status.state, 'failed');
  if (status.state === 'failed') {
    assert.equal(status.jobId, null);
    assert.equal(status.error.code, 'invalid_file');
  }
});

await run('a failed uploadPdf surfaces its error and never calls fetchImpl (no job start attempted)', async () => {
  let fetchCalls = 0;
  const timer = createFakeTimer();
  const controller = new BrochureVideoJobController({
    fetchImpl: async () => { fetchCalls += 1; return jsonResponse({}); },
    timer,
    uploadPdf: async () => ({ error: { code: 'upload_failed', message: "Échec de l'envoi du PDF vers le stockage." } }),
  });
  await controller.submit(pdfFile());
  assert.equal(fetchCalls, 0, 'a failed direct upload must never reach /api/brochure-video');
  const status = controller.getStatus();
  assert.equal(status.state, 'failed');
  if (status.state === 'failed') {
    assert.equal(status.jobId, null);
    assert.equal(status.error.code, 'upload_failed');
  }
});

await run('submit posts the uploadPdf path as JSON to /api/brochure-video', async () => {
  const timer = createFakeTimer();
  let capturedBody: string | undefined;
  const controller = new BrochureVideoJobController({
    fetchImpl: async (_input, init) => {
      capturedBody = init?.body as string;
      return jsonResponse({ jobId: 'jobPath', statusUrl: '/status/jobPath' });
    },
    timer,
    uploadPdf: async () => ({ path: 'brochure-video-uploads/abc123.pdf' }),
  });
  await controller.submit(pdfFile());
  assert.deepEqual(JSON.parse(capturedBody ?? '{}'), { path: 'brochure-video-uploads/abc123.pdf' });
});

await run('activate() restores updates after the Strict Mode setup -> cleanup -> setup sequence', async () => {
  const timer = createFakeTimer();
  const controller = new BrochureVideoJobController({
    fetchImpl: async () => jsonResponse({ jobId: 'jobStrict', statusUrl: '/status/jobStrict' }),
    timer,
    uploadPdf: defaultUploadPdf,
  });

  // Reproduit le cycle supplémentaire exécuté par React en développement
  // avant toute interaction utilisateur.
  controller.activate();
  const firstUnsubscribe = controller.subscribe(() => undefined);
  firstUnsubscribe();
  controller.dispose();
  controller.activate();

  const seen = collectStatuses(controller);
  const submitPromise = controller.submit(pdfFile());
  assert.equal(controller.getStatus().state, 'uploading');
  await submitPromise;

  assert.equal(controller.getStatus().state, 'running');
  assert.deepEqual(seen.map((status) => status.state), ['uploading', 'running']);
  assert.equal(timer.pending.length, 1);
});

await run('a valid PDF walks uploading -> running -> polls every 2000ms -> done with the final videoUrl', async () => {
  const timer = createFakeTimer();
  const calls: string[] = [];
  const controller = new BrochureVideoJobController({
    fetchImpl: async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      calls.push(url);
      if (url === '/api/brochure-video') {
        return jsonResponse({ jobId: 'job123', statusUrl: '/api/brochure-video/job123/status' });
      }
      return jsonResponse({ status: 'done', videoUrl: 'https://example.supabase.co/storage/v1/object/public/videos/job123.mp4', error: null });
    },
    timer,
    uploadPdf: defaultUploadPdf,
  });
  const seen = collectStatuses(controller);

  const submitPromise = controller.submit(pdfFile());
  assert.equal(controller.getStatus().state, 'uploading');
  await submitPromise;

  assert.equal(controller.getStatus().state, 'running');
  assert.equal(timer.pending.length, 1, 'exactly one poll must be scheduled after a successful upload');
  assert.equal(timer.pending[0].delayMs, BROCHURE_VIDEO_POLL_INTERVAL_MS);

  const scheduled = timer.pending.shift()!;
  scheduled.callback();
  await flush();

  const finalStatus = controller.getStatus();
  assert.equal(finalStatus.state, 'done');
  if (finalStatus.state === 'done') {
    assert.equal(finalStatus.jobId, 'job123');
    assert.equal(finalStatus.result.videoUrl, 'https://example.supabase.co/storage/v1/object/public/videos/job123.mp4');
  }
  assert.equal(timer.pending.length, 0, 'no further poll may be scheduled once the job is terminal (done)');
  assert.deepEqual(seen.map((s) => s.state), ['uploading', 'running', 'done']);
});

await run('a running marker keeps polling every 2000ms and never issues a second statusUrl fetch before the first resolves', async () => {
  const timer = createFakeTimer();
  let statusFetchCount = 0;
  let resolveStatusFetch: ((response: Response) => void) | null = null;
  const controller = new BrochureVideoJobController({
    fetchImpl: async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url === '/api/brochure-video') {
        return jsonResponse({ jobId: 'jobRunning', statusUrl: '/status/jobRunning' });
      }
      statusFetchCount += 1;
      return new Promise<Response>((resolve) => { resolveStatusFetch = resolve; });
    },
    timer,
    uploadPdf: defaultUploadPdf,
  });

  await controller.submit(pdfFile());
  const firstPoll = timer.pending.shift()!;

  // Invoke the same scheduled callback twice back-to-back, before the
  // in-flight status fetch resolves: the in-flight guard must prevent a
  // second concurrent fetch to statusUrl.
  firstPoll.callback();
  firstPoll.callback();
  assert.equal(statusFetchCount, 1, 'a second concurrent poll must never issue its own fetch while one is in flight');

  resolveStatusFetch!(jsonResponse({ status: 'running', videoUrl: null, error: null }));
  await flush();

  assert.equal(controller.getStatus().state, 'running');
  assert.equal(timer.pending.length, 1, 'the next poll must be scheduled only after the previous one resolved');
  assert.equal(timer.pending[0].delayMs, BROCHURE_VIDEO_POLL_INTERVAL_MS);
});

await run('a failed marker stops polling and surfaces the worker\'s reason', async () => {
  const timer = createFakeTimer();
  const controller = new BrochureVideoJobController({
    fetchImpl: async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url === '/api/brochure-video') {
        return jsonResponse({ jobId: 'jobFailed', statusUrl: '/status/jobFailed' });
      }
      return jsonResponse({ status: 'failed', videoUrl: null, error: 'Le job a échoué côté worker' });
    },
    timer,
    uploadPdf: defaultUploadPdf,
  });

  await controller.submit(pdfFile());
  const scheduled = timer.pending.shift()!;
  scheduled.callback();
  await flush();

  const status = controller.getStatus();
  assert.equal(status.state, 'failed');
  if (status.state === 'failed') {
    assert.equal(status.jobId, 'jobFailed');
    assert.equal(status.error.message, 'Le job a échoué côté worker');
  }
  assert.equal(timer.pending.length, 0, 'no further poll may be scheduled once the job is terminal (failed)');
});

await run('a non-ok POST response surfaces the server error and never schedules a poll', async () => {
  const timer = createFakeTimer();
  const controller = new BrochureVideoJobController({
    fetchImpl: async () => jsonResponse({ error: 'Fichier PDF trop volumineux' }, false),
    timer,
    uploadPdf: defaultUploadPdf,
  });
  await controller.submit(pdfFile());
  const status = controller.getStatus();
  assert.equal(status.state, 'failed');
  if (status.state === 'failed') {
    assert.equal(status.jobId, null);
    assert.equal(status.error.message, 'Fichier PDF trop volumineux');
  }
  assert.equal(timer.pending.length, 0);
});

await run('a thrown network error on POST surfaces a network_error status', async () => {
  const timer = createFakeTimer();
  const controller = new BrochureVideoJobController({
    fetchImpl: async () => { throw new Error('boom: network down'); },
    timer,
    uploadPdf: defaultUploadPdf,
  });
  await controller.submit(pdfFile());
  const status = controller.getStatus();
  assert.equal(status.state, 'failed');
  if (status.state === 'failed') {
    assert.equal(status.error.code, 'network_error');
  }
});

await run('a thrown network error on a status poll surfaces a network_error status and stops polling', async () => {
  const timer = createFakeTimer();
  const controller = new BrochureVideoJobController({
    fetchImpl: async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url === '/api/brochure-video') {
        return jsonResponse({ jobId: 'jobNet', statusUrl: '/status/jobNet' });
      }
      throw new Error('boom: network down');
    },
    timer,
    uploadPdf: defaultUploadPdf,
  });
  await controller.submit(pdfFile());
  const scheduled = timer.pending.shift()!;
  scheduled.callback();
  await flush();

  const status = controller.getStatus();
  assert.equal(status.state, 'failed');
  if (status.state === 'failed') {
    assert.equal(status.jobId, 'jobNet');
    assert.equal(status.error.code, 'network_error');
  }
  assert.equal(timer.pending.length, 0);
});

await run('dispose() ignores a status resolution that arrives after unmount and never reschedules a poll', async () => {
  const timer = createFakeTimer();
  let resolveStatusFetch: ((response: Response) => void) | null = null;
  const controller = new BrochureVideoJobController({
    fetchImpl: async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url === '/api/brochure-video') {
        return jsonResponse({ jobId: 'jobUnmount', statusUrl: '/status/jobUnmount' });
      }
      return new Promise<Response>((resolve) => { resolveStatusFetch = resolve; });
    },
    timer,
    uploadPdf: defaultUploadPdf,
  });
  const seen = collectStatuses(controller);

  await controller.submit(pdfFile());
  const scheduled = timer.pending[0];
  scheduled.callback();
  await flush();

  controller.dispose();
  resolveStatusFetch!(jsonResponse({ status: 'done', videoUrl: 'https://example.supabase.co/x.mp4', error: null }));
  await flush();

  assert.equal(controller.getStatus().state, 'running', 'a late resolution after dispose must never mutate the status');
  assert.equal(timer.pending.length, 0, 'dispose must clear the pending poll and no new one may be scheduled afterwards');
  assert.ok(!seen.some((status) => status.state === 'done'), 'no listener may observe a post-dispose transition');
});

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} tests passed`);
if (failed.length > 0) {
  process.exit(1);
}

}

main();
