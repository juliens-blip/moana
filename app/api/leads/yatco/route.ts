import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { yatcoLeadPayloadSchema } from '@/lib/validations';
import { YatcoLeadPayload } from '@/lib/types';
import { getLatestKycReport } from '@/lib/supabase/kyc';
import { screenLeadForSanctions } from '@/lib/supabase/sanctions';
import { getConfiguredSecret, verifyWebhookSignature } from '@/lib/security';

// BOats group IP whitelist
const YATCO_IPS = ['35.171.79.77', '52.2.114.120'];
const IP_WHITELIST_DISABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.YATCO_IP_WHITELIST_DISABLED === 'true';
const WEBHOOK_SECRET_NAMES = [
  'YATCO_WEBHOOK_SECRET',
  'BOATS_GROUP_WEBHOOK_SECRET',
  'WEBHOOK_SECRET',
];

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/leads/yatco
 * Webhook endpoint to receive BOats group LeadFlow leads
 * Authentication uses HMAC in production; the IP allowlist remains an additional check.
 */
export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    if (
      process.env.NODE_ENV === 'production' &&
      !IP_WHITELIST_DISABLED &&
      !YATCO_IPS.includes(clientIp)
    ) {
      return NextResponse.json(
        { error: 'Unauthorized request' },
        { status: 403 }
      );
    }

    const rawBody = await request.text();
    const webhookSecret = getConfiguredSecret(...WEBHOOK_SECRET_NAMES);
    const signature = request.headers.get('x-yatco-signature') ||
      request.headers.get('x-boats-group-signature') ||
      request.headers.get('x-webhook-signature');
    const timestamp = request.headers.get('x-yatco-timestamp') ||
      request.headers.get('x-boats-group-timestamp') ||
      request.headers.get('x-webhook-timestamp');

    if (
      process.env.NODE_ENV === 'production' &&
      (!webhookSecret ||
        !verifyWebhookSignature({
          rawBody,
          signature,
          secret: webhookSecret || '',
          timestamp,
        }))
    ) {
      return NextResponse.json(
        { error: 'Unauthorized request' },
        { status: 401 },
      );
    }

    if (process.env.NODE_ENV !== 'production' && webhookSecret && signature &&
      !verifyWebhookSignature({ rawBody, signature, secret: webhookSecret, timestamp })) {
      return NextResponse.json(
        { error: 'Unauthorized request' },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const validationResult = yatcoLeadPayloadSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    const payload: YatcoLeadPayload = validationResult.data;

    // Initialize Supabase admin client
    const supabase = createAdminClient();

    // Check for duplicate lead by yatco_lead_id
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('yatco_lead_id', payload.lead.id)
      .single();

    if (existingLead) {
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
      'marc': 'jmo@moana-yachting.com',
      'jmo': 'jmo@moana-yachting.com',
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
      console.error('[BOats group Webhook] Database insert failed');
      return NextResponse.json(
        { error: 'Failed to store lead' },
        { status: 500 }
      );
    }

    try {
      await screenLeadForSanctions(newLead);
    } catch {
      console.warn('[BOats group Webhook] Sanctions screening failed');
    }
    const kyc = (await getLatestKycReport(newLead.id))?.summary ?? null;

    // Success response
    return NextResponse.json(
      {
        success: true,
        lead_id: newLead.id,
        broker_assigned: !!broker,
        broker_name: broker?.broker_name,
        kyc_status: kyc?.status ?? 'unavailable'
      },
      { status: 201 }
    );

  } catch {
    console.error('[BOats group Webhook] Unexpected error');
    return NextResponse.json(
      { error: 'Internal server error' },
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
  });
}
