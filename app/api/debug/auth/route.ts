import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Debug endpoint to test authentication logic
 * Access at: /api/debug/auth?broker=Cedric&password=cebich
 *
 * SECURITY: Remove or protect this endpoint in production!
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const brokerName = searchParams.get('broker');
  const password = searchParams.get('password');

  if (!brokerName || !password) {
    return NextResponse.json({
      error: 'Missing broker or password query parameters',
      usage: '/api/debug/auth?broker=Cedric&password=cebich'
    }, { status: 400 });
  }

  const debugInfo: any = {
    timestamp: new Date().toISOString(),
    platform: process.env.VERCEL ? 'Vercel' : 'Local',
    input: {
      broker: brokerName,
      password: password,
      passwordLength: password.length
    },
    steps: []
  };

  try {
    // Step 1: Check environment
    debugInfo.steps.push({
      step: 1,
      name: 'Environment Check',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 40) + '...',
      serviceKeyPresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0
    });

    // Step 2: Create admin client
    let adminClient;
    try {
      adminClient = createAdminClient();
      debugInfo.steps.push({
        step: 2,
        name: 'Admin Client Creation',
        success: true
      });
    } catch (error: any) {
      debugInfo.steps.push({
        step: 2,
        name: 'Admin Client Creation',
        success: false,
        error: error.message
      });
      throw error;
    }

    // Step 3: Query broker
    const { data: broker, error: queryError } = await adminClient
      .from('brokers')
      .select('*')
      .eq('broker_name', brokerName)
      .single();

    debugInfo.steps.push({
      step: 3,
      name: 'Query Broker',
      success: !queryError,
      error: queryError?.message,
      brokerFound: !!broker,
      brokerData: broker ? {
        id: broker.id,
        broker_name: broker.broker_name,
        email: broker.email,
        password_hash: broker.password_hash,
        password_hash_length: broker.password_hash?.length || 0
      } : null
    });

    if (queryError) {
      return NextResponse.json({
        success: false,
        message: 'Database query failed',
        ...debugInfo
      }, { status: 500 });
    }

    if (!broker) {
      return NextResponse.json({
        success: false,
        message: 'Broker not found',
        ...debugInfo
      }, { status: 404 });
    }

    // Step 4: Password verification
    const passwordMatch = broker.password_hash === password;
    debugInfo.steps.push({
      step: 4,
      name: 'Password Verification',
      match: passwordMatch,
      comparison: {
        provided: password,
        stored: broker.password_hash,
        providedLength: password.length,
        storedLength: broker.password_hash?.length || 0,
        exact_match: broker.password_hash === password
      }
    });

    // Step 5: Session creation (simulated)
    if (passwordMatch) {
      const session = {
        brokerId: broker.id,
        broker: broker.broker_name,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      };

      debugInfo.steps.push({
        step: 5,
        name: 'Session Creation',
        success: true,
        session: {
          brokerId: session.brokerId,
          broker: session.broker,
          expiresAt: new Date(session.expiresAt).toISOString()
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Authentication successful',
        ...debugInfo
      });
    } else {
      debugInfo.steps.push({
        step: 5,
        name: 'Session Creation',
        success: false,
        reason: 'Password mismatch'
      });

      return NextResponse.json({
        success: false,
        message: 'Invalid password',
        ...debugInfo
      }, { status: 401 });
    }

  } catch (error: any) {
    debugInfo.error = {
      message: error.message,
      stack: error.stack,
      name: error.name
    };

    return NextResponse.json({
      success: false,
      message: 'Authentication error',
      ...debugInfo
    }, { status: 500 });
  }
}

// Prevent caching
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
