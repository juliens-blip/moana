import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { getLiveYatcoBossBrochure } from '@/lib/yatco-boss/live';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
  const vid = request.nextUrl.searchParams.get('vid') ?? '';
  try {
    const brochure = await getLiveYatcoBossBrochure(vid);
    return new NextResponse(Buffer.from(brochure.base64, 'base64'), {
      headers: {
        'Content-Type': brochure.contentType,
        'Content-Disposition': `attachment; filename="${brochure.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error in GET /api/yatco-global/brochure:', error);
    const sourceUrl = `https://www.yatcoboss.com/search/vesseldetails/viewlisting/?vID=${encodeURIComponent(vid)}&FromSearch=1`;
    const message = error instanceof Error && /API Access Error|401|introuvable/i.test(error.message)
      ? 'YATCO BOSS ne donne pas accès à la brochure de cette annonce pour le broker connecté.'
      : 'La brochure n’a pas pu être générée par YATCO BOSS.';
    return new NextResponse(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Brochure indisponible</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#24324a}a{display:inline-block;margin-top:18px;padding:10px 15px;background:#b99020;color:#fff;text-decoration:none;border-radius:6px}</style><h1>Brochure indisponible</h1><p>${message}</p><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Ouvrir la fiche YATCO BOSS</a></html>`, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
