import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/supabase/auth';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';

/**
 * GET /api/brokers
 * Get all brokers (without passwords)
 */
export async function GET() {
  try {
    if (!(await getSession())) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 },
      );
    }

    const supabase = createAdminClient();

    const { data: brokers, error } = await supabase
      .from('brokers')
      .select('id, broker_name, email, created_at')
      .order('broker_name', { ascending: true });

    if (error) {
      console.error('[GET /api/brokers] Query failed');
      return NextResponse.json(
        { success: false, error: 'Failed to fetch brokers' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: brokers || [],
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch {
    console.error('[GET /api/brokers] Unexpected failure');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
