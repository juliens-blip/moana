import { NextRequest, NextResponse } from 'next/server';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSession } from '@/lib/supabase/auth';
import { createProductionDeps, handleBrochureVideoUpload } from '@/lib/brochure-video-upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const sshKey = process.env.MOANA_SSH_KEY;
  if (!sshKey) {
    console.error('MOANA_SSH_KEY est requis pour /api/brochure-video');
    return NextResponse.json({ error: 'Configuration serveur indisponible' }, { status: 500 });
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'moana-brochure-video-'));
  const keyPath = join(tempDir, 'ssh-key');
  try {
    await writeFile(keyPath, `${sshKey.trim()}\n`, { mode: 0o600 });
    return await handleBrochureVideoUpload(request, createProductionDeps(keyPath));
  } catch (error) {
    console.error('Erreur de configuration ou de lancement brochure-video:', error);
    return NextResponse.json({ error: 'Configuration du service vidéo indisponible' }, { status: 500 });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
