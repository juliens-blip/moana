'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Euro, TrendingDown, MessageSquare, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Listing } from '@/lib/types';
import { formatNumberFlexible } from '@/lib/utils';
import { Button } from '@/components/ui';
import { MoanaLogoIcon } from './MoanaLogoIcon';

interface ListingDetailModalProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onListingUpdated?: (listing: Listing) => void;
  apiBasePath?: string;
}

export function ListingDetailModal({
  listing,
  isOpen,
  onClose,
  onListingUpdated,
  apiBasePath = '/api/listings'
}: ListingDetailModalProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(listing?.image_url || null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!listing) return;
    setPreviewUrl(listing.image_url || null);
  }, [listing]);

  const handleImageUpload = async (file: File | null, source: 'gallery' | 'camera' = 'gallery') => {
    if (!listing) {
      console.warn('[Mobile Upload] No listing selected');
      return;
    }
    if (!file) {
      console.warn('[Mobile Upload] No file selected');
      return;
    }

    console.log('[Mobile Upload] Starting upload:', {
      source,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      listingId: listing.id
    });

    // Validation côté client
    if (!file.type.startsWith('image/')) {
      toast.error('Format image invalide');
      console.error('[Mobile Upload] Invalid file type:', file.type);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image trop lourde (max 5 Mo)');
      console.error('[Mobile Upload] File too large:', file.size);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);

    try {
      console.log('[Mobile Upload] Sending request to:', `/api/listings/${listing.id}/image`);

      const response = await fetch(`${apiBasePath}/${listing.id}/image`, {
        method: 'POST',
        body: formData,
      });

      console.log('[Mobile Upload] Response status:', response.status);

      const data = await response.json();
      console.log('[Mobile Upload] Response data:', data);

      if (data.success) {
        setPreviewUrl(data.data?.image_url || null);
        onListingUpdated?.(data.data);
        toast.success('Image ajoutée');
        console.log('[Mobile Upload] Upload successful');

        // Reset input après succès
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
      } else {
        toast.error(data.error || 'Erreur lors de l\'upload');
        console.error('[Mobile Upload] Upload failed:', data.error);
      }
    } catch (error) {
      console.error('[Mobile Upload] Error uploading image:', error);
      toast.error('Erreur de connexion');
    } finally {
      setUploading(false);
    }
  };

  const handleImageDelete = async () => {
    if (!listing || !listing.image_url) return;

    setUploading(true);

    try {
      const response = await fetch(`${apiBasePath}/${listing.id}/image`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        setPreviewUrl(null);
        onListingUpdated?.(data.data);
        toast.success('Image supprimée');
      } else {
        toast.error(data.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      toast.error('Erreur de connexion');
    } finally {
      setUploading(false);
    }
  };

  if (!listing) return null;

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
                <Image
                  src="/branding/moana-logo.jpg"
                  alt=""
                  aria-hidden
                  width={56}
                  height={56}
                  className="pointer-events-none absolute right-6 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full object-cover opacity-20"
                />
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-all hover:rotate-90 duration-300"
                >
                  <X className="h-5 w-5 text-white" />
                </button>
                <h2 className="text-2xl font-bold text-white pr-12">{listing.nom_bateau}</h2>
                <p className="text-primary-100 mt-1">{listing.constructeur}</p>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Image Upload */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-lg">Photo du bateau</h3>
                    {uploading && <span className="text-sm text-gray-500">Upload en cours...</span>}
                  </div>
                  <div className="relative h-48 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                    {previewUrl ? (
                      <Image
                        src={previewUrl}
                        alt={`Photo ${listing.nom_bateau}`}
                        fill
                        sizes="(min-width: 768px) 600px, 90vw"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                        Aucune image pour ce bateau
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <Image
                        src="/branding/moana-logo.jpg"
                        alt=""
                        aria-hidden
                        width={96}
                        height={96}
                        className="h-24 w-24 rounded-full object-cover opacity-20"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Input pour galerie - invisible mais accessible pour iOS */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={uploading}
                      onChange={(event) => {
                        console.log('[Mobile Upload] Gallery input triggered');
                        handleImageUpload(event.target.files?.[0] || null, 'gallery');
                      }}
                      aria-label="Choisir une image depuis la galerie"
                    />
                    {/* Input pour caméra - invisible mais accessible pour iOS */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      disabled={uploading}
                      onChange={(event) => {
                        console.log('[Mobile Upload] Camera input triggered');
                        handleImageUpload(event.target.files?.[0] || null, 'camera');
                      }}
                      aria-label="Prendre une photo"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={uploading}
                      onClick={() => {
                        console.log('[Mobile Upload] Camera button clicked');
                        cameraInputRef.current?.click();
                      }}
                    >
                      📷 Prendre une photo
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={uploading}
                      onClick={() => {
                        console.log('[Mobile Upload] Gallery button clicked');
                        fileInputRef.current?.click();
                      }}
                    >
                      🖼️ Galerie
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={uploading || !listing.image_url}
                      onClick={handleImageDelete}
                    >
                      Supprimer
                    </Button>
                    <span className="text-xs text-gray-500">Max 5 Mo</span>
                  </div>
                </motion.div>

                {/* Price Section */}
                {listing.prix_actuel && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-primary-50 rounded-lg p-4 border border-primary-100"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-primary-700 font-bold text-2xl">
                          <span>{listing.prix_actuel}</span>
                        </div>
                        <p className="text-sm text-primary-600 mt-1">Prix actuel</p>
                      </div>
                      {listing.prix_precedent && (
                        <div className="text-right">
                          <div className="flex items-center gap-2 text-gray-600">
                            <TrendingDown className="h-5 w-5" />
                            <span className="font-semibold">{listing.prix_precedent}</span>
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
                      <MoanaLogoIcon className="h-5 w-5" />
                      <span className="font-semibold">Longueur</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{formatNumberFlexible(listing.longueur_m, 2)} m</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary-500 mb-1">
                      <MoanaLogoIcon className="h-5 w-5" />
                      <span className="font-semibold">Année</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{listing.annee}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary-500 mb-1">
                      <MoanaLogoIcon className="h-5 w-5" />
                      <span className="font-semibold">Localisation</span>
                    </div>
                    <p className="text-lg font-medium text-gray-900">{listing.localisation}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary-500 mb-1">
                      <MoanaLogoIcon className="h-5 w-5" />
                      <span className="font-semibold">Broker</span>
                    </div>
                    <p className="text-lg font-medium text-gray-900">{(listing as any).brokers?.broker_name || 'N/A'}</p>
                  </div>

                  {listing.nombre_cabines && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-primary-500 mb-1">
                        <MoanaLogoIcon className="h-5 w-5" />
                        <span className="font-semibold">Cabines</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">{listing.nombre_cabines}</p>
                    </div>
                  )}
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
                      <p className="font-medium text-gray-900 mt-1">{listing.proprietaire}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Capitaine</p>
                      <p className="font-medium text-gray-900 mt-1">{listing.capitaine}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Messages and Comments */}
                {(listing.dernier_message || listing.commentaire) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="space-y-4 pt-4 border-t border-gray-200"
                  >
                    {listing.dernier_message && (
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-blue-700 mb-2">
                          <MessageSquare className="h-5 w-5" />
                          <span className="font-semibold">Dernier message</span>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{listing.dernier_message}</p>
                      </div>
                    )}

                    {listing.commentaire && (
                      <div className="bg-amber-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-amber-700 mb-2">
                          <FileText className="h-5 w-5" />
                          <span className="font-semibold">Commentaire</span>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{listing.commentaire}</p>
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
