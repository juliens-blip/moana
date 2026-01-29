'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { Anchor, LogOut, User, Ship, Inbox, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useNewLeadsCount } from '@/lib/hooks';
import { motion, AnimatePresence } from 'framer-motion';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [broker, setBroker] = useState<string | null>(null);
  const { count: newLeadsCount } = useNewLeadsCount({ pollingInterval: 30000 });
  const [menuOpen, setMenuOpen] = useState(false);

  const isLeadsPage = pathname?.includes('/leads');
  const isBateauASuivrePage = pathname?.includes('/bateau-a-suivre');
  const isBateauChantierPage = pathname?.includes('/bateau-chantier');

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
    <header className="bg-primary-950 border-b border-primary-900 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Burger Menu Button (Mobile) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden text-gray-400 hover:text-white transition-colors p-2"
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          {/* Logo & Navigation */}
          <div className="flex items-center gap-10">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="relative h-10 w-10 overflow-hidden rounded-full border border-secondary-500/30 group-hover:border-secondary-500 transition-colors">
                <Image
                  src="/moana-logo.jpg"
                  alt="Moana Logo"
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-heading font-bold text-white tracking-wider">MOANA</h1>
                <p className="text-[10px] text-gray-400 tracking-[0.2em] uppercase">YACHTING</p>
              </div>
            </Link>

            {/* Navigation Tabs */}
            <nav className="hidden lg:flex items-center gap-6">
              <Link
                href="/dashboard"
                className={`flex items-center gap-2 py-2 text-sm font-medium transition-all border-b-2
                  ${!isLeadsPage && !isBateauASuivrePage && !isBateauChantierPage
                    ? 'border-secondary-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'}`}
              >
                <Ship className="h-4 w-4" />
                <span className="uppercase tracking-wide">Listings</span>
              </Link>
              <Link
                href="/dashboard/bateau-a-suivre"
                className={`flex items-center gap-2 py-2 text-sm font-medium transition-all border-b-2
                  ${isBateauASuivrePage
                    ? 'border-secondary-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'}`}
              >
                <Ship className="h-4 w-4" />
                <span className="uppercase tracking-wide">Bateau à Suivre</span>
              </Link>
              <Link
                href="/dashboard/bateau-chantier"
                className={`flex items-center gap-2 py-2 text-sm font-medium transition-all border-b-2
                  ${isBateauChantierPage
                    ? 'border-secondary-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'}`}
              >
                <Ship className="h-4 w-4" />
                <span className="uppercase tracking-wide">Bateau Chantier</span>
              </Link>
              <Link
                href="/dashboard/leads"
                className={`flex items-center gap-2 py-2 text-sm font-medium transition-all relative border-b-2
                  ${isLeadsPage
                    ? 'border-secondary-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'}`}
              >
                <Inbox className="h-4 w-4" />
                <span className="uppercase tracking-wide">Leads CRM</span>
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

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed top-0 left-0 h-full w-64 bg-primary-950 shadow-xl z-50 lg:hidden"
            >
              <div className="p-6 space-y-6">
                {/* Close button */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">MENU</h2>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Navigation Links */}
                <nav className="space-y-2">
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all
                      ${!isLeadsPage && !isBateauASuivrePage && !isBateauChantierPage
                        ? 'bg-secondary-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-primary-900'}`}
                  >
                    <Ship className="h-5 w-5" />
                    <span>Listings</span>
                  </Link>

                  <Link
                    href="/dashboard/bateau-a-suivre"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all
                      ${isBateauASuivrePage
                        ? 'bg-secondary-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-primary-900'}`}
                  >
                    <Ship className="h-5 w-5" />
                    <span>Bateau à Suivre</span>
                  </Link>

                  <Link
                    href="/dashboard/bateau-chantier"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all
                      ${isBateauChantierPage
                        ? 'bg-secondary-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-primary-900'}`}
                  >
                    <Ship className="h-5 w-5" />
                    <span>Bateau Chantier</span>
                  </Link>

                  <Link
                    href="/dashboard/leads"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all relative
                      ${isLeadsPage
                        ? 'bg-secondary-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-primary-900'}`}
                  >
                    <Inbox className="h-5 w-5" />
                    <span>Leads CRM</span>
                    {newLeadsCount > 0 && (
                      <span className="flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-xs font-bold text-primary-950 bg-secondary-500 rounded-full ml-auto">
                        {newLeadsCount > 99 ? '99+' : newLeadsCount}
                      </span>
                    )}
                  </Link>
                </nav>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
