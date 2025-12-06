'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Anchor, Calendar, MapPin, User, Euro, TrendingDown, MessageSquare, FileText } from 'lucide-react';
import type { Listing } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface ListingDetailModalProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ListingDetailModal({ listing, isOpen, onClose }: ListingDetailModalProps) {
  if (!listing) return null;

  const { fields } = listing;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, type: 'spring', bounce: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto">
              {/* Header with gradient */}
              <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-6 rounded-t-2xl relative">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-all hover:rotate-90 duration-300"
                >
                  <X className="h-5 w-5 text-white" />
                </button>
                <h2 className="text-2xl font-bold text-white pr-12">{fields['Nom du Bateau']}</h2>
                <p className="text-primary-100 mt-1">{fields.Constructeur}</p>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Price Section */}
                {fields['Prix Actuel (€/$)'] && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-primary-50 rounded-lg p-4 border border-primary-100"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-primary-700 font-bold text-2xl">
                          <Euro className="h-6 w-6" />
                          <span>{fields['Prix Actuel (€/$)']}</span>
                        </div>
                        <p className="text-sm text-primary-600 mt-1">Prix actuel</p>
                      </div>
                      {fields['Prix Précédent (€/$)'] && (
                        <div className="text-right">
                          <div className="flex items-center gap-2 text-gray-600">
                            <TrendingDown className="h-5 w-5" />
                            <span className="font-semibold">{fields['Prix Précédent (€/$)']}</span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">Prix précédent</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Specs Grid */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary-500 mb-1">
                      <Anchor className="h-5 w-5" />
                      <span className="font-semibold">Longueur</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{formatNumber(fields['Longueur (M/pieds)'], 1)} m</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary-500 mb-1">
                      <Calendar className="h-5 w-5" />
                      <span className="font-semibold">Année</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{fields.Année}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary-500 mb-1">
                      <MapPin className="h-5 w-5" />
                      <span className="font-semibold">Localisation</span>
                    </div>
                    <p className="text-lg font-medium text-gray-900">{fields.Localisation}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary-500 mb-1">
                      <User className="h-5 w-5" />
                      <span className="font-semibold">Broker</span>
                    </div>
                    <p className="text-lg font-medium text-gray-900">{fields.Broker}</p>
                  </div>
                </motion.div>

                {/* Details Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-3 pt-4 border-t border-gray-200"
                >
                  <h3 className="font-semibold text-gray-900 text-lg">Détails</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Propriétaire</p>
                      <p className="font-medium text-gray-900 mt-1">{fields.Propriétaire}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Capitaine</p>
                      <p className="font-medium text-gray-900 mt-1">{fields.Capitaine}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Messages and Comments */}
                {(fields['Dernier message'] || fields['Commentaire']) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="space-y-4 pt-4 border-t border-gray-200"
                  >
                    {fields['Dernier message'] && (
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-blue-700 mb-2">
                          <MessageSquare className="h-5 w-5" />
                          <span className="font-semibold">Dernier message</span>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{fields['Dernier message']}</p>
                      </div>
                    )}

                    {fields['Commentaire'] && (
                      <div className="bg-amber-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-amber-700 mb-2">
                          <FileText className="h-5 w-5" />
                          <span className="font-semibold">Commentaire</span>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{fields['Commentaire']}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
