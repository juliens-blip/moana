# CRM Architecture - Yatco LeadFlow Integration

**Last Updated:** 2026-02-04
**Status:** Production
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Database Architecture](#database-architecture)
4. [API Flow & Integration](#api-flow--integration)
5. [Lead Routing Logic](#lead-routing-logic)
6. [Deduplication Strategy](#deduplication-strategy)
7. [Security Architecture](#security-architecture)
8. [Error Handling & Logging](#error-handling--logging)
9. [Performance Considerations](#performance-considerations)
10. [Future Enhancements](#future-enhancements)

---

## Executive Summary

The Moana Yachting CRM system integrates with Boats Group LeadFlow API to automatically receive, process, and route yacht sales leads to appropriate brokers. The system uses a webhook-based architecture with Supabase PostgreSQL for storage and Next.js API routes for processing.

**Key Features:**
- Webhook endpoint for real-time lead ingestion
- Intelligent broker routing via name/email mapping
- Automatic deduplication by Yatco lead ID
- IP whitelist security (Boats Group IPs only)
- Full audit trail with raw payload storage
- Lead status management (NEW → CONTACTED → QUALIFIED → CONVERTED/LOST)

---

## System Overview

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Boats Group LeadFlow API                     │
│                  (YachtWorld, Boats.com, etc.)                  │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP POST
                         │ JSON Payload
                         │ IPs: 35.171.79.77, 52.2.114.120
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 POST /api/leads/yatco                            │
│                 (Next.js API Route)                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. IP Whitelist Check                                      │  │
│  │ 2. JSON Schema Validation (Zod)                           │  │
│  │ 3. Deduplication Check (yatco_lead_id)                    │  │
│  │ 4. Broker Matching (YachtWorld mapping)                   │  │
│  │ 5. Transform Payload → DB Format                          │  │
│  │ 6. Insert into Supabase                                   │  │
│  │ 7. Return 201 Created                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase PostgreSQL                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ leads                                                      │  │
│  │  - id (UUID, PK)                                          │  │
│  │  - yatco_lead_id (TEXT, UNIQUE)                           │  │
│  │  - broker_id (UUID, FK → brokers)                         │  │
│  │  - status (NEW/CONTACTED/QUALIFIED/CONVERTED/LOST)        │  │
│  │  - contact_* (name, email, phone, country)                │  │
│  │  - boat_* (make, model, year, price, url)                 │  │
│  │  - raw_payload (JSONB)                                    │  │
│  │  - received_at, updated_at, processed_at                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Views: leads_with_broker, leads_stats                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Broker Dashboard (Next.js)                     │
│  - View assigned leads                                           │
│  - Update lead status                                            │
│  - Add comments                                                  │
│  - Filter by status, date, source                                │
│  - View lead statistics                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Architecture

### Table: `leads`

**Primary table for storing all leads received from Boats Group.**

```sql
CREATE TABLE public.leads (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Boats Group Unique Identifier (for deduplication)
  yatco_lead_id TEXT UNIQUE NOT NULL,

  -- Lead Metadata
  lead_date TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,                    -- e.g., "Boats Group"
  detailed_source TEXT,                    -- e.g., "YachtWorld-Broker SRP"
  detailed_source_summary TEXT,            -- e.g., "YachtWorld"
  request_type TEXT,                       -- e.g., "Contact Broker"

  -- Contact Information
  contact_display_name TEXT NOT NULL,
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_country TEXT,

  -- Boat Information (all optional)
  boat_make TEXT,
  boat_model TEXT,
  boat_year TEXT,
  boat_condition TEXT,                     -- "Used", "New"
  boat_length_value TEXT,
  boat_length_units TEXT,                  -- "feet", "meters"
  boat_price_amount TEXT,
  boat_price_currency TEXT,                -- "USD", "EUR", "CAD"
  boat_url TEXT,

  -- Comments
  customer_comments TEXT,                   -- Client's message
  lead_comments TEXT,                       -- Internal broker notes

  -- Recipient/Office
  recipient_office_name TEXT,               -- "Moana Yachting"
  recipient_office_id TEXT,                 -- Boats Group office ID
  recipient_contact_name TEXT,              -- Broker name from Boats Group

  -- Broker Assignment
  broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,

  -- Lead Status (controlled vocabulary)
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST')),

  -- Audit Trail
  raw_payload JSONB,                        -- Complete Boats Group payload
  received_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ                  -- When broker was assigned
);
```

### Indexes

**Critical indexes for query performance:**

| Index Name | Column(s) | Purpose |
|------------|-----------|---------|
| `idx_leads_yatco_lead_id` | `yatco_lead_id` | Deduplication checks (UNIQUE constraint) |
| `idx_leads_broker_id` | `broker_id` | Filter leads by broker |
| `idx_leads_status` | `status` | Filter by lead status |
| `idx_leads_received_at` | `received_at DESC` | Sort by date (newest first) |
| `idx_leads_contact_email` | `contact_email` | Contact lookup |
| `idx_leads_recipient_contact_name` | `recipient_contact_name` | Broker matching |

### Views

#### 1. `leads_with_broker`

**Joins leads with broker information for dashboard display.**

```sql
CREATE VIEW leads_with_broker AS
SELECT
  l.*,
  b.broker_name,
  b.email as broker_email
FROM leads l
LEFT JOIN brokers b ON l.broker_id = b.id;
```

**Usage:** Used by API route `/api/leads` to return enriched lead data.

#### 2. `leads_stats`

**Aggregates lead statistics per broker for dashboard metrics.**

```sql
CREATE VIEW leads_stats AS
SELECT
  broker_id,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN status = 'NEW' THEN 1 END) as new_leads,
  COUNT(CASE WHEN status = 'CONTACTED' THEN 1 END) as contacted_leads,
  COUNT(CASE WHEN status = 'QUALIFIED' THEN 1 END) as qualified_leads,
  COUNT(CASE WHEN status = 'CONVERTED' THEN 1 END) as converted_leads,
  COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_leads,
  MAX(received_at) as latest_lead_date
FROM leads
GROUP BY broker_id;
```

**Usage:** Dashboard statistics and conversion rate calculations.

### Row-Level Security (RLS)

**Policies ensure brokers only access their assigned leads:**

```sql
-- Brokers can view their own leads
CREATE POLICY "Brokers can view their own leads"
ON leads FOR SELECT TO authenticated
USING (broker_id = auth.uid());

-- Webhook can insert leads (unauthenticated)
CREATE POLICY "System can create leads"
ON leads FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Brokers can update their own leads
CREATE POLICY "Brokers can update their own leads"
ON leads FOR UPDATE TO authenticated
USING (broker_id = auth.uid())
WITH CHECK (broker_id = auth.uid());
```

---

## API Flow & Integration

### Webhook Endpoint: `POST /api/leads/yatco`

**File:** `/app/api/leads/yatco/route.ts`

#### Request Flow

```
1. HTTP POST from Boats Group
   │
   ├─► IP Whitelist Check
   │   ├─ Production: Only 35.171.79.77, 52.2.114.120
   │   ├─ Development: Bypass (NODE_ENV !== 'production')
   │   └─ Override: YATCO_IP_WHITELIST_DISABLED=true
   │
   ├─► Parse JSON Body
   │
   ├─► Zod Schema Validation (yatcoLeadPayloadSchema)
   │   ├─ Validate lead.id, lead.source (required)
   │   ├─ Validate recipient.officeName, recipient.officeId (required)
   │   └─ All other fields optional (per Boats Group spec)
   │
   ├─► Deduplication Check
   │   ├─ Query: SELECT id FROM leads WHERE yatco_lead_id = ?
   │   └─ If exists: Return 200 OK + existing lead_id
   │
   ├─► Broker Matching
   │   ├─ Extract recipient.contactName
   │   ├─ Normalize: lowercase, remove accents, trim
   │   ├─ Lookup in YachtWorld mapping dictionary
   │   ├─ Query broker by email (primary)
   │   ├─ Fallback: Query broker by name (ilike)
   │   └─ Result: broker_id or NULL
   │
   ├─► Transform Payload → DB Format
   │   ├─ Build contact_display_name (fallback logic)
   │   ├─ Extract all optional fields
   │   └─ Store raw_payload as JSONB
   │
   ├─► Insert into Supabase
   │   └─ Set processed_at if broker assigned
   │
   └─► Return Response
       ├─ 201 Created: New lead inserted
       ├─ 200 OK: Duplicate lead skipped
       ├─ 400 Bad Request: Validation error
       ├─ 403 Forbidden: Unauthorized IP
       └─ 500 Internal Server Error: Database error
```

#### Response Examples

**Success (201 Created):**
```json
{
  "success": true,
  "lead_id": "550e8400-e29b-41d4-a716-446655440000",
  "broker_assigned": true,
  "broker_name": "Cedric Paprocki"
}
```

**Duplicate (200 OK):**
```json
{
  "message": "Lead already exists",
  "lead_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Validation Error (400):**
```json
{
  "error": "Invalid payload",
  "details": [
    {
      "path": ["lead", "id"],
      "message": "Lead ID is required"
    }
  ]
}
```

**IP Rejected (403):**
```json
{
  "error": "Unauthorized IP address"
}
```

### Health Check: `GET /api/leads/yatco`

**Purpose:** Verify webhook endpoint is reachable.

**Response:**
```json
{
  "status": "ok",
  "endpoint": "Boats Group LeadFlow Webhook",
  "whitelisted_ips": ["35.171.79.77", "52.2.114.120"],
  "ip_whitelist_disabled": false
}
```

---

## Lead Routing Logic

### Broker Matching Strategy

The system uses a **three-tier fallback strategy** to match leads to brokers:

#### Tier 1: YachtWorld Mapping Dictionary (Primary)

**Hardcoded mapping of known YachtWorld contact names to email addresses.**

```typescript
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
  'foulques': 'foulques@moana-yachting.com',
  'foulques de raigniac': 'foulques@moana-yachting.com',
  'marc': 'jmo@moana-yachting.com',
  'jmo': 'jmo@moana-yachting.com',
  'julien': 'julien@moana-yachting.com'
};
```

**Normalization Function:**
```typescript
const normalizeRecipientKey = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')                       // Decompose accents
    .replace(/[\u0300-\u036f]/g, '')        // Remove diacritics
    .replace(/[^a-z0-9]+/g, ' ')            // Keep alphanumeric only
    .replace(/\s+/g, ' ')                   // Collapse whitespace
    .trim();
};
```

**Example:** `"Cédric Paprocki"` → `"cedric paprocki"` → `cedric@moana-yachting.com`

#### Tier 2: Email Lookup in Database

**Query brokers table by email with domain variations.**

```typescript
// Handle both @moanayachting.com and @moana-yachting.com
const emailCandidates = new Set<string>();
emailCandidates.add(brokerEmail);
if (brokerEmail.endsWith('@moanayachting.com')) {
  emailCandidates.add(brokerEmail.replace('@moanayachting.com', '@moana-yachting.com'));
}
if (brokerEmail.endsWith('@moana-yachting.com')) {
  emailCandidates.add(brokerEmail.replace('@moana-yachting.com', '@moanayachting.com'));
}

const { data: broker } = await supabase
  .from('brokers')
  .select('id, broker_name, email')
  .in('email', Array.from(emailCandidates))
  .maybeSingle();
```

#### Tier 3: Name Lookup (Case-Insensitive)

**Fallback to broker name matching if email fails.**

```typescript
const { data: broker } = await supabase
  .from('brokers')
  .select('id, broker_name, email')
  .ilike('broker_name', recipientContactName)  // Case-insensitive LIKE
  .maybeSingle();
```

#### Unmatched Leads

**If no broker found:**
- `broker_id` is set to `NULL`
- `processed_at` remains `NULL`
- Lead is stored but **not routed**
- Warning logged with available brokers for debugging

```typescript
console.warn('[Boats Group Webhook] Broker not found for:', recipientContactName);
const { data: allBrokers } = await supabase
  .from('brokers')
  .select('id, broker_name, email')
  .limit(10);
console.log('[Boats Group Webhook] Available brokers:', allBrokers);
```

**Action Required:** Admin must manually assign these leads.

---

## Deduplication Strategy

### Primary Key: `yatco_lead_id`

**Boats Group guarantees unique `lead.id` for each lead submission.**

### Implementation

1. **Database Constraint:** `UNIQUE` constraint on `yatco_lead_id` column
2. **Pre-Insert Check:** Query database before attempting insert
3. **Idempotent Response:** Return `200 OK` with existing `lead_id` if duplicate detected

### Code

```typescript
const { data: existingLead } = await supabase
  .from('leads')
  .select('id')
  .eq('yatco_lead_id', payload.lead.id)
  .single();

if (existingLead) {
  console.log('[Boats Group Webhook] Duplicate lead detected:', payload.lead.id);
  return NextResponse.json(
    {
      message: 'Lead already exists',
      lead_id: existingLead.id
    },
    { status: 200 }  // Idempotent response
  );
}
```

### Benefits

- **Prevents Data Pollution:** No duplicate leads in database
- **Idempotent Webhook:** Boats Group can safely retry failed requests
- **Audit Trail:** Original `raw_payload` preserved for first submission

### Edge Cases

**Manual Leads:** Prefixed with `MANUAL-{timestamp}` to avoid conflicts with Boats Group IDs.

---

## Security Architecture

### IP Whitelist

**Only accept requests from Boats Group authorized IPs.**

```typescript
const YATCO_IPS = ['35.171.79.77', '52.2.114.120'];
```

**Bypass Mechanisms (for testing):**

1. **Development Mode:** `NODE_ENV !== 'production'`
2. **Explicit Override:** `YATCO_IP_WHITELIST_DISABLED=true` (env var)

**IP Extraction:**
```typescript
const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                 request.headers.get('x-real-ip') ||
                 'unknown';
```

**Deployment Note:** Ensure Vercel/hosting platform forwards `X-Forwarded-For` header.

### No Authentication Required

**Webhook design per Boats Group spec:**
- No API keys
- No OAuth tokens
- No HTTP Basic Auth

**Rationale:** IP whitelist sufficient for server-to-server communication.

### Row-Level Security (RLS)

**Brokers can only access their assigned leads:**

```sql
-- Broker can SELECT their leads
WHERE broker_id = auth.uid()

-- Broker can UPDATE their leads
WHERE broker_id = auth.uid() AND (updated broker_id = auth.uid())
```

**Admin Access:** Use service role key (bypasses RLS) for admin operations.

### Data Privacy

- **PII Storage:** Contact email, phone stored as plaintext (required for CRM)
- **Audit Trail:** `raw_payload` JSONB contains complete submission
- **GDPR Compliance:** Implement data deletion on request (not yet built)

---

## Error Handling & Logging

### Structured Logging

**All critical operations logged with context:**

```typescript
console.log('[Boats Group Webhook] Received request from IP:', clientIp);
console.log('[Boats Group Webhook] Valid payload received - Lead ID:', payload.lead.id);
console.log('[Boats Group Webhook] Broker matched:', recipientContactName, '->', broker.broker_name);
console.log('[Boats Group Webhook] Lead created successfully:', newLead.id);
```

**Error Logs:**
```typescript
console.error('[Boats Group Webhook] Validation failed:', validationResult.error.errors);
console.error('[Boats Group Webhook] Database insert error:', insertError);
console.warn('[Boats Group Webhook] Rejected - Unauthorized IP:', clientIp);
```

### Error Response Format

**Consistent JSON error structure:**

```typescript
{
  error: string,        // Human-readable error
  details?: any,        // Additional context (validation errors, etc.)
  message?: string      // Exception message (5xx errors only)
}
```

### HTTP Status Codes

| Code | Meaning | Scenario |
|------|---------|----------|
| 200 | OK | Duplicate lead (idempotent) |
| 201 | Created | New lead successfully stored |
| 400 | Bad Request | Invalid JSON or validation failure |
| 403 | Forbidden | IP not whitelisted |
| 500 | Internal Server Error | Database error or unexpected exception |

### Production Monitoring

**Recommended metrics:**
- Lead ingestion rate (leads/hour)
- Broker match success rate (% with broker_id NOT NULL)
- Duplicate submission rate
- 4xx/5xx error rate
- Response latency (p50, p95, p99)

**Tools:** Vercel Analytics, Sentry, Datadog, or custom logging pipeline.

---

## Performance Considerations

### Database Optimization

**Indexes on hot paths:**
- `yatco_lead_id` (UNIQUE) → O(log n) deduplication check
- `broker_id` → O(log n) lead filtering by broker
- `received_at DESC` → Efficient pagination/sorting

**Connection Pooling:**
- Supabase handles connection pooling automatically
- Use `createAdminClient()` for webhook (service role)

### Query Optimization

**Avoid N+1 Queries:**
- Use `leads_with_broker` view (single JOIN) instead of separate queries
- Use `.maybeSingle()` to prevent multiple rows error

**Minimize Payload Size:**
- Only select needed columns: `.select('id, broker_name, email')`
- Paginate results with `.range(from, to)`

### Scalability

**Current Load:** ~10-50 leads/day (low volume)

**Capacity Planning:**
- PostgreSQL can handle 1000s of inserts/second
- Next.js API routes auto-scale on Vercel
- Bottleneck: Boats Group rate limits (not published)

**High Volume Strategies (if needed):**
1. **Queue-Based Processing:** Use Vercel Queue or AWS SQS to decouple ingestion from processing
2. **Batch Inserts:** Buffer leads and insert in batches (requires async design)
3. **Read Replicas:** Route dashboard queries to Supabase read replica

---

## Future Enhancements

### Phase 1: MVP Improvements

- [ ] **Email Notifications:** Send email to broker on new lead assignment
- [ ] **Lead Assignment Rules:** Admin-configurable routing rules (e.g., round-robin, territory-based)
- [ ] **Lead Notes:** Timeline of broker interactions with lead
- [ ] **Lead Tags:** Categorization (e.g., "hot", "returning customer")

### Phase 2: Advanced Features

- [ ] **Real-Time Notifications:** Supabase Realtime subscription for instant lead alerts
- [ ] **Lead Scoring:** Automatic priority ranking based on boat price, lead history
- [ ] **Integration with Email Client:** Two-way sync with Gmail/Outlook
- [ ] **Mobile App:** React Native app for broker lead management
- [ ] **LeadSmart Integration:** Leverage `leadSmart.leadHistory` for contact enrichment

### Phase 3: Analytics & AI

- [ ] **Conversion Funnel Analysis:** Cohort analysis, funnel visualization
- [ ] **Response Time Tracking:** Time from lead receipt to first contact
- [ ] **AI Reply Suggestions:** GPT-4 powered email draft generation
- [ ] **Predictive Analytics:** ML model to predict conversion probability

---

## Appendix

### Environment Variables

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Boats Group Webhook
YATCO_IP_WHITELIST_DISABLED=false  # Set to 'true' to bypass IP check (testing only)

# Application
NODE_ENV=production
```

### Testing

**Manual Webhook Test:**

```bash
curl -X POST https://moana-yachting.com/api/leads/yatco \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 35.171.79.77" \
  -d '{
    "lead": {
      "id": "TEST-12345",
      "date": "2026-02-04T10:30:00Z",
      "source": "Boats Group"
    },
    "contact": {
      "name": { "display": "Test Client" },
      "email": "test@example.com",
      "phone": "+33123456789"
    },
    "boat": {
      "make": "Sunseeker",
      "model": "Manhattan 76",
      "year": "2020",
      "price": { "amount": "2500000", "currency": "EUR" }
    },
    "recipient": {
      "officeName": "Moana Yachting",
      "officeId": "389841",
      "contactName": "Cedric Paprocki"
    }
  }'
```

### Boats Group Documentation

**Official LeadFlow Guide:** https://www.boatsgroup.com/leadflow
**Receiver Guidelines:** `/home/julien/Téléchargements/LeadFlow_Receiver_Guidelines-1.pdf`

### TypeScript Types

**Key types defined in `/lib/types.ts`:**

```typescript
interface YatcoLeadPayload { ... }     // Webhook payload structure
interface Lead { ... }                 // Database lead record
interface LeadWithBroker { ... }       // Lead + broker info (from view)
type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';
```

**Zod schemas in `/lib/validations.ts`:**

```typescript
yatcoLeadPayloadSchema                 // Validates incoming webhook payload
leadUpdateSchema                       // Validates broker lead updates
manualLeadSchema                       // Validates manual lead creation
```

---

## Acceptance Criteria Review

### 1. Schema de la table Leads

✅ **Documented** in Section: [Database Architecture](#database-architecture)

**Key Points:**
- Table: `public.leads`
- Primary Key: `id UUID`
- Unique Constraint: `yatco_lead_id`
- Foreign Key: `broker_id → brokers(id)`
- Indexes: 6 indexes for performance
- RLS Policies: Broker-scoped access

### 2. Mapping recipient.officeId/contactName → Broker

✅ **Documented** in Section: [Lead Routing Logic](#lead-routing-logic)

**Key Points:**
- Three-tier fallback: YachtWorld mapping → Email lookup → Name lookup
- Normalization: lowercase, remove accents
- Domain variations: `@moanayachting.com` ↔ `@moana-yachting.com`
- Unmatched leads: `broker_id = NULL`, logged for admin review

### 3. Flux de réception et stockage des leads

✅ **Documented** in Section: [API Flow & Integration](#api-flow--integration)

**Key Points:**
- Webhook endpoint: `POST /api/leads/yatco`
- IP whitelist check → Validation → Deduplication → Broker matching → Insert
- Response codes: 201 (created), 200 (duplicate), 400 (invalid), 403 (forbidden), 500 (error)
- Audit trail: `raw_payload` JSONB stored

### 4. Stratégie de déduplication par lead.id

✅ **Documented** in Section: [Deduplication Strategy](#deduplication-strategy)

**Key Points:**
- Primary deduplication key: `yatco_lead_id` (from `payload.lead.id`)
- Database constraint: `UNIQUE`
- Pre-insert check: Query before insert
- Idempotent response: 200 OK if duplicate detected
- Manual leads: Prefixed with `MANUAL-{timestamp}`

---

**End of Document**
