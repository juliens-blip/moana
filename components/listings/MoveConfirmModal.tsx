'use client';

import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import type { Listing } from '@/lib/types';

interface MoveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  listing: Listing | null;
  targetLabel: string;
  loading?: boolean;
}

export function MoveConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  listing,
  targetLabel,
  loading = false,
}: MoveConfirmModalProps) {
  if (!listing) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirmer le déplacement"
      size="sm"
      closeOnOverlayClick={!loading}
    >
      <div className="space-y-4">
        <div className="flex justify-center animate-scale-in" style={{ animationDelay: '200ms' }}>
          <div className="rounded-full bg-primary-100 p-3 animate-pulse-soft">
            <ArrowRightLeft className="h-8 w-8 text-primary-600" />
          </div>
        </div>

        <div className="text-center space-y-2 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <p className="text-gray-900 font-medium">
            Déplacer ce bateau vers {targetLabel} ?
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-left transition-smooth hover:bg-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              {listing.nom_bateau}
            </p>
            <p className="text-sm text-gray-600">
              {listing.constructeur} • {listing.annee || '—'}
            </p>
          </div>
        </div>

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
            variant="primary"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
            className="flex-1"
          >
            Déplacer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
