'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error] Unhandled error:', error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1>Une erreur est survenue</h1>
          <p>Merci de réessayer.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
