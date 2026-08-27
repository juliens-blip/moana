import { NextRequest, NextResponse } from 'next/server';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSession } from '@/lib/supabase/auth';
import {
  createProductionDeps,
  readBrochureVideoStatus,
  JOB_ID_RE,
  STATUS_TRANSPORT_ERROR_MESSAGE,
  type BrochureVideoStatusResult,
} from '@/lib/brochure-video-upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function statusResponse(body: BrochureVideoStatusResult, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return statusResponse({ status: 'failed', videoUrl: null, error: 'Non authentifié' }, 401);
  }

  const jobId = params.jobId;

  // Rejeté avant toute lecture de MOANA_SSH_KEY : un jobId hors contrat ne
  // doit jamais déclencher d'accès SSH ni exiger la configuration serveur.
  if (!JOB_ID_RE.test(jobId)) {
    return statusResponse({ status: 'failed', videoUrl: null, error: 'Identifiant de job invalide' }, 400);
  }

  const sshKey = process.env.MOANA_SSH_KEY;
  if (!sshKey) {
    console.error('MOANA_SSH_KEY est requis pour /api/brochure-video/[jobId]/status');
    return statusResponse({ status: 'failed', videoUrl: null, error: 'Configuration serveur indisponible' }, 500);
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'moana-brochure-video-status-'));
  const keyPath = join(tempDir, 'ssh-key');
  try {
    await writeFile(keyPath, `${sshKey.trim()}\n`, { mode: 0o600 });
    const result = await readBrochureVideoStatus(jobId, createProductionDeps(keyPath));
    const httpStatus = result.error === STATUS_TRANSPORT_ERROR_MESSAGE ? 502 : 200;
    return statusResponse(result, httpStatus);
  } catch {
    // Couvre notamment createProductionDeps() qui lève si MOANA_SSH_HOST est
    // absent : la route ne doit jamais laisser une erreur de configuration
    // s'échapper sans renvoyer l'enveloppe stable {status, videoUrl, error}.
    console.error('/api/brochure-video/[jobId]/status: configuration ou accès distant indisponible');
    return statusResponse({ status: 'failed', videoUrl: null, error: 'Configuration serveur indisponible' }, 500);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
