import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import { Providers } from './providers';
import './globals.css';

// Force dynamic rendering to prevent prerender errors with framer-motion
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Moana Yachting - Gestion de Listings',
  description: 'Système de gestion des listings de bateaux pour Moana Yachting',
  applicationName: 'Moana Yachting',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Moana Yachting',
  },
  formatDetection: {
    telephone: false,
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/moana-logo.jpg', sizes: '192x192', type: 'image/jpeg' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/moana-logo.jpg', sizes: '180x180', type: 'image/jpeg' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0284c7',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="font-sans">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#fff',
                color: '#374151',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
