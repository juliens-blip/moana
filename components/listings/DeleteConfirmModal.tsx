'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import type { Listing } from '@/lib/types';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  listing: Listing | null;
  loading?: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  listing,
  loading = false,
}: DeleteConfirmModalProps) {
  if (!listing) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirmer la suppression"
      size="sm"
      closeOnOverlayClick={!loading}
    >
      <div className="space-y-4">
        {/* Warning Icon */}
        <div className="flex justify-center animate-scale-in" style={{ animationDelay: '200ms' }}>
          <div className="rounded-full bg-red-100 p-3 animate-pulse-soft">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>

        {/* Message */}
        <div className="text-center space-y-2 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <p className="text-gray-900 font-medium">
            Êtes-vous sûr de vouloir supprimer ce bateau ?
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-left transition-smooth hover:bg-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              {listing.nom_bateau}
            </p>
            <p className="text-sm text-gray-600">
              {listing.constructeur} • {listing.annee}
            </p>
          </div>
          <p className="text-sm text-red-600 font-medium">
            Cette action est irréversible.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
            className="flex-1"
          >
            Supprimer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
