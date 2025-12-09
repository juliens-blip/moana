import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

// Force dynamic rendering to avoid SSR errors
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
