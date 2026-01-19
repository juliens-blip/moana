'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, Globe, Anchor, Calendar, User } from 'lucide-react';
import type { LeadWithBroker } from '@/lib/types';
import { LeadStatusBadge } from './LeadStatusBadge';
import { formatDate, formatRelativeTime } from '@/lib/utils';

interface LeadTableProps {
  leads: LeadWithBroker[];
  onRowClick?: (lead: LeadWithBroker) => void;
  showBroker?: boolean;
  showSource?: boolean;
  showBoat?: boolean;
  emptyState?: React.ReactNode;
}

export function LeadTable({
  leads,
  onRowClick,
  showBroker = true,
  showSource = true,
  showBoat = true,
  emptyState
}: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        {emptyState || 'Aucun lead à afficher'}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
              {showSource && (
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>
              )}
              {showBoat && (
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Bateau</th>
              )}
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reçu</th>
              {showBroker && (
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Broker</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {leads.map((lead, index) => {
              const receivedLabel = formatRelativeTime(lead.received_at);
              const receivedDate = formatDate(lead.received_at, 'PPpp');
              const sourceLabel = lead.detailed_source_summary || lead.source;
              const boatLabel = [lead.boat_make, lead.boat_model].filter(Boolean).join(' ');

              return (
                <motion.tr
                  key={lead.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.03 }}
                  onClick={() => onRowClick?.(lead)}
                  className={
                    onRowClick
                      ? 'cursor-pointer hover:bg-gray-50 transition-colors'
                      : undefined
                  }
                >
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary-500" />
                        <span className="text-sm font-semibold text-gray-900">
                          {lead.contact_display_name}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        {lead.contact_email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {lead.contact_email}
                          </span>
                        )}
                        {lead.contact_phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {lead.contact_phone}
                          </span>
                        )}
                        {lead.contact_country && (
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" />
                            {lead.contact_country}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {showSource && (
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="font-medium text-gray-900">
                        {sourceLabel || '—'}
                      </div>
                      {lead.request_type && (
                        <div className="text-xs text-gray-500">{lead.request_type}</div>
                      )}
                    </td>
                  )}
                  {showBoat && (
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {boatLabel ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-gray-900 font-medium">
                            <Anchor className="h-4 w-4 text-primary-500" />
                            <span>{boatLabel}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                            {lead.boat_year && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {lead.boat_year}
                              </span>
                            )}
                            {lead.boat_length_value && (
                              <span>
                                {lead.boat_length_value} {lead.boat_length_units || 'ft'}
                              </span>
                            )}
                            {lead.boat_price_amount && (
                              <span className="text-primary-600 font-medium">
                                {parseInt(lead.boat_price_amount, 10).toLocaleString()} {lead.boat_price_currency || 'EUR'}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <LeadStatusBadge status={lead.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div className="font-medium text-gray-900">{receivedLabel}</div>
                    <div className="text-xs text-gray-500">{receivedDate}</div>
                  </td>
                  {showBroker && (
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {lead.broker_name || '—'}
                    </td>
                  )}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
