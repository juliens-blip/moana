import { createClient } from './server';
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

  try {
    console.log('[login] Attempting login for:', brokerName);
    console.log('[login] Password provided:', password);

    // Récupérer le broker par broker_name
    const { data: broker, error } = await supabase
      .from('brokers')
      .select('*')
      .eq('broker_name', brokerName)
      .single();

    console.log('[login] Query error:', error);
    console.log('[login] Broker data:', broker ? {
      id: broker.id,
      broker_name: broker.broker_name,
      password_hash: broker.password_hash,
      email: broker.email
    } : 'null');

    if (error || !broker) {
      console.error('[login] Broker not found:', brokerName, error);
      return null;
    }

    // Vérifier le mot de passe (à améliorer avec bcrypt)
    // TODO: Hash passwords avec bcrypt
    console.log('[login] Comparing passwords:', {
      stored: broker.password_hash,
      provided: password,
      match: broker.password_hash === password
    });

    if (broker.password_hash !== password) {
      console.error('[login] Invalid password - stored:', broker.password_hash, 'provided:', password);
      return null;
    }

    const session: Session = {
      brokerId: broker.id,
      broker: broker.broker_name,
      expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
    };

    console.log('[login] Session created successfully:', session);
    return session;
  } catch (error) {
    console.error('[login] Exception:', error);
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
  } catch (error) {
    console.error('[getSession] Session parse error:', error);
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
