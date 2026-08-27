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
    // Certaines UI de variables d'environnement (dont Vercel, selon comment la
    // valeur est collée) stockent un PEM multi-lignes avec des séquences `\n`
    // littérales au lieu de vrais retours à la ligne. Le CLI `ssh` tolérait ce
    // cas ; le parseur strict de `ssh2` échoue avec "Unsupported key format".
    // `\` n'apparaît jamais dans l'alphabet base64 d'un PEM valide : ce
    // remplacement est donc sans risque sur une clé déjà correctement formatée.
    const normalizedKey = sshKey.replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim();
    await writeFile(keyPath, `${normalizedKey}\n`, { mode: 0o600 });
    return await handleBrochureVideoUpload(request, createProductionDeps(keyPath));
  } catch (error) {
    console.error('Erreur de configuration ou de lancement brochure-video:', error);
    return NextResponse.json({ error: 'Configuration du service vidéo indisponible' }, { status: 500 });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
