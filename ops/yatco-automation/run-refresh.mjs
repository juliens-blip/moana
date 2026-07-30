#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readJson,
  validateMarketPulse,
  validateMarketReview,
  validateStatsBridge,
  validateVesselStats,
} from './lib/validators.mjs';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(process.env.YATCO_DATA_DIR ?? '/data');
const authFile = path.resolve(process.env.YATCO_AUTH_FILE ?? '/run/secrets/yatcoboss.json');
const tsxBin = path.join(appRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

function timestampId(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function script(name) {
  return path.join(appRoot, 'scripts', name);
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(command)} exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

async function validateFile(jsonPath, validator) {
  validator(await readJson(jsonPath));
}

async function writeStatus(status) {
  const finalPath = path.join(dataRoot, 'status.json');
  const temporaryPath = `${finalPath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporaryPath, finalPath);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

async function runPipeline(name, action) {
  const startedAt = new Date().toISOString();
  console.log(`\n=== ${name} ===`);
  try {
    await action();
    return { name, ok: true, startedAt, finishedAt: new Date().toISOString() };
  } catch (error) {
    const message = safeError(error);
    console.error(`${name} failed: ${message}`);
    return { name, ok: false, startedAt, finishedAt: new Date().toISOString(), error: message };
  }
}

async function main() {
  const startedAt = new Date();
  const runId = timestampId(startedAt);
  const runDirectory = path.join(dataRoot, runId);
  await fs.mkdir(runDirectory, { recursive: true, mode: 0o700 });
  await fs.access(authFile);

  const vesselStatsPath = path.join(runDirectory, 'vessel-stats.json');
  const bridgePath = path.join(runDirectory, 'yatco-stats-bridge.json');
  const marketReviewPath = path.join(runDirectory, 'market-review.json');
  const marketPulsePath = path.join(runDirectory, 'market-pulse.json');

  const pipelines = [];
  pipelines.push(
    await runPipeline('vessel-visibility-stats', async () => {
      await runCommand(process.execPath, [script('vessel-stats-scrape.mjs'), authFile, vesselStatsPath]);
      await validateFile(vesselStatsPath, validateVesselStats);
      await runCommand(tsxBin, [script('sync-vessel-visibility-stats.ts'), vesselStatsPath, bridgePath]);
      await validateFile(bridgePath, validateStatsBridge);
      await runCommand(tsxBin, [script('sync-yatco-stats.ts'), bridgePath]);
    }),
  );
  pipelines.push(
    await runPipeline('market-review', async () => {
      await runCommand(process.execPath, [script('market-review-scrape.mjs'), authFile, marketReviewPath]);
      await validateFile(marketReviewPath, validateMarketReview);
      await runCommand(tsxBin, [script('sync-market-review.ts'), marketReviewPath]);
    }),
  );
  pipelines.push(
    await runPipeline('market-pulse', async () => {
      await runCommand(process.execPath, [script('market-pulse-scrape.mjs'), authFile, marketPulsePath]);
      await validateFile(marketPulsePath, validateMarketPulse);
      await runCommand(tsxBin, [script('sync-market-pulse.ts'), marketPulsePath]);
    }),
  );

  const status = {
    version: 1,
    ok: pipelines.every((pipeline) => pipeline.ok),
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    pipelines,
  };
  await writeStatus(status);
  console.log(`\nRefresh finished: ${status.ok ? 'OK' : 'FAILED'}`);
  process.exitCode = status.ok ? 0 : 1;
}

main().catch(async (error) => {
  const message = safeError(error);
  console.error(`Refresh initialization failed: ${message}`);
  try {
    await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
    await writeStatus({
      version: 1,
      ok: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      pipelines: [],
      error: message,
    });
  } catch {
    // The original initialization error remains the actionable failure.
  }
  process.exitCode = 1;
});
