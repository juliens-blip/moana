import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getYatcoFavoriteKeys, setYatcoFavorite } from '@/lib/supabase/yatco-favorites';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: { dedupKeys: await getYatcoFavoriteKeys(session.brokerId) } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body?.listingId !== 'string' || typeof body?.favorite !== 'boolean') {
      return NextResponse.json({ success: false, error: 'listingId et favorite sont requis' }, { status: 400 });
    }
    const snapshot = body.favorite && body.snapshot && typeof body.snapshot === 'object'
      ? body.snapshot as Record<string, unknown>
      : undefined;
    await setYatcoFavorite(session.brokerId, body.listingId, body.favorite, snapshot);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}
