'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseNewLeadsCountOptions {
  pollingInterval?: number; // in milliseconds, default 30000 (30s)
  enabled?: boolean;
}

export function useNewLeadsCount(options: UseNewLeadsCountOptions = {}) {
  const { pollingInterval = 30000, enabled = true } = options;
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCount = useCallback(async () => {
    if (!enabled) return;

    try {
      const response = await fetch('/api/leads?stats=true&limit=0');
      const data = await response.json();

      if (data.success && data.data?.stats) {
        setCount(data.data.stats.new_leads || 0);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch leads count'));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  // Initial fetch
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Polling
  useEffect(() => {
    if (!enabled || pollingInterval <= 0) return;

    const interval = setInterval(fetchCount, pollingInterval);
    return () => clearInterval(interval);
  }, [enabled, pollingInterval, fetchCount]);

  return {
    count,
    loading,
    error,
    refetch: fetchCount
  };
}
