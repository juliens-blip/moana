#!/bin/bash
source .env.local

echo "🔑 Test des clés Supabase..."
echo ""
echo "URL: $NEXT_PUBLIC_SUPABASE_URL"
echo "ANON KEY longueur: ${#NEXT_PUBLIC_SUPABASE_ANON_KEY}"
echo "SERVICE KEY longueur: ${#SUPABASE_SERVICE_ROLE_KEY}"
echo ""

echo "Test avec SERVICE_ROLE_KEY:"
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/brokers?select=broker_name" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | head -50
