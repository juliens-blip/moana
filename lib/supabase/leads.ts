import { createAdminClient } from '@/lib/supabase/admin';
import { Lead, LeadWithBroker, LeadStatus } from '@/lib/types';

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
 * Admin function: Create a test lead (for development)
 */
export async function createTestLead(brokerId: string) {
  const supabase = createAdminClient();
  
  const testLead = {
    yatco_lead_id: `TEST-${Date.now()}`,
    lead_date: new Date().toISOString(),
    source: 'YachtWorld',
    detailed_source: 'YachtWorld-Broker SRP',
    detailed_source_summary: 'YachtWorld',
    request_type: 'Contact Broker',
    
    contact_display_name: 'Test Client',
    contact_first_name: 'Test',
    contact_last_name: 'Client',
    contact_email: 'test@example.com',
    contact_phone: '+33123456789',
    contact_country: 'FR',
    
    boat_make: 'Sunseeker',
    boat_model: '76 Yacht',
    boat_year: '2020',
    boat_condition: 'Used',
    boat_length_value: '23.2',
    boat_length_units: 'meters',
    boat_price_amount: '2500000',
    boat_price_currency: 'EUR',
    
    customer_comments: 'Interested in viewing this yacht',
    
    recipient_office_name: 'Moana Yachting',
    recipient_office_id: '389841',
    
    broker_id: brokerId,
    status: 'NEW' as const,
    processed_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('leads')
    .insert(testLead)
    .select()
    .single();

  if (error) {
    console.error('[Leads] Error creating test lead:', error);
    throw new Error(`Failed to create test lead: ${error.message}`);
  }

  return data as Lead;
}
