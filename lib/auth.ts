/**
 * Re-export all authentication functions from Supabase auth module
 * This maintains backwards compatibility while using Supabase backend
 */
export {
  login,
  getSession,
  setSessionCookie,
  logout,
  type Session,
} from '@/lib/supabase/auth';
