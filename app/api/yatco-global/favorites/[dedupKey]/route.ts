import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getYatcoFavoriteHistory } from '@/lib/supabase/yatco-favorites';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { dedupKey: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
  try {
    const history = await getYatcoFavoriteHistory(session.brokerId, decodeURIComponent(params.dedupKey));
    return NextResponse.json({ success: true, data: { history } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}
