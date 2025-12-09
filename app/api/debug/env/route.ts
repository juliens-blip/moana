import { NextResponse } from 'next/server';

/**
 * Debug endpoint to check environment variables on Vercel
 * Access at: /api/debug/env
 *
 * SECURITY: Remove or protect this endpoint in production!
 */
export async function GET() {
  const envCheck = {
    timestamp: new Date().toISOString(),
    platform: process.env.VERCEL ? 'Vercel' : 'Local',
    nodeEnv: process.env.NODE_ENV,
    variables: {
      NEXT_PUBLIC_SUPABASE_URL: {
        present: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        value: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 40) + '...',
        length: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0
      },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: {
        present: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 40) + '...',
        length: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0
      },
      SUPABASE_SERVICE_ROLE_KEY: {
        present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        value: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 40) + '...',
        length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0
      }
    }
  };

  const allPresent = Object.values(envCheck.variables).every(v => v.present);

  return NextResponse.json({
    success: allPresent,
    message: allPresent
      ? 'All environment variables are present'
      : 'Some environment variables are missing',
    ...envCheck
  });
}

// Prevent caching
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
