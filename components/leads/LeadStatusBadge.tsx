'use client';

import React from 'react';
import type { LeadStatus } from '@/lib/types';

interface LeadStatusBadgeProps {
  status: LeadStatus;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

const statusConfig: Record<LeadStatus, { label: string; bg: string; text: string; ring: string }> = {
  NEW: {
    label: 'Nouveau',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    ring: 'ring-blue-600/20'
  },
  CONTACTED: {
    label: 'Contacté',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    ring: 'ring-yellow-600/20'
  },
  QUALIFIED: {
    label: 'Qualifié',
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    ring: 'ring-purple-600/20'
  },
  CONVERTED: {
    label: 'Converti',
    bg: 'bg-green-100',
    text: 'text-green-800',
    ring: 'ring-green-600/20'
  },
  LOST: {
    label: 'Perdu',
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    ring: 'ring-gray-600/20'
  }
};

export function LeadStatusBadge({ status, size = 'md', onClick }: LeadStatusBadgeProps) {
  const config = statusConfig[status];

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs'
    : 'px-2.5 py-1 text-sm';

  const baseClasses = `inline-flex items-center rounded-full font-medium ring-1 ring-inset ${config.bg} ${config.text} ${config.ring} ${sizeClasses}`;

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${baseClasses} cursor-pointer hover:opacity-80 transition-opacity`}
      >
        {config.label}
      </button>
    );
  }

  return (
    <span className={baseClasses}>
      {config.label}
    </span>
  );
}

export function LeadStatusSelect({
  value,
  onChange
}: {
  value: LeadStatus;
  onChange: (status: LeadStatus) => void;
}) {
  const statuses: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'];

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => (
        <button
          key={status}
          onClick={() => onChange(status)}
          className={`
            ${statusConfig[status].bg}
            ${statusConfig[status].text}
            ${statusConfig[status].ring}
            px-3 py-1.5 rounded-full text-sm font-medium ring-1 ring-inset
            transition-all duration-200
            ${value === status
              ? 'ring-2 ring-offset-1'
              : 'opacity-60 hover:opacity-100'}
          `}
        >
          {statusConfig[status].label}
        </button>
      ))}
    </div>
  );
}
