const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.airtable\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'airtable-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 // 1 heure
        },
        networkTimeoutSeconds: 10
      }
    },
    {
      urlPattern: /^https:\/\/dl\.airtable\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'airtable-images',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 7 // 1 semaine
        }
      }
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['dl.airtable.com'],
    formats: ['image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  compress: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

// Temporarily disable PWA to test build
module.exports = nextConfig;
// module.exports = withPWA(nextConfig);
