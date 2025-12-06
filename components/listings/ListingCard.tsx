'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Edit2, Trash2, MapPin, Calendar, Anchor, User, Euro } from 'lucide-react';
import type { Listing } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui';

interface ListingCardProps {
  listing: Listing;
  onDelete?: (id: string) => void;
  onClick?: (listing: Listing) => void;
  canEdit?: boolean;
  index?: number;
}

export function ListingCard({ listing, onDelete, onClick, canEdit = true, index = 0 }: ListingCardProps) {
  const { id, fields } = listing;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking on buttons
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
      return;
    }
    onClick?.(listing);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ scale: 1.03, y: -8 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleCardClick}
      className="bg-white rounded-lg shadow-md hover:shadow-2xl overflow-hidden
                 transition-shadow duration-300 cursor-pointer group"
    >
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-4 transition-smooth group-hover:from-primary-700 group-hover:to-secondary-700">
        <h3 className="text-xl font-bold text-white transition-smooth group-hover:translate-x-1">{fields['Nom du Bateau']}</h3>
        <p className="text-primary-100 text-sm mt-1 transition-smooth group-hover:translate-x-1">{fields.Constructeur}</p>
      </div>

      {/* Content */}
      <div className="p-6 space-y-3">
        {/* Price (if available) */}
        {fields['Prix Actuel (€/$)'] && (
          <div className="flex items-center gap-2 text-primary-700 font-semibold text-lg pb-3 border-b border-gray-200">
            <Euro className="h-5 w-5" />
            <span>{fields['Prix Actuel (€/$)']}</span>
          </div>
        )}

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-gray-600">
            <Anchor className="h-4 w-4 text-primary-500" />
            <span className="text-sm">
              {formatNumber(fields['Longueur (M/pieds)'], 1)} m
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="h-4 w-4 text-primary-500" />
            <span className="text-sm">{fields.Année}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <MapPin className="h-4 w-4 text-primary-500" />
            <span className="text-sm">{fields.Localisation}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <User className="h-4 w-4 text-primary-500" />
            <span className="text-sm">{fields.Broker}</span>
          </div>
        </div>

        {/* Details */}
        <div className="pt-3 border-t border-gray-200 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Propriétaire:</span>
            <span className="font-medium text-gray-900">{fields.Propriétaire}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Capitaine:</span>
            <span className="font-medium text-gray-900">{fields.Capitaine}</span>
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="flex gap-2 pt-4 border-t border-gray-200">
            <Link href={`/dashboard/listings/${id}/edit`} className="flex-1">
              <Button variant="secondary" size="sm" className="w-full">
                <Edit2 className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            </Link>
            {onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(id);
                }}
                className="flex-1"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
