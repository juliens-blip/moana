import { NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      broker: session.broker,
      brokerId: session.brokerId,
    });
  } catch (error) {
    console.error('Get session API error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
