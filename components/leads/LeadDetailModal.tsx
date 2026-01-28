'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mail, Phone, Globe, Anchor, Calendar, MapPin,
  ExternalLink, MessageSquare, User, Clock, Building2,
  CheckCircle, XCircle, PhoneCall, Trophy
} from 'lucide-react';
import type { LeadWithBroker, LeadStatus } from '@/lib/types';
import { LeadStatusBadge, LeadStatusSelect } from './LeadStatusBadge';
import { Button } from '@/components/ui';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface LeadDetailModalProps {
  lead: LeadWithBroker | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdated?: (lead: LeadWithBroker) => void;
}

export function LeadDetailModal({ lead, isOpen, onClose, onLeadUpdated }: LeadDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newStatus, setNewStatus] = useState<LeadStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    if (!lead) {
      setNotes('');
      return;
    }
    setNotes(lead.lead_comments || '');
  }, [lead]);

  if (!lead) return null;

  const handleStatusChange = async (status: LeadStatus) => {
    setNewStatus(status);
  };

  const handleQuickStatusChange = async (status: LeadStatus) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Statut mis à jour: ${getStatusLabel(status)}`);
        onLeadUpdated?.({ ...lead, status });
      } else {
        toast.error(data.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Erreur de connexion');
    } finally {
      setSaving(false);
    }
  };

  const getStatusLabel = (status: LeadStatus): string => {
    const labels: Record<LeadStatus, string> = {
      NEW: 'Nouveau',
      CONTACTED: 'Contacté',
      QUALIFIED: 'Qualifié',
      CONVERTED: 'Converti',
      LOST: 'Perdu'
    };
    return labels[status];
  };

  const getQuickActions = (): Array<{ status: LeadStatus; label: string; icon: React.ReactNode; variant: 'primary' | 'secondary' | 'danger' }> => {
    switch (lead.status) {
      case 'NEW':
        return [
          { status: 'CONTACTED', label: 'Marquer Contacté', icon: <PhoneCall className="h-4 w-4" />, variant: 'primary' },
          { status: 'LOST', label: 'Marquer Perdu', icon: <XCircle className="h-4 w-4" />, variant: 'danger' }
        ];
      case 'CONTACTED':
        return [
          { status: 'QUALIFIED', label: 'Marquer Qualifié', icon: <CheckCircle className="h-4 w-4" />, variant: 'primary' },
          { status: 'LOST', label: 'Marquer Perdu', icon: <XCircle className="h-4 w-4" />, variant: 'danger' }
        ];
      case 'QUALIFIED':
        return [
          { status: 'CONVERTED', label: 'Marquer Converti', icon: <Trophy className="h-4 w-4" />, variant: 'primary' },
          { status: 'LOST', label: 'Marquer Perdu', icon: <XCircle className="h-4 w-4" />, variant: 'danger' }
        ];
      case 'CONVERTED':
        return [
          { status: 'LOST', label: 'Annuler Conversion', icon: <XCircle className="h-4 w-4" />, variant: 'danger' }
        ];
      case 'LOST':
        return [
          { status: 'NEW', label: 'Réactiver', icon: <CheckCircle className="h-4 w-4" />, variant: 'secondary' }
        ];
      default:
        return [];
    }
  };

  const handleSave = async () => {
    if (!newStatus || newStatus === lead.status) {
      setIsEditing(false);
      setNewStatus(null);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Statut mis à jour');
        onLeadUpdated?.({ ...lead, status: newStatus });
        setIsEditing(false);
        setNewStatus(null);
      } else {
        toast.error(data.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Erreur de connexion');
    } finally {
      setSaving(false);
    }
  };

  const receivedDate = new Date(lead.received_at);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl"
            >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-secondary-600 to-primary-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{lead.contact_display_name}</h2>
                <p className="text-secondary-100 text-sm mt-0.5">
                  {lead.detailed_source_summary || lead.source}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status Section */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Statut</span>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <LeadStatusSelect
                      value={newStatus || lead.status}
                      onChange={handleStatusChange}
                    />
                  </div>
                ) : (
                  <LeadStatusBadge
                    status={lead.status}
                    onClick={() => setIsEditing(true)}
                  />
                )}
              </div>

              {isEditing && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsEditing(false);
                      setNewStatus(null);
                    }}
                    disabled={saving}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    loading={saving}
                  >
                    Sauvegarder
                  </Button>
                </div>
              )}

              {/* Quick Actions */}
              {!isEditing && getQuickActions().length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="w-full text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Actions rapides
                  </span>
                  {getQuickActions().map((action) => (
                    <Button
                      key={action.status}
                      variant={action.variant}
                      size="sm"
                      onClick={() => handleQuickStatusChange(action.status)}
                      disabled={saving}
                      className="flex items-center gap-2"
                    >
                      {action.icon}
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Contact Information */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Contact
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {lead.contact_email && (
                    <a
                      href={`mailto:${lead.contact_email}`}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Mail className="h-5 w-5 text-primary-500" />
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-sm font-medium text-gray-900">{lead.contact_email}</p>
                      </div>
                    </a>
                  )}
                  {lead.contact_phone && (
                    <a
                      href={`tel:${lead.contact_phone}`}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Phone className="h-5 w-5 text-primary-500" />
                      <div>
                        <p className="text-xs text-gray-500">Téléphone</p>
                        <p className="text-sm font-medium text-gray-900">{lead.contact_phone}</p>
                      </div>
                    </a>
                  )}
                  {lead.contact_country && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Globe className="h-5 w-5 text-primary-500" />
                      <div>
                        <p className="text-xs text-gray-500">Pays</p>
                        <p className="text-sm font-medium text-gray-900">{lead.contact_country}</p>
                      </div>
                    </div>
                  )}
                  {(lead.contact_first_name || lead.contact_last_name) && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <User className="h-5 w-5 text-primary-500" />
                      <div>
                        <p className="text-xs text-gray-500">Nom complet</p>
                        <p className="text-sm font-medium text-gray-900">
                          {[lead.contact_first_name, lead.contact_last_name].filter(Boolean).join(' ')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Boat Information */}
              {(lead.boat_make || lead.boat_model) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    Bateau recherché
                  </h3>
                  <div className="p-4 bg-primary-50 rounded-lg border border-primary-100">
                    <div className="flex items-center gap-2 mb-3">
                      <Anchor className="h-5 w-5 text-primary-600" />
                      <span className="font-semibold text-gray-900">
                        {[lead.boat_make, lead.boat_model].filter(Boolean).join(' ')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {lead.boat_year && (
                        <div>
                          <p className="text-gray-500">Année</p>
                          <p className="font-medium">{lead.boat_year}</p>
                        </div>
                      )}
                      {lead.boat_length_value && (
                        <div>
                          <p className="text-gray-500">Longueur</p>
                          <p className="font-medium">
                            {lead.boat_length_value} {lead.boat_length_units || 'ft'}
                          </p>
                        </div>
                      )}
                      {lead.boat_condition && (
                        <div>
                          <p className="text-gray-500">Condition</p>
                          <p className="font-medium">{lead.boat_condition}</p>
                        </div>
                      )}
                      {lead.boat_price_amount && (
                        <div>
                          <p className="text-gray-500">Prix</p>
                          <p className="font-medium text-primary-600">
                            {parseInt(lead.boat_price_amount).toLocaleString()} {lead.boat_price_currency || 'EUR'}
                          </p>
                        </div>
                      )}
                    </div>
                    {lead.boat_url && (
                      <a
                        href={lead.boat_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-3 text-sm text-primary-600 hover:text-primary-800 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Voir l&apos;annonce sur Boats group
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Commentaires & notes
                </h3>
                {lead.customer_comments && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-gray-600">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase">Message du client</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {lead.customer_comments}
                    </p>
                  </div>
                )}

                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                  <div className="flex items-center justify-between gap-2 mb-2 text-yellow-700">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase">Notes broker</span>
                    </div>
                    <button
                      className="text-xs text-yellow-800 hover:text-yellow-900"
                      onClick={async () => {
                        setNotesSaving(true);
                        try {
                          const response = await fetch(`/api/leads/${lead.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ lead_comments: notes })
                          });
                          const data = await response.json();
                          if (data.success) {
                            toast.success('Notes mises à jour');
                            onLeadUpdated?.({ ...lead, lead_comments: notes });
                          } else {
                            toast.error(data.error || 'Erreur lors de la mise à jour');
                          }
                        } catch (error) {
                          console.error('Error updating notes:', error);
                          toast.error('Erreur de connexion');
                        } finally {
                          setNotesSaving(false);
                        }
                      }}
                      disabled={notesSaving}
                    >
                      {notesSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                    </button>
                  </div>
                  <textarea
                    className="w-full min-h-[90px] resize-y rounded-lg border border-yellow-200 bg-white p-3 text-sm text-gray-700 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="Ajouter des notes sur ce client..."
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>

                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-2 mb-2 text-blue-700">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase">Dernier message</span>
                  </div>
                  <p className="text-sm text-blue-700/80">
                    Aucun message synchronisé pour le moment.
                  </p>
                  <p className="text-xs text-blue-600/70 mt-1">
                    Cet espace affichera WhatsApp / email dès la connexion.
                  </p>
                </div>
              </div>

              {/* Meta Information */}
              <div className="pt-4 border-t border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Reçu {formatRelativeTime(receivedDate)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>{receivedDate.toLocaleDateString('fr-FR')}</span>
                  </div>
                  {lead.recipient_office_name && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <span>{lead.recipient_office_name}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  ID Lead: {lead.yatco_lead_id}
                </p>
              </div>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
