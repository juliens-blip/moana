'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Anchor, LogOut, User, Ship, Inbox } from 'lucide-react';
import { Button } from '@/components/ui';
import { useNewLeadsCount } from '@/lib/hooks';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [broker, setBroker] = useState<string | null>(null);
  const { count: newLeadsCount } = useNewLeadsCount({ pollingInterval: 30000 });

  const isLeadsPage = pathname?.includes('/leads');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.broker) {
          setBroker(data.broker);
        }
      })
      .catch(console.error);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="bg-gradient-to-r from-primary-600 to-secondary-600 p-2 rounded-lg">
                <Anchor className="h-6 w-6 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold text-gray-900">Moana Yachting</h1>
                <p className="text-xs text-gray-500">Gestion de Listings</p>
              </div>
            </Link>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              <Link
                href="/dashboard"
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                  ${!isLeadsPage
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                <Ship className="h-4 w-4" />
                <span className="hidden md:inline">Bateaux</span>
              </Link>
              <Link
                href="/dashboard/leads"
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all relative
                  ${isLeadsPage
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                <Inbox className="h-4 w-4" />
                <span className="hidden md:inline">Leads CRM</span>
                {newLeadsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                    {newLeadsCount > 99 ? '99+' : newLeadsCount}
                  </span>
                )}
              </Link>
            </nav>
          </div>

          {/* User Info & Actions */}
          {broker && (
            <div className="flex items-center gap-4">
              {/* User Info */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                <User className="h-4 w-4 text-gray-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {broker}
                  </p>
                  <p className="text-xs text-gray-500">Broker</p>
                </div>
              </div>

              {/* Logout Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Déconnexion</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
