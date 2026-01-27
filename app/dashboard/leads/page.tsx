'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { Inbox, LayoutGrid, List, Plus } from 'lucide-react';
import { Button, SkeletonGrid } from '@/components/ui';
import { LeadCard, LeadCreateModal, LeadFilters, LeadDetailModal, LeadStats, LeadTable } from '@/components/leads';
import type { LeadWithBroker } from '@/lib/types';
import { debounce } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface LeadStatsData {
  total_leads: number;
  new_leads: number;
  contacted_leads: number;
  qualified_leads: number;
  converted_leads: number;
  lost_leads: number;
  latest_lead_date: string | null;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadWithBroker[]>([]);
  const [stats, setStats] = useState<LeadStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLead, setSelectedLead] = useState<LeadWithBroker | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Refs for filter values
  const filtersRef = useRef({
    search: '',
    status: '',
    source: '',
    dateFrom: '',
    dateTo: ''
  });

  // Update refs when state changes
  useEffect(() => {
    filtersRef.current = { search, status, source, dateFrom, dateTo };
  }, [search, status, source, dateFrom, dateTo]);

  // Fetch leads function
  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const filters = filtersRef.current;

      params.append('stats', 'true');
      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);
      if (filters.source) params.append('source', filters.source);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);

      const response = await fetch(`/api/leads?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setLeads(data.data.leads);
        setStats(data.data.stats);

        // Extract unique sources for filter dropdown
        const uniqueSources = [...new Set(
          data.data.leads
            .map((lead: LeadWithBroker) => lead.detailed_source_summary || lead.source)
            .filter(Boolean)
        )] as string[];
        setSources(uniqueSources);
      } else {
        toast.error('Erreur lors du chargement des leads');
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced fetch
  const debouncedFetchRef = useRef(
    debounce(() => {
      setLoading(true);
      fetchLeads();
    }, 300)
  );

  // Initial fetch
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Filter handlers
  const handleSearchChange = (value: string) => {
    setSearch(value);
    debouncedFetchRef.current();
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    debouncedFetchRef.current();
  };

  const handleSourceChange = (value: string) => {
    setSource(value);
    debouncedFetchRef.current();
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    debouncedFetchRef.current();
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    debouncedFetchRef.current();
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatus('');
    setSource('');
    setDateFrom('');
    setDateTo('');
    filtersRef.current = { search: '', status: '', source: '', dateFrom: '', dateTo: '' };
    setLoading(true);
    fetchLeads();
  };

  // Handle lead update from modal
  const handleLeadUpdated = (updatedLead: LeadWithBroker) => {
    setLeads((prev) =>
      prev.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
    );
    setSelectedLead(updatedLead);

    // Refresh stats after update
    fetchLeads();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-secondary-500 to-primary-600 flex items-center justify-center">
              <Inbox className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Leads CRM</h1>
              <p className="text-gray-600 mt-1">
                {leads.length} lead{leads.length !== 1 ? 's' : ''} BOats group
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Nouveau lead
            </Button>
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all
                  ${viewMode === 'cards'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all
                  ${viewMode === 'table'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <LeadStats stats={stats} />
      </div>

      {/* Filters */}
      <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
        <LeadFilters
          search={search}
          status={status}
          source={source}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
          onSourceChange={handleSourceChange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onClear={handleClearFilters}
          sources={sources}
        />
      </div>

      {/* Leads Display */}
      {loading ? (
        <SkeletonGrid count={6} />
      ) : leads.length === 0 ? (
        <div className="text-center py-12 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          <div className="mx-auto h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Inbox className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500 text-lg">Aucun lead trouvé</p>
          <p className="text-gray-400 text-sm mt-2">
            {search || status || source
              ? 'Essayez de modifier vos filtres'
              : 'Les leads BOats group apparaîtront ici'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {leads.map((lead, index) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={setSelectedLead}
              index={index}
            />
          ))}
        </div>
      ) : (
        <LeadTable
          leads={leads}
          onRowClick={setSelectedLead}
          showBroker={false}
        />
      )}

      {/* Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onLeadUpdated={handleLeadUpdated}
      />

      <LeadCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => {
          setLoading(true);
          fetchLeads();
        }}
      />
    </div>
  );
}
