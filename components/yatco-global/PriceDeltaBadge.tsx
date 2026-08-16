import React from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { YatcoPriceFluctuation } from '@/lib/types';
import { formatNumber, formatNumberFlexible, cn } from '@/lib/utils';

interface PriceDeltaBadgeProps {
  fluctuation: YatcoPriceFluctuation | null;
}

export function PriceDeltaBadge({ fluctuation }: PriceDeltaBadgeProps) {
  const deltaUsd = fluctuation?.price_delta_usd ?? null;
  const deltaPct = fluctuation?.price_delta_pct ?? null;

  if (deltaUsd === null || deltaPct === null) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500"
        aria-label="Aucune variation de prix"
      >
        <Minus className="h-3 w-3" />
        —
      </span>
    );
  }

  const isDown = deltaUsd < 0;
  const isUp = deltaUsd > 0;
  const sign = isUp ? '+' : '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        isDown && 'bg-green-100 text-green-700',
        isUp && 'bg-red-100 text-red-700',
        !isDown && !isUp && 'bg-gray-100 text-gray-500'
      )}
      aria-label={`Variation de prix : ${sign}${formatNumber(deltaUsd)} dollars, ${sign}${formatNumberFlexible(deltaPct)} pourcent`}
    >
      {isDown && <TrendingDown className="h-3 w-3" />}
      {isUp && <TrendingUp className="h-3 w-3" />}
      {!isDown && !isUp && <Minus className="h-3 w-3" />}
      {sign}{formatNumber(deltaUsd)} $ ({sign}{formatNumberFlexible(deltaPct)} %)
    </span>
  );
}
