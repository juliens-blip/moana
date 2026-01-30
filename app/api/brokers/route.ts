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

    let { data: brokers, error } = await supabase
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

    const hasJmo = (brokers || []).some(
      (broker) => broker.broker_name?.toLowerCase() === 'jmo'
    );

    if (!hasJmo) {
      const { data: existingJmoByEmail, error: existingError } = await supabase
        .from('brokers')
        .select('id, broker_name, email, created_at')
        .ilike('email', 'jmo@moana-yachting.com')
        .maybeSingle();

      if (existingError) {
        console.error('[GET /api/brokers] Failed to check JMO email:', existingError);
      }

      if (existingJmoByEmail) {
        brokers = [...(brokers || []), existingJmoByEmail].sort((a, b) =>
          a.broker_name.localeCompare(b.broker_name)
        );
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('brokers')
          .insert({
            broker_name: 'JMO',
            email: 'jmo@moana-yachting.com',
            password_hash: 'changeme',
          })
          .select('id, broker_name, email, created_at')
          .single();

        if (insertError) {
          console.error('[GET /api/brokers] Failed to create JMO:', insertError);
        } else if (inserted) {
          brokers = [...(brokers || []), inserted].sort((a, b) =>
            a.broker_name.localeCompare(b.broker_name)
          );
        }
      }
    }

    const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
      /https?:\/\/([a-z0-9-]+)\.supabase\.co/i
    )?.[1];
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseRole = (() => {
      if (!serviceRoleKey) return undefined;
      const parts = serviceRoleKey.split('.');
      if (parts.length < 2) return undefined;
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        return payload?.role as string | undefined;
      } catch {
        return undefined;
      }
    })();

    return NextResponse.json(
      {
        success: true,
        data: brokers || [],
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          ...(supabaseRef ? { 'X-Supabase-Ref': supabaseRef } : {}),
          ...(supabaseRole ? { 'X-Supabase-Role': supabaseRole } : {}),
        },
      }
    );
  } catch (error) {
    console.error('[GET /api/brokers] Exception:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
