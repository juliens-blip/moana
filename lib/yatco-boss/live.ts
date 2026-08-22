import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { YatcoGlobalListing } from '@/lib/types';

const REMOTE = 'ubuntu@51.44.220.145';
let liveCache: YatcoGlobalListing[] | null = null;

type BossRow = {
  feedType?: 'new' | 'modified' | 'sold';
  vid: string;
  vesselName: string;
  mlsId?: string | null;
  builder?: string | null;
  modelYear?: string | null;
  model?: string | null;
  loaText?: string | null;
  staterooms?: string | null;
  priceText?: string | null;
  location?: string | null;
  soldDate?: string | null;
  brokerName?: string | null;
  brochureUrl?: string | null;
  historyText?: string | null;
};

function numberFrom(value?: string | null): number | undefined {
  const match = value?.match(/\d[\d .,]*/);
  if (!match) return undefined;
  const raw = match[0].replace(/\s/g, '');
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,(?=\d{3}(\D|$))/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function usdFrom(value?: string | null): number | undefined {
  const usd = value?.match(/\$\s*([\d,.]+)\s*USD/i);
  if (usd) return numberFrom(usd[1]);
  return /\bUSD\b/i.test(value ?? '') ? numberFrom(value) : undefined;
}

function locationFrom(value?: string | null): { city?: string; country?: string } {
  const parts = (value ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length ? { city: parts[0], country: parts.length > 1 ? parts.at(-1) : undefined } : {};
}

function mapRow(row: BossRow, observedAt: string): YatcoGlobalListing {
  const location = locationFrom(row.location);
  const dedupKey = `yatco:${row.mlsId ?? row.vid}`;
  return {
    id: `live-${row.mlsId ?? row.vid}`,
    source: 'yatco-boss-live',
    external_id: row.mlsId ?? row.vid,
    boat_name: row.vesselName,
    builder: row.builder ?? undefined,
    model: row.model && row.model !== 'N/A' ? row.model : undefined,
    model_year: numberFrom(row.modelYear),
    length_m: numberFrom(row.loaText),
    cabins: numberFrom(row.staterooms),
    price_amount: numberFrom(row.priceText),
    price_currency: row.priceText?.match(/\b(EUR|USD|GBP|CHF)\b/i)?.[1]?.toUpperCase(),
    price_usd: usdFrom(row.priceText),
    city: location.city,
    country: location.country,
    broker_company: row.brokerName ?? undefined,
    // custompdf est une page de configuration, pas un fichier PDF. Le
    // téléchargement passe par l'API locale /api/yatco-global/brochure.
    spec_sheet_url: undefined,
    listing_status: row.feedType === 'sold' ? 'Sold' : 'Active',
    first_seen_at: observedAt,
    updated_at: observedAt,
    raw_payload: { yatco_boss: row, boss_observed_at: observedAt },
    dedup_key: dedupKey,
    price_fluctuation: null,
  };
}

function runRemoteScript(keyPath: string, script: string, env: Record<string, string> = {}): Promise<string> {
  const dockerEnv = Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]);
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=20', '-i', keyPath, REMOTE,
      'docker', 'exec', ...dockerEnv, '-i', 'scrape-mcp', 'node', '-',
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `SSH exited ${code}`)));
    child.stdin.end(script);
    const timer = setTimeout(() => child.kill('SIGTERM'), 300_000);
    child.on('close', () => clearTimeout(timer));
  });
}

export async function getLiveYatcoBossListings(forceRefresh = false): Promise<YatcoGlobalListing[]> {
  if (liveCache && !forceRefresh) return liveCache;
  const key = process.env.MOANA_SSH_KEY;
  if (!key) throw new Error('MOANA_SSH_KEY est requis pour le flux BOSS live');
  const temp = await mkdtemp(join(tmpdir(), 'moana-yatco-'));
  const keyPath = join(temp, 'aws-key');
  await writeFile(keyPath, `${key.trim()}\n`, { mode: 0o600 });
  try {
    const script = await readFile(join(process.cwd(), 'scripts/yatco-boss-global-live.mjs'), 'utf8');
    const stdout = await runRemoteScript(keyPath, script);
    const rows = JSON.parse(stdout) as BossRow[];
    const observedAt = new Date().toISOString();
    const priority = { new: 1, modified: 2, sold: 3 } as const;
    const unique = new Map<string, BossRow>();
    for (const row of rows) {
      const key = row.mlsId ?? row.vid;
      if (!key || !unique.has(key) || (priority[row.feedType ?? 'modified'] > priority[unique.get(key)!.feedType ?? 'modified'])) {
        unique.set(key, row);
      }
    }
    liveCache = [...unique.values()].map((row) => mapRow(row, observedAt));
    return liveCache;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function getLiveYatcoBossBrochure(vid: string): Promise<{ filename: string; contentType: string; base64: string }> {
  if (!/^\d+$/.test(vid)) throw new Error('Identifiant YATCO invalide');
  const key = process.env.MOANA_SSH_KEY;
  if (!key) throw new Error('MOANA_SSH_KEY est requis pour le téléchargement BOSS');
  const temp = await mkdtemp(join(tmpdir(), 'moana-yatco-pdf-'));
  const keyPath = join(temp, 'aws-key');
  await writeFile(keyPath, `${key.trim()}\n`, { mode: 0o600 });
  try {
    const script = await readFile(join(process.cwd(), 'scripts/yatco-boss-brochure.mjs'), 'utf8');
    const stdout = await runRemoteScript(keyPath, script, { VID: vid });
    const result = JSON.parse(stdout) as { filename?: string; contentType?: string; base64?: string };
    if (!result.filename || !result.base64) throw new Error('YATCO n’a pas retourné de brochure');
    return { filename: result.filename, contentType: result.contentType ?? 'application/pdf', base64: result.base64 };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
