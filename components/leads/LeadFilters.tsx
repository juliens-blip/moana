'use client';

import React from 'react';
import { Search, X, Filter, Calendar } from 'lucide-react';

interface LeadFiltersProps {
  search: string;
  status: string;
  source: string;
  dateFrom?: string;
  dateTo?: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onClear: () => void;
  sources?: string[];
}

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'NEW', label: 'Nouveau' },
  { value: 'CONTACTED', label: 'Contacté' },
  { value: 'QUALIFIED', label: 'Qualifié' },
  { value: 'CONVERTED', label: 'Converti' },
  { value: 'LOST', label: 'Perdu' }
];

export function LeadFilters({
  search,
  status,
  source,
  dateFrom,
  dateTo,
  onSearchChange,
  onStatusChange,
  onSourceChange,
  onDateFromChange,
  onDateToChange,
  onClear,
  sources = []
}: LeadFiltersProps) {
  const hasFilters = search || status || source || dateFrom || dateTo;
  const showDateFilters = Boolean(onDateFromChange || onDateToChange);

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition-smooth p-4 animate-slide-down hw-accelerate">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Filtres</span>
        {hasFilters && (
          <button
            onClick={onClear}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-smooth"
          >
            <X className="h-3 w-3" />
            Effacer
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Search */}
        <div className="relative lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm
                     focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-smooth"
          />
        </div>

        {/* Status Filter */}
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm
                   focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-smooth"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Source Filter */}
        <select
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm
                   focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-smooth"
        >
          <option value="">Toutes les sources</option>
          {sources.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>

        {/* Date From */}
        {showDateFilters && (
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={dateFrom || ''}
              onChange={(e) => onDateFromChange?.(e.target.value)}
              placeholder="Du"
              title="Date de début"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm
                       focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-smooth"
            />
          </div>
        )}

        {/* Date To */}
        {showDateFilters && (
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={dateTo || ''}
              onChange={(e) => onDateToChange?.(e.target.value)}
              placeholder="Au"
              title="Date de fin"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm
                       focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-smooth"
            />
          </div>
        )}
      </div>
    </div>
  );
}
