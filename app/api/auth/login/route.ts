import { NextRequest, NextResponse } from 'next/server';
import { login, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { broker, password } = body;

    if (!broker || !password) {
      return NextResponse.json(
        { error: 'Nom d\'utilisateur et mot de passe requis' },
        { status: 400 }
      );
    }

    const session = await login(broker, password);

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
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
