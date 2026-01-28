'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, Globe, Anchor, Calendar, MapPin, ExternalLink } from 'lucide-react';
import type { LeadWithBroker } from '@/lib/types';
import { LeadStatusBadge } from './LeadStatusBadge';
import { formatRelativeTime } from '@/lib/utils';

interface LeadCardProps {
  lead: LeadWithBroker;
  onClick?: (lead: LeadWithBroker) => void;
  index?: number;
}

export function LeadCard({ lead, onClick, index = 0 }: LeadCardProps) {
  const handleClick = () => {
    onClick?.(lead);
  };

  const timeAgo = formatRelativeTime(lead.received_at);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      className="bg-white rounded-lg shadow-md hover:shadow-xl overflow-hidden
                 transition-shadow duration-300 cursor-pointer group"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-secondary-600 to-primary-600 px-5 py-3 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white truncate group-hover:translate-x-1 transition-transform">
            {lead.contact_display_name}
          </h3>
          <p className="text-secondary-100 text-sm mt-0.5 truncate">
            {lead.detailed_source_summary || lead.source}
          </p>
        </div>
        <LeadStatusBadge status={lead.status} size="sm" />
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* Contact Info */}
        <div className="space-y-2">
          {lead.contact_email && (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="h-4 w-4 text-primary-500 flex-shrink-0" />
              <a
                href={`mailto:${lead.contact_email}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm truncate hover:text-primary-600 transition-colors"
              >
                {lead.contact_email}
              </a>
            </div>
          )}
          {lead.contact_phone && (
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4 text-primary-500 flex-shrink-0" />
              <a
                href={`tel:${lead.contact_phone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm hover:text-primary-600 transition-colors"
              >
                {lead.contact_phone}
              </a>
            </div>
          )}
          {lead.contact_country && (
            <div className="flex items-center gap-2 text-gray-600">
              <Globe className="h-4 w-4 text-primary-500 flex-shrink-0" />
              <span className="text-sm">{lead.contact_country}</span>
            </div>
          )}
        </div>

        {/* Boat Info (if available) */}
        {(lead.boat_make || lead.boat_model) && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-gray-800 font-medium mb-2">
              <Anchor className="h-4 w-4 text-primary-500" />
              <span className="text-sm">
                {[lead.boat_make, lead.boat_model].filter(Boolean).join(' ')}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-gray-600">
              {lead.boat_year && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {lead.boat_year}
                </span>
              )}
              {lead.boat_length_value && (
                <span>{lead.boat_length_value} {lead.boat_length_units || 'ft'}</span>
              )}
              {lead.boat_price_amount && (
                <span className="font-medium text-primary-600">
                  {parseInt(lead.boat_price_amount).toLocaleString()} {lead.boat_price_currency || 'EUR'}
                </span>
              )}
            </div>
            {lead.boat_url && (
              <a
                href={lead.boat_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 mt-2 text-xs text-primary-600 hover:text-primary-800 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Voir l&apos;annonce
              </a>
            )}
          </div>
        )}

        {/* Customer Comments Preview */}
        {lead.customer_comments && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-600 line-clamp-2">
              &quot;{lead.customer_comments}&quot;
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>{timeAgo}</span>
          <span>{lead.request_type || 'Contact'}</span>
        </div>
      </div>
    </motion.div>
  );
}
