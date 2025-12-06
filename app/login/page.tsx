import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = {
  title: 'Connexion - Moana Yachting',
  description: 'Connexion broker Moana Yachting',
};

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  // If already logged in, redirect to dashboard
  if (session) {
    redirect('/dashboard');
  }

  return <LoginForm />;
}
