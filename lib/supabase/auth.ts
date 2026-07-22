import { verifyPassword } from '@/lib/security';
import { createAdminClient } from './admin';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'moana_session';
const SESSION_MAX_AGE = 24 * 60 * 60; // 24 hours in seconds

export interface Session {
  brokerId: string;
  broker: string;
  expiresAt: number;
}

/**
 * Login a broker
 * Uses admin client to bypass RLS during authentication
 */
export async function login(brokerName: string, password: string): Promise<Session | null> {
  // Use admin client to bypass RLS policies
  const supabase = createAdminClient();
  const normalizedBrokerName = brokerName.trim();

  try {
    // Récupérer le broker par broker_name
    const { data: broker, error } = await supabase
      .from('brokers')
      .select('*')
      .eq('broker_name', normalizedBrokerName)
      .single();

    const resolvedBroker = broker ?? null;
    const resolvedError = error;

    const brokerRecord = resolvedBroker ??
      (await supabase
        .from('brokers')
        .select('*')
        .ilike('broker_name', normalizedBrokerName)
        .maybeSingle()).data ?? null;

    if ((!brokerRecord && resolvedError) || !brokerRecord) {
      return null;
    }

    const passwordCheck = await verifyPassword(password, brokerRecord.password_hash);
    if (!passwordCheck.valid) {
      return null;
    }

    const session: Session = {
      brokerId: brokerRecord.id,
      broker: brokerRecord.broker_name,
      expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
    };

    return session;
  } catch {
    return null;
  }
}

/**
 * Get current session
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return null;
  }

  try {
    const session: Session = JSON.parse(sessionCookie.value);

    // Check if session has expired
    if (session.expiresAt < Date.now()) {
      await logout();
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Set session cookie
 */
export async function setSessionCookie(session: Session): Promise<void> {
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

/**
 * Logout (clear session)
 */
export async function logout(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
