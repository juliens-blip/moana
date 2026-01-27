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
    <header className="bg-primary-950 border-b border-primary-900 sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-10">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="p-2 rounded-full border border-secondary-500/30 group-hover:border-secondary-500 transition-colors">
                <Anchor className="h-6 w-6 text-secondary-500" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-heading font-bold text-white tracking-wider">MOANA</h1>
                <p className="text-[10px] text-gray-400 tracking-[0.2em] uppercase">YACHTING</p>
              </div>
            </Link>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-6">
              <Link
                href="/dashboard"
                className={`flex items-center gap-2 py-2 text-sm font-medium transition-all border-b-2
                  ${!isLeadsPage
                    ? 'border-secondary-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'}`}
              >
                <Ship className="h-4 w-4" />
                <span className="hidden md:inline uppercase tracking-wide">Listings</span>
              </Link>
              <Link
                href="/dashboard/leads"
                className={`flex items-center gap-2 py-2 text-sm font-medium transition-all relative border-b-2
                  ${isLeadsPage
                    ? 'border-secondary-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'}`}
              >
                <Inbox className="h-4 w-4" />
                <span className="hidden md:inline uppercase tracking-wide">Leads CRM</span>
                {newLeadsCount > 0 && (
                  <span className="absolute -top-1 -right-2 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-bold text-primary-950 bg-secondary-500 rounded-full">
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
              <div className="hidden sm:flex items-center gap-3 px-3 py-1 border-r border-primary-800 pr-4">
                <div className="p-1.5 bg-primary-900 rounded-full">
                  <User className="h-4 w-4 text-secondary-500" />
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-white">
                    {broker}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Broker</p>
                </div>
              </div>

              {/* Logout Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-gray-400 hover:text-white hover:bg-primary-900"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Sortie</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
