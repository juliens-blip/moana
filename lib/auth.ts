import { cookies } from 'next/headers';
import { authenticateBroker } from '@/lib/airtable/brokers';

const SESSION_COOKIE_NAME = 'moana_session';
const SESSION_MAX_AGE = 24 * 60 * 60; // 24 hours in seconds

export interface Session {
  brokerId: string;
  broker: string;
  expiresAt: number;
}

export async function login(broker: string, password: string): Promise<Session | null> {
  try {
    const brokerData = await authenticateBroker(broker, password);

    if (!brokerData) {
      return null;
    }

    const session: Session = {
      brokerId: brokerData.id,
      broker: brokerData.fields.broker,
      expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
    };

    return session;
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
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
    console.error('Session parse error:', error);
    return null;
  }
}

export async function setSessionCookie(session: Session): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
