-- ============================================
-- FIX RLS POLICIES FOR LOGIN
-- ============================================
-- Problem: Anonymous users cannot read brokers table to authenticate
-- Solution: Add policy to allow anonymous SELECT on brokers for login

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Brokers can view their own profile" ON public.brokers;

-- Create new policy allowing anonymous SELECT (for login)
CREATE POLICY "Allow anonymous login queries"
ON public.brokers
FOR SELECT
TO anon
USING (true);

-- Keep policy for authenticated users to view their own profile
CREATE POLICY "Authenticated brokers can view their own profile"
ON public.brokers
FOR SELECT
TO authenticated
USING (auth.uid()::text = id::text);

-- Update policy should still be restricted to own profile
-- (already exists, no change needed)

COMMENT ON POLICY "Allow anonymous login queries" ON public.brokers
IS 'Allow anonymous users to read broker data for authentication (login flow)';
