import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';

/**
 * GET /api/brokers
 * Get all brokers (without passwords)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    const { data: brokers, error } = await supabase
      .from('brokers')
      .select('id, broker_name, email, created_at')
      .order('broker_name', { ascending: true });

    if (error) {
      console.error('[GET /api/brokers] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch brokers' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: brokers || [],
    });
  } catch (error) {
    console.error('[GET /api/brokers] Exception:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
