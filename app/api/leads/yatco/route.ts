import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { yatcoLeadPayloadSchema } from '@/lib/validations';
import { YatcoLeadPayload } from '@/lib/types';

// BOats group IP whitelist
const YATCO_IPS = ['35.171.79.77', '52.2.114.120'];
// Temporary bypass for testing: set YATCO_IP_WHITELIST_DISABLED=true
const IP_WHITELIST_DISABLED = process.env.YATCO_IP_WHITELIST_DISABLED === 'true';

/**
 * POST /api/leads/yatco
 * Webhook endpoint to receive BOats group LeadFlow leads
 * No authentication required - IP whitelist only
 */
export async function POST(request: NextRequest) {
  try {
    // IP whitelist check
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    
    console.log('[BOats group Webhook] Received request from IP:', clientIp);

    // Skip IP check in development or when explicitly disabled
    if (
      process.env.NODE_ENV === 'production' &&
      !IP_WHITELIST_DISABLED &&
      !YATCO_IPS.includes(clientIp)
    ) {
      console.warn('[BOats group Webhook] Rejected - Unauthorized IP:', clientIp);
      return NextResponse.json(
        { error: 'Unauthorized IP address' },
        { status: 403 }
      );
    }

    // Parse and validate payload
    const body = await request.json();
    const validationResult = yatcoLeadPayloadSchema.safeParse(body);

    if (!validationResult.success) {
      console.error('[BOats group Webhook] Validation failed:', validationResult.error.errors);
      return NextResponse.json(
        { 
          error: 'Invalid payload',
          details: validationResult.error.errors 
        },
        { status: 400 }
      );
    }

    const payload: YatcoLeadPayload = validationResult.data;
    console.log('[BOats group Webhook] Valid payload received - Lead ID:', payload.lead.id);

    // Initialize Supabase admin client
    const supabase = createAdminClient();

    // Check for duplicate lead by yatco_lead_id
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('yatco_lead_id', payload.lead.id)
      .single();

    if (existingLead) {
      console.log('[BOats group Webhook] Duplicate lead detected:', payload.lead.id);
      return NextResponse.json(
        {
          message: 'Lead already exists',
          lead_id: existingLead.id
        },
        { status: 200 }
      );
    }

    // Build contact display name from available fields
    // According to LeadFlow doc: "name": {} can be empty in minimal leads
    const contactName = payload.contact?.name || {};
    let displayName = contactName.display;
    if (!displayName) {
      // Fallback: construct from first/last name
      const parts = [contactName.first, contactName.last].filter(Boolean);
      displayName = parts.length > 0 ? parts.join(' ') : 'Unknown Contact';
    }

    // YachtWorld contactName to email mapping
    // Emails correspondent à ceux dans Supabase (moana-yachting.com)
    const yachtWorldMapping: Record<string, string> = {
      'cedrc': 'cedric@moana-yachting.com',
      'cedric': 'cedric@moana-yachting.com',
      'cedric paprocki': 'cedric@moana-yachting.com',
      'pe': 'pe@moana-yachting.com',
      'pierre eliott duverneuil': 'pe@moana-yachting.com',
      'bart': 'bart@moanayachting.com',
      'bart obin': 'bart@moanayachting.com',
      'aldric': 'aldric@moanayachting.com',
      'aldric millescamps': 'aldric@moanayachting.com',
      'charles': 'charles@moanayachting.com',
      'charles michel': 'charles@moanayachting.com',
      'charles michel leke': 'charles@moanayachting.com',
      'foulques': 'foulques@moana-yachting.com',
      'foulques de raigniac': 'foulques@moana-yachting.com',
      'foulques de reigniac': 'foulques@moana-yachting.com',
      'marc': 'jm@moanayachting.com',
      'julien': 'julien@moana-yachting.com'
    };

    // Get broker email from mapping, fallback to contactName
    const normalizeRecipientKey = (value: string) => {
      return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const recipientContactName = payload.recipient?.contactName || '';
    const normalizedRecipient = recipientContactName.trim();
    const recipientKey = normalizeRecipientKey(recipientContactName);
    const brokerEmail = yachtWorldMapping[recipientKey] || normalizedRecipient;

    // Find broker by email, fallback to broker name
    let broker = null as { id: string; broker_name: string; email: string } | null;
    if (brokerEmail) {
      const emailCandidates = new Set<string>();
      emailCandidates.add(brokerEmail);
      if (brokerEmail.endsWith('@moanayachting.com')) {
        emailCandidates.add(brokerEmail.replace('@moanayachting.com', '@moana-yachting.com'));
      }
      if (brokerEmail.endsWith('@moana-yachting.com')) {
        emailCandidates.add(brokerEmail.replace('@moana-yachting.com', '@moanayachting.com'));
      }

      const { data: brokerByEmail } = await supabase
        .from('brokers')
        .select('id, broker_name, email')
        .in('email', Array.from(emailCandidates))
        .maybeSingle();
      broker = brokerByEmail ?? null;
    }

    if (!broker && recipientContactName) {
      const { data: brokerByName } = await supabase
        .from('brokers')
        .select('id, broker_name, email')
        .ilike('broker_name', recipientContactName)
        .maybeSingle();
      broker = brokerByName ?? null;
    }

    // If still no broker found, try to find a default broker for the office
    if (!broker) {
      console.warn('[BOats group Webhook] Broker not found for:', recipientContactName, '-> email:', brokerEmail);
      // Log all available brokers for debugging
      const { data: allBrokers } = await supabase
        .from('brokers')
        .select('id, broker_name, email')
        .limit(10);
      console.log('[BOats group Webhook] Available brokers:', allBrokers?.map(b => `${b.broker_name} (${b.email})`));
    } else {
      console.log('[BOats group Webhook] Broker matched:', recipientContactName, '->', broker.broker_name, `(${broker.email})`);
    }

    // Transform payload to database format
    // Handle optional date field - use current time if not provided
    const leadDate = payload.lead.date || new Date().toISOString();

    const leadData = {
      yatco_lead_id: payload.lead.id,
      lead_date: leadDate,
      source: payload.lead.source,
      detailed_source: payload.lead.detailedSource,
      detailed_source_summary: payload.lead.detailedSourceSummary,
      request_type: payload.lead.requestType,

      contact_display_name: displayName,
      contact_first_name: contactName.first,
      contact_last_name: contactName.last,
      contact_email: payload.contact?.email,
      contact_phone: payload.contact?.phone,
      contact_country: payload.contact?.country,

      boat_make: payload.boat?.make,
      boat_model: payload.boat?.model,
      boat_year: payload.boat?.year,
      boat_condition: payload.boat?.condition,
      boat_length_value: payload.boat?.length?.measure,
      boat_length_units: payload.boat?.length?.units,
      boat_price_amount: payload.boat?.price?.amount,
      boat_price_currency: payload.boat?.price?.currency,
      boat_url: payload.boat?.url,

      customer_comments: payload.customerComments,
      lead_comments: payload.leadComments,

      recipient_office_name: payload.recipient.officeName,
      recipient_office_id: payload.recipient.officeId,
      recipient_contact_name: recipientContactName || null,

      broker_id: broker?.id || null,
      status: 'NEW' as const,
      raw_payload: payload,
      processed_at: broker ? new Date().toISOString() : null
    };

    // Insert lead into database
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (insertError) {
      console.error('[BOats group Webhook] Database insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to store lead', details: insertError.message },
        { status: 500 }
      );
    }

    console.log('[BOats group Webhook] Lead created successfully:', newLead.id);

    // Success response
    return NextResponse.json(
      {
        success: true,
        lead_id: newLead.id,
        broker_assigned: !!broker,
        broker_name: broker?.broker_name
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('[BOats group Webhook] Unexpected error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leads/yatco
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'BOats group LeadFlow Webhook',
    whitelisted_ips: YATCO_IPS,
    ip_whitelist_disabled: IP_WHITELIST_DISABLED
  });
}
