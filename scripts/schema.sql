-- ============================================
-- MOANA YACHTING - SUPABASE SCHEMA
-- Migration from Airtable to Supabase
-- ============================================

-- Table brokers
CREATE TABLE IF NOT EXISTS public.brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  broker_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_brokers_email ON public.brokers(email);
CREATE INDEX IF NOT EXISTS idx_brokers_broker_name ON public.brokers(broker_name);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_brokers_updated_at
  BEFORE UPDATE ON public.brokers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires
COMMENT ON TABLE public.brokers IS 'Table des brokers (anciennement dans Airtable)';
COMMENT ON COLUMN public.brokers.broker_name IS 'Nom du broker (username pour login)';

-- ============================================

-- Table listings
CREATE TABLE IF NOT EXISTS public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_bateau TEXT NOT NULL,
  constructeur TEXT NOT NULL,
  longueur_m DECIMAL(10,1) NOT NULL,
  annee INTEGER NOT NULL,
  proprietaire TEXT NOT NULL,
  capitaine TEXT NOT NULL,
  broker_id UUID REFERENCES public.brokers(id) ON DELETE CASCADE,
  localisation TEXT NOT NULL,
  prix_actuel TEXT,
  prix_precedent TEXT,
  dernier_message TEXT,
  commentaire TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  airtable_id TEXT UNIQUE
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_listings_broker_id ON public.listings(broker_id);
CREATE INDEX IF NOT EXISTS idx_listings_nom_bateau ON public.listings(nom_bateau);
CREATE INDEX IF NOT EXISTS idx_listings_constructeur ON public.listings(constructeur);
CREATE INDEX IF NOT EXISTS idx_listings_localisation ON public.listings(localisation);
CREATE INDEX IF NOT EXISTS idx_listings_longueur ON public.listings(longueur_m);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings(created_at DESC);

-- Trigger pour updated_at
CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Contraintes de validation
ALTER TABLE public.listings
  ADD CONSTRAINT check_longueur_positive CHECK (longueur_m > 0),
  ADD CONSTRAINT check_annee_valid CHECK (annee >= 1900 AND annee <= EXTRACT(YEAR FROM CURRENT_DATE) + 2);

-- Commentaires
COMMENT ON TABLE public.listings IS 'Table des bateaux (anciennement dans Airtable)';
COMMENT ON COLUMN public.listings.longueur_m IS 'Longueur en mètres/pieds';
COMMENT ON COLUMN public.listings.prix_actuel IS 'Prix formaté avec devise (ex: "1,850,000 €")';
COMMENT ON COLUMN public.listings.airtable_id IS 'ID Airtable original (pour référence)';

-- ============================================

-- Vue pour joindre listings + broker info
CREATE OR REPLACE VIEW public.listings_with_broker AS
SELECT
  l.*,
  b.broker_name,
  b.email as broker_email
FROM public.listings l
LEFT JOIN public.brokers b ON l.broker_id = b.id;

COMMENT ON VIEW public.listings_with_broker IS 'Vue combinant listings et infos broker';

-- ============================================

-- Row Level Security (RLS)
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Policies pour brokers
CREATE POLICY "Brokers can view their own profile"
ON public.brokers
FOR SELECT
TO authenticated
USING (auth.uid()::text = id::text);

CREATE POLICY "Brokers can update their own profile"
ON public.brokers
FOR UPDATE
TO authenticated
USING (auth.uid()::text = id::text)
WITH CHECK (auth.uid()::text = id::text);

-- Policies pour listings
CREATE POLICY "Authenticated users can view all listings"
ON public.listings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create listings"
ON public.listings
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Brokers can update their own listings"
ON public.listings
FOR UPDATE
TO authenticated
USING (broker_id = auth.uid())
WITH CHECK (broker_id = auth.uid());

CREATE POLICY "Brokers can delete their own listings"
ON public.listings
FOR DELETE
TO authenticated
USING (broker_id = auth.uid());
