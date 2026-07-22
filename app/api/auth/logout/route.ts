import { NextResponse } from 'next/server';
import { logout } from '@/lib/supabase/auth';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    await logout();

    return NextResponse.json({
      success: true,
    });
  } catch {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
