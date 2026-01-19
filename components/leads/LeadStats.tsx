'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Users, UserPlus, UserCheck, Trophy, UserX, TrendingUp } from 'lucide-react';

interface LeadStatsProps {
  stats: {
    total_leads: number;
    new_leads: number;
    contacted_leads: number;
    qualified_leads: number;
    converted_leads: number;
    lost_leads: number;
    latest_lead_date: string | null;
  } | null;
}

const statCards = [
  {
    key: 'new_leads',
    label: 'Nouveaux',
    icon: UserPlus,
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-500',
    borderColor: 'border-blue-200'
  },
  {
    key: 'contacted_leads',
    label: 'Contactés',
    icon: Users,
    bgColor: 'bg-yellow-50',
    iconColor: 'text-yellow-500',
    borderColor: 'border-yellow-200'
  },
  {
    key: 'qualified_leads',
    label: 'Qualifiés',
    icon: UserCheck,
    bgColor: 'bg-purple-50',
    iconColor: 'text-purple-500',
    borderColor: 'border-purple-200'
  },
  {
    key: 'converted_leads',
    label: 'Convertis',
    icon: Trophy,
    bgColor: 'bg-green-50',
    iconColor: 'text-green-500',
    borderColor: 'border-green-200'
  }
];

export function LeadStats({ stats }: LeadStatsProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
            <div className="h-8 w-8 bg-gray-200 rounded-lg mb-3"></div>
            <div className="h-6 w-12 bg-gray-200 rounded mb-1"></div>
            <div className="h-4 w-20 bg-gray-100 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  const conversionRate = stats.total_leads > 0
    ? ((stats.converted_leads / stats.total_leads) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-4">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          const value = stats[card.key as keyof typeof stats] as number;

          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className={`${card.bgColor} rounded-lg border ${card.borderColor} p-4 hover:shadow-md transition-shadow`}
            >
              <div className={`h-10 w-10 rounded-lg ${card.bgColor} flex items-center justify-center mb-3`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-600">{card.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Summary Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm text-gray-500">Total leads</p>
            <p className="text-xl font-bold text-gray-900">{stats.total_leads}</p>
          </div>
          <div className="h-10 w-px bg-gray-200"></div>
          <div>
            <p className="text-sm text-gray-500">Perdus</p>
            <p className="text-xl font-bold text-gray-400">{stats.lost_leads}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-primary-50 px-4 py-2 rounded-lg">
          <TrendingUp className="h-5 w-5 text-primary-500" />
          <div>
            <p className="text-xs text-primary-600">Taux de conversion</p>
            <p className="text-lg font-bold text-primary-700">{conversionRate}%</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
