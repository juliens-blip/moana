'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, ExternalLink, Sparkles, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { YatcoMarketPulseEntry } from '@/lib/types';

interface MarketPulseCardProps {
  entry: YatcoMarketPulseEntry;
  index?: number;
}

const FEED_BADGE: Record<YatcoMarketPulseEntry['feed_type'], { label: string; icon: React.ReactNode; className: string }> = {
  new: { label: 'Nouveau', icon: <Sparkles className="h-3 w-3" />, className: 'bg-sky-100 text-sky-700 border-sky-200' },
  modified: { label: 'Modifié', icon: <RefreshCw className="h-3 w-3" />, className: 'bg-amber-100 text-amber-700 border-amber-200' },
  sold: { label: 'Vendu', icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

export function MarketPulseCard({ entry, index = 0 }: MarketPulseCardProps) {
  const badge = FEED_BADGE[entry.feed_type];
  const bossUrl = `https://www.yatcoboss.com/search/vesseldetails/viewlisting/?vID=${entry.vid}`;
  const isMoana = entry.broker_name?.toLowerCase().includes('moana');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.03 }}
      className="bg-white rounded-lg shadow-md hover:shadow-xl overflow-hidden transition-shadow duration-300"
    >
      <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">{entry.vessel_name}</h3>
            <p className="text-primary-100 text-sm mt-1">{entry.builder || '—'} · {entry.model_year || '—'} · {entry.loa_text || '—'}</p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border ${badge.className}`}>
            {badge.icon}
            {badge.label}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-3">
        {entry.is_price_drop && entry.price_before_text && entry.price_after_text && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">
            <TrendingDown className="h-4 w-4 flex-shrink-0" />
            <span className="line-through text-red-400">{entry.price_before_text}</span>
            <span>→</span>
            <span>{entry.price_after_text}</span>
          </div>
        )}

        {!entry.is_price_drop && entry.price_text && (
          <div className="text-primary-700 font-semibold text-lg pb-2 border-b border-gray-200">
            {entry.price_text}
          </div>
        )}

        <div className="text-sm text-gray-600">{entry.location || '—'}</div>

        <div className="flex items-center justify-between text-sm">
          <span className={isMoana ? 'font-semibold text-secondary-700' : 'text-gray-500'}>
            {entry.broker_name || '—'}{isMoana ? ' (Moana)' : ''}
          </span>
          {entry.sold_date && <span className="text-xs text-gray-400">Vendu le {entry.sold_date}</span>}
        </div>

        {entry.history_text && (
          <div className="text-xs text-gray-500 italic pt-2 border-t border-gray-200">{entry.history_text}</div>
        )}

        <a
          href={bossUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 pt-3 mt-2 border-t border-gray-200 text-sm text-primary-700 hover:text-primary-900 font-medium"
        >
          Voir sur BOSS
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </motion.div>
  );
}
