import { NextRequest, NextResponse } from 'next/server';
import { login, setSessionCookie } from '@/lib/supabase/auth';
import { loginSchema } from '@/lib/validations';

// Force dynamic rendering - required for cookies()
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const validationResult = loginSchema.safeParse(await request.json());

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Nom d\'utilisateur et mot de passe requis' },
        { status: 400 }
      );
    }

    const session = await login(validationResult.data.broker, validationResult.data.password);

    if (!session) {
      return NextResponse.json(
        { error: 'Identifiants invalides' },
        { status: 401 }
      );
    }

    await setSessionCookie(session);

    return NextResponse.json({
      success: true,
      broker: session.broker,
    });
  } catch {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
