'use client';

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Modal, Select } from '@/components/ui';
import type { Lead } from '@/lib/types';

interface LeadCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (lead: Lead) => void;
  mode?: 'lead' | 'contact';
}

interface ManualLeadForm {
  contact_display_name: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  contact_country: string;
  source: string;
  request_type: string;
  boat_make: string;
  boat_model: string;
  boat_year: string;
  boat_length_value: string;
  boat_length_units: string;
  boat_price_amount: string;
  boat_price_currency: string;
  boat_url: string;
  customer_comments: string;
  lead_comments: string;
}

const createDefaultForm = (mode: 'lead' | 'contact'): ManualLeadForm => ({
  contact_display_name: '',
  contact_first_name: '',
  contact_last_name: '',
  contact_email: '',
  contact_phone: '',
  contact_country: '',
  source: 'Manual',
  request_type: mode === 'contact' ? 'Contact' : 'Manual',
  boat_make: '',
  boat_model: '',
  boat_year: '',
  boat_length_value: '',
  boat_length_units: 'ft',
  boat_price_amount: '',
  boat_price_currency: 'EUR',
  boat_url: '',
  customer_comments: '',
  lead_comments: ''
});

const lengthUnitOptions = [
  { value: 'ft', label: 'ft' },
  { value: 'm', label: 'm' }
];

const currencyOptions = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' }
];

const sourceOptions = [
  { value: 'Manual', label: 'Manuel' },
  { value: 'Phone', label: 'Téléphone' },
  { value: 'Email', label: 'Email' },
  { value: 'Referral', label: 'Recommandation' },
  { value: 'Website', label: 'Site web' }
];

export function LeadCreateModal({ isOpen, onClose, onCreated, mode = 'lead' }: LeadCreateModalProps) {
  const defaultForm = useMemo(() => createDefaultForm(mode), [mode]);
  const [form, setForm] = useState<ManualLeadForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof ManualLeadForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const mapZodErrors = (issues: Array<{ path: Array<string | number>; message: string }>) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      const key = issue.path.join('.');
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return fieldErrors;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Lead créé avec succès');
        onCreated?.(data.data as Lead);
        handleClose();
        return;
      }

      if (data.data && Array.isArray(data.data)) {
        setErrors(mapZodErrors(data.data));
      }
      toast.error(data.error || 'Erreur lors de la création');
    } catch (error) {
      console.error('Error creating lead:', error);
      toast.error('Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setForm(defaultForm);
      setErrors({});
    }
  }, [isOpen, defaultForm]);

  const title = mode === 'contact' ? 'Nouveau contact' : 'Nouveau lead';
  const description =
    mode === 'contact'
      ? 'Ajoutez un contact manuellement dans le CRM'
      : 'Ajoutez un lead manuellement dans le CRM';
  const submitLabel = mode === 'contact' ? 'Créer le contact' : 'Créer le lead';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={description}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nom du contact"
              placeholder="Jean Dupont"
              value={form.contact_display_name}
              onChange={handleChange('contact_display_name')}
              error={errors.contact_display_name}
              required
            />
            <Input
              label="Prénom"
              placeholder="Jean"
              value={form.contact_first_name}
              onChange={handleChange('contact_first_name')}
              error={errors.contact_first_name}
            />
            <Input
              label="Nom"
              placeholder="Dupont"
              value={form.contact_last_name}
              onChange={handleChange('contact_last_name')}
              error={errors.contact_last_name}
            />
            <Input
              label="Email"
              type="email"
              placeholder="jean@exemple.com"
              value={form.contact_email}
              onChange={handleChange('contact_email')}
              error={errors.contact_email}
            />
            <Input
              label="Téléphone"
              placeholder="+33 6 12 34 56 78"
              value={form.contact_phone}
              onChange={handleChange('contact_phone')}
              error={errors.contact_phone}
            />
            <Input
              label="Pays"
              placeholder="FR"
              value={form.contact_country}
              onChange={handleChange('contact_country')}
              error={errors.contact_country}
            />
            <Select
              label="Source"
              options={sourceOptions}
              value={form.source}
              onChange={handleChange('source')}
            />
            {mode === 'lead' && (
              <Input
                label="Type de demande"
                placeholder="Contact"
                value={form.request_type}
                onChange={handleChange('request_type')}
                error={errors.request_type}
              />
            )}
          </div>
        </section>

        {mode === 'lead' && (
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Bateau</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Marque"
                placeholder="Sunseeker"
                value={form.boat_make}
                onChange={handleChange('boat_make')}
                error={errors.boat_make}
              />
              <Input
                label="Modèle"
                placeholder="76 Yacht"
                value={form.boat_model}
                onChange={handleChange('boat_model')}
                error={errors.boat_model}
              />
              <Input
                label="Année"
                placeholder="2020"
                value={form.boat_year}
                onChange={handleChange('boat_year')}
                error={errors.boat_year}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Longueur"
                  placeholder="23.5"
                  value={form.boat_length_value}
                  onChange={handleChange('boat_length_value')}
                  error={errors.boat_length_value}
                />
                <Select
                  label="Unité"
                  options={lengthUnitOptions}
                  value={form.boat_length_units}
                  onChange={handleChange('boat_length_units')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Prix"
                  placeholder="2500000"
                  value={form.boat_price_amount}
                  onChange={handleChange('boat_price_amount')}
                  error={errors.boat_price_amount}
                />
                <Select
                  label="Devise"
                  options={currencyOptions}
                  value={form.boat_price_currency}
                  onChange={handleChange('boat_price_currency')}
                />
              </div>
              <Input
                label="Lien annonce"
                placeholder="https://..."
                value={form.boat_url}
                onChange={handleChange('boat_url')}
                error={errors.boat_url}
              />
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Commentaires</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-2 tracking-wide uppercase text-primary-300/70">
                Message du client
              </label>
              <textarea
                className="w-full min-h-[110px] rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-4 focus:border-secondary-500/50 focus:ring-secondary-500/10"
                placeholder="Résumé de la demande du client..."
                value={form.customer_comments}
                onChange={handleChange('customer_comments')}
              />
              {errors.customer_comments && (
                <p className="mt-1 text-xs text-red-400 font-medium">{errors.customer_comments}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-2 tracking-wide uppercase text-primary-300/70">
                Notes internes
              </label>
              <textarea
                className="w-full min-h-[110px] rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-4 focus:border-secondary-500/50 focus:ring-secondary-500/10"
                placeholder="Notes broker..."
                value={form.lead_comments}
                onChange={handleChange('lead_comments')}
              />
              {errors.lead_comments && (
                <p className="mt-1 text-xs text-red-400 font-medium">{errors.lead_comments}</p>
              )}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Annuler
          </Button>
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
