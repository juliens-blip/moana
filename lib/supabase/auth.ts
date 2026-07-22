import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from './admin';
import {
  constantTimeBufferEqual,
  getConfiguredSecret,
  hashPassword,
  verifyPassword,
} from '@/lib/security';

const SESSION_COOKIE_NAME = 'moana_session';
const SESSION_MAX_AGE = 24 * 60 * 60;
const SESSION_SECRET_NAMES = ['MOANA_SESSION_SECRET', 'SESSION_SECRET'];

export interface Session {
  brokerId: string;
  broker: string;
  expiresAt: number;
}

interface SignedSession extends Session {
  issuedAt: number;
}

/**
 * Login a broker using the admin client, then migrate a valid legacy password
 * to the current scrypt format without logging authentication material.
 */
export async function login(brokerName: string, password: string): Promise<Session | null> {
  if (!getConfiguredSecret(...SESSION_SECRET_NAMES)) {
    return null;
  }

  try {
    const supabase = createAdminClient();
    const { data: broker, error } = await supabase
      .from('brokers')
      .select('id, broker_name, password_hash')
      .eq('broker_name', brokerName)
      .single();

    if (error || !broker) {
      return null;
    }

    const passwordCheck = await verifyPassword(password, broker.password_hash);
    if (!passwordCheck.valid) {
      return null;
    }

    if (passwordCheck.needsMigration) {
      const migratedHash = await hashPassword(password);
      await supabase
        .from('brokers')
        .update({ password_hash: migratedHash })
        .eq('id', broker.id);
    }

    return {
      brokerId: broker.id,
      broker: broker.broker_name,
      expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
    };
  } catch {
    return null;
  }
}

/**
 * Read and verify the signed session cookie. Legacy unsigned JSON cookies are
 * rejected and naturally expire when the user logs in again.
 */
export async function getSession(): Promise<Session | null> {
  const secret = getConfiguredSecret(...SESSION_SECRET_NAMES);
  if (!secret) {
    return null;
  }

  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    return null;
  }

  try {
    const [encodedPayload, encodedSignature] = sessionCookie.value.split('.');
    if (!encodedPayload || !encodedSignature) {
      await logout();
      return null;
    }

    const expectedSignature = signSession(encodedPayload, secret);
    if (!constantTimeBufferEqual(
      Buffer.from(encodedSignature, 'base64url'),
      Buffer.from(expectedSignature, 'base64url'),
    )) {
      await logout();
      return null;
    }

    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const session = JSON.parse(payload) as SignedSession;
    const now = Date.now();
    if (!isValidSession(session, now)) {
      await logout();
      return null;
    }

    return {
      brokerId: session.brokerId,
      broker: session.broker,
      expiresAt: session.expiresAt,
    };
  } catch {
    return null;
  }
}

/** Set an HTTP-only, signed session cookie. */
export async function setSessionCookie(session: Session): Promise<void> {
  const secret = getConfiguredSecret(...SESSION_SECRET_NAMES);
  if (!secret) {
    throw new Error('Session secret is not configured');
  }

  const issuedAt = Date.now();
  const signedSession: SignedSession = { ...session, issuedAt };
  if (!isValidSession(signedSession, issuedAt)) {
    throw new Error('Invalid session');
  }

  const encodedPayload = Buffer.from(JSON.stringify(signedSession), 'utf8').toString('base64url');
  const value = `${encodedPayload}.${signSession(encodedPayload, secret)}`;
  cookies().set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    priority: 'high',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

/** Clear the session cookie. */
export async function logout(): Promise<void> {
  cookies().delete(SESSION_COOKIE_NAME);
}

function isValidSession(session: Partial<SignedSession>, now: number): session is SignedSession {
  const issuedAt = session.issuedAt;
  const expiresAt = session.expiresAt;

  return (
    typeof session.brokerId === 'string' &&
    session.brokerId.length > 0 &&
    typeof session.broker === 'string' &&
    session.broker.length > 0 &&
    typeof issuedAt === 'number' &&
    typeof expiresAt === 'number' &&
    Number.isSafeInteger(issuedAt) &&
    Number.isSafeInteger(expiresAt) &&
    issuedAt <= now + 30_000 &&
    expiresAt > now &&
    expiresAt <= issuedAt + SESSION_MAX_AGE * 1000 + 30_000
  );
}

function signSession(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}
