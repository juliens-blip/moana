'use client';

import React from 'react';
import { Search, X, Anchor, Euro, MapPin, User } from 'lucide-react';
import { Input, Select, Button } from '@/components/ui';

interface ListingFiltersProps {
  search: string;
  broker: string;
  localisation: string;
  minLength: string;
  maxLength: string;
  minPrix: string;
  maxPrix: string;
  onSearchChange: (value: string) => void;
  onBrokerChange: (value: string) => void;
  onLocalisationChange: (value: string) => void;
  onMinLengthChange: (value: string) => void;
  onMaxLengthChange: (value: string) => void;
  onMinPrixChange: (value: string) => void;
  onMaxPrixChange: (value: string) => void;
  onClear: () => void;
}

export function ListingFilters({
  search,
  broker,
  localisation,
  minLength,
  maxLength,
  minPrix,
  maxPrix,
  onSearchChange,
  onBrokerChange,
  onLocalisationChange,
  onMinLengthChange,
  onMaxLengthChange,
  onMinPrixChange,
  onMaxPrixChange,
  onClear,
}: ListingFiltersProps) {
  const hasFilters = search || broker || localisation || minLength || maxLength || minPrix || maxPrix;

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition-smooth p-4 space-y-4 animate-slide-down hw-accelerate" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Filtres</h3>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClear} className="animate-fade-in">
            <X className="h-4 w-4 mr-1" />
            Effacer
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 transition-smooth">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Rechercher un bateau..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-md border border-gray-300
                       transition-smooth hw-accelerate
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                       focus:scale-[1.01] focus:shadow-md
                       hover:border-gray-400"
          />
        </div>

        {/* Broker Filter */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 transition-smooth">
            <User className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Filtrer par broker..."
            value={broker}
            onChange={(e) => onBrokerChange(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-md border border-gray-300
                       transition-smooth hw-accelerate
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                       focus:scale-[1.01] focus:shadow-md
                       hover:border-gray-400"
          />
        </div>

        {/* Localisation Filter (now free text) */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 transition-smooth">
            <MapPin className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Localisation..."
            value={localisation}
            onChange={(e) => onLocalisationChange(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-md border border-gray-300
                       transition-smooth hw-accelerate
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                       focus:scale-[1.01] focus:shadow-md
                       hover:border-gray-400"
          />
        </div>

        {/* Length Range */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Anchor className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 transition-smooth" />
            <input
              type="number"
              placeholder="Min (m)"
              value={minLength}
              onChange={(e) => onMinLengthChange(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-md border border-gray-300
                         transition-smooth hw-accelerate
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         focus:scale-[1.01] focus:shadow-md
                         hover:border-gray-400"
              min="0"
              step="0.1"
            />
          </div>
          <span className="text-gray-500">-</span>
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Max (m)"
              value={maxLength}
              onChange={(e) => onMaxLengthChange(e.target.value)}
              className="w-full h-10 pl-4 pr-4 rounded-md border border-gray-300
                         transition-smooth hw-accelerate
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         focus:scale-[1.01] focus:shadow-md
                         hover:border-gray-400"
              min="0"
              step="0.1"
            />
          </div>
        </div>

        {/* Price Range */}
        <div className="flex gap-2 items-center lg:col-span-2">
          <div className="relative flex-1">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 transition-smooth" />
            <input
              type="number"
              placeholder="Prix min (€)"
              value={minPrix}
              onChange={(e) => onMinPrixChange(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-md border border-gray-300
                         transition-smooth hw-accelerate
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         focus:scale-[1.01] focus:shadow-md
                         hover:border-gray-400"
              min="0"
              step="1000"
            />
          </div>
          <span className="text-gray-500">-</span>
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Prix max (€)"
              value={maxPrix}
              onChange={(e) => onMaxPrixChange(e.target.value)}
              className="w-full h-10 pl-4 pr-4 rounded-md border border-gray-300
                         transition-smooth hw-accelerate
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         focus:scale-[1.01] focus:shadow-md
                         hover:border-gray-400"
              min="0"
              step="1000"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
