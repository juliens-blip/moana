-- ============================================
-- MOANA YACHTING - LEADS SCHEMA (BOats group CRM)
-- Table pour gérer les leads BOats group LeadFlow
-- ============================================

-- Table leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- BOats group Lead ID (unique identifier)
  yatco_lead_id TEXT UNIQUE NOT NULL,
  
  -- Lead metadata
  lead_date TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  detailed_source TEXT,
  detailed_source_summary TEXT,
  request_type TEXT,
  
  -- Contact information
  contact_display_name TEXT NOT NULL,
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_country TEXT,
  
  -- Boat information
  boat_make TEXT,
  boat_model TEXT,
  boat_year TEXT,
  boat_condition TEXT,
  boat_length_value TEXT,
  boat_length_units TEXT,
  boat_price_amount TEXT,
  boat_price_currency TEXT,
  boat_url TEXT,
  
  -- Comments
  customer_comments TEXT,
  lead_comments TEXT,
  
  -- Recipient/Office information
  recipient_office_name TEXT,
  recipient_office_id TEXT,
  recipient_contact_name TEXT,
  
  -- Routing to broker
  broker_id UUID REFERENCES public.brokers(id) ON DELETE SET NULL,
  
  -- Lead status
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST')),
  
  -- Raw payload (for debugging/audit)
  raw_payload JSONB,
  
  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_yatco_lead_id ON public.leads(yatco_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_broker_id ON public.leads(broker_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_received_at ON public.leads(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_contact_email ON public.leads(contact_email);
CREATE INDEX IF NOT EXISTS idx_leads_recipient_contact_name ON public.leads(recipient_contact_name);

-- Trigger for updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.leads IS 'Leads reçus depuis BOats group LeadFlow API';
COMMENT ON COLUMN public.leads.yatco_lead_id IS 'ID unique du lead fourni par BOats group';
COMMENT ON COLUMN public.leads.broker_id IS 'Broker assigné basé sur recipient.contactName';
COMMENT ON COLUMN public.leads.status IS 'Statut du lead: NEW, CONTACTED, QUALIFIED, CONVERTED, LOST';
COMMENT ON COLUMN public.leads.raw_payload IS 'Payload JSON brut de BOats group (pour audit)';

-- ============================================

-- Vue pour joindre leads + broker info
CREATE OR REPLACE VIEW public.leads_with_broker AS
SELECT
  l.*,
  b.broker_name,
  b.email as broker_email
FROM public.leads l
LEFT JOIN public.brokers b ON l.broker_id = b.id;

COMMENT ON VIEW public.leads_with_broker IS 'Vue combinant leads et infos broker';

-- ============================================

-- Row Level Security (RLS)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Policies pour leads
CREATE POLICY "Brokers can view their own leads"
ON public.leads
FOR SELECT
TO authenticated
USING (broker_id = auth.uid());

CREATE POLICY "System can create leads (no auth required for webhook)"
ON public.leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Brokers can update their own leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (broker_id = auth.uid())
WITH CHECK (broker_id = auth.uid());

-- ============================================

-- Stats view for dashboard
CREATE OR REPLACE VIEW public.leads_stats AS
SELECT
  broker_id,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN status = 'NEW' THEN 1 END) as new_leads,
  COUNT(CASE WHEN status = 'CONTACTED' THEN 1 END) as contacted_leads,
  COUNT(CASE WHEN status = 'QUALIFIED' THEN 1 END) as qualified_leads,
  COUNT(CASE WHEN status = 'CONVERTED' THEN 1 END) as converted_leads,
  COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_leads,
  MAX(received_at) as latest_lead_date
FROM public.leads
GROUP BY broker_id;

COMMENT ON VIEW public.leads_stats IS 'Statistiques des leads par broker';
