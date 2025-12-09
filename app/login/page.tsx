import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';

// Force dynamic rendering to avoid SSR errors
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Connexion - Moana Yachting',
  description: 'Connexion broker Moana Yachting',
};

export default async function LoginPage() {
  const session = await getSession();

  // If already logged in, redirect to dashboard
  if (session) {
    redirect('/dashboard');
  }

  return <LoginForm />;
}
