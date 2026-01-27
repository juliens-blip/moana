import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Header } from '@/components/layout/Header';
import { InstallPrompt } from '@/components/pwa';

// Force dynamic rendering - do not prerender dashboard pages
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Logo Moana en filigrane */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 bg-repeat opacity-[0.02]"
        style={{
          backgroundImage: 'url(/moana-logo.jpg)',
          backgroundSize: '200px 200px',
          backgroundPosition: 'center'
        }}
      />
      
      <div className="relative z-10">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <InstallPrompt />
      </div>
    </div>
  );
}
