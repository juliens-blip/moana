import { createAdminClient } from '@/lib/supabase/admin';
import { Lead, LeadWithBroker, LeadStatus } from '@/lib/types';
import { ManualLeadInput } from '@/lib/validations';

/**
 * Get all leads for a specific broker
 */
export async function getLeadsByBroker(brokerId: string): Promise<LeadWithBroker[]> {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from('leads_with_broker')
    .select('*')
    .eq('broker_id', brokerId)
    .order('received_at', { ascending: false });

  if (error) {
    console.error('[Leads] Error fetching leads:', error);
    throw new Error(`Failed to fetch leads: ${error.message}`);
  }

  return data as LeadWithBroker[];
}

/**
 * Get a single lead by ID
 */
export async function getLeadById(leadId: string, brokerId: string): Promise<LeadWithBroker | null> {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from('leads_with_broker')
    .select('*')
    .eq('id', leadId)
    .eq('broker_id', brokerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[Leads] Error fetching lead:', error);
    throw new Error(`Failed to fetch lead: ${error.message}`);
  }

  return data as LeadWithBroker;
}

/**
 * Update lead status
 */
export async function updateLeadStatus(
  leadId: string,
  brokerId: string,
  status: LeadStatus
): Promise<Lead> {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from('leads')
    .update({ 
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId)
    .eq('broker_id', brokerId)
    .select()
    .single();

  if (error) {
    console.error('[Leads] Error updating lead status:', error);
    throw new Error(`Failed to update lead: ${error.message}`);
  }

  return data as Lead;
}

/**
 * Update lead comments
 */
export async function updateLeadComments(
  leadId: string,
  brokerId: string,
  customerComments?: string,
  leadComments?: string
): Promise<Lead> {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from('leads')
    .update({
      customer_comments: customerComments,
      lead_comments: leadComments,
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId)
    .eq('broker_id', brokerId)
    .select()
    .single();

  if (error) {
    console.error('[Leads] Error updating lead comments:', error);
    throw new Error(`Failed to update lead: ${error.message}`);
  }

  return data as Lead;
}

/**
 * Get lead statistics for a broker
 */
export async function getLeadStats(brokerId: string) {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from('leads_stats')
    .select('*')
    .eq('broker_id', brokerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No leads yet
      return {
        total_leads: 0,
        new_leads: 0,
        contacted_leads: 0,
        qualified_leads: 0,
        converted_leads: 0,
        lost_leads: 0,
        latest_lead_date: null
      };
    }
    console.error('[Leads] Error fetching lead stats:', error);
    throw new Error(`Failed to fetch lead stats: ${error.message}`);
  }

  return data;
}

/**
 * Admin function: Purge test leads
 */
export async function purgeTestLeads(brokerId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('broker_id', brokerId)
    .or('yatco_lead_id.ilike.TEST-%,contact_email.eq.test@example.com,contact_display_name.eq.Test Client');

  if (error) {
    console.error('[Leads] Error purging test leads:', error);
    throw new Error(`Failed to purge test leads: ${error.message}`);
  }
}

/**
 * Admin function: Create a manual lead
 */
export async function createManualLead(brokerId: string, input: ManualLeadInput): Promise<Lead> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const manualLead = {
    yatco_lead_id: `MANUAL-${Date.now()}`,
    lead_date: now,
    source: input.source ?? 'Manual',
    detailed_source: input.detailed_source,
    detailed_source_summary: input.detailed_source_summary,
    request_type: input.request_type ?? 'Manual',
    contact_display_name: input.contact_display_name,
    contact_first_name: input.contact_first_name,
    contact_last_name: input.contact_last_name,
    contact_email: input.contact_email,
    contact_phone: input.contact_phone,
    contact_country: input.contact_country,
    boat_make: input.boat_make,
    boat_model: input.boat_model,
    boat_year: input.boat_year,
    boat_condition: input.boat_condition,
    boat_length_value: input.boat_length_value,
    boat_length_units: input.boat_length_units,
    boat_price_amount: input.boat_price_amount,
    boat_price_currency: input.boat_price_currency,
    boat_url: input.boat_url,
    customer_comments: input.customer_comments,
    lead_comments: input.lead_comments,
    recipient_office_name: input.recipient_office_name,
    recipient_office_id: input.recipient_office_id,
    recipient_contact_name: input.recipient_contact_name,
    broker_id: brokerId,
    status: 'NEW' as const,
    processed_at: now
  };

  const { data, error } = await supabase
    .from('leads')
    .insert(manualLead)
    .select()
    .single();

  if (error) {
    console.error('[Leads] Error creating manual lead:', error);
    throw new Error(`Failed to create manual lead: ${error.message}`);
  }

  return data as Lead;
}
