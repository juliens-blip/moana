-- ============================================
-- MOANA YACHTING - TRACKED LISTINGS TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS public.bateaux_a_suivre (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_bateau TEXT NOT NULL,
  constructeur TEXT,
  longueur_m DECIMAL(10,2),
  annee INTEGER,
  proprietaire TEXT DEFAULT 'N/A',
  capitaine TEXT DEFAULT 'N/A',
  broker_id UUID REFERENCES public.brokers(id) ON DELETE SET NULL,
  localisation TEXT DEFAULT 'N/A',
  etoile BOOLEAN DEFAULT FALSE,
  nombre_cabines INTEGER,
  prix_actuel TEXT,
  prix_precedent TEXT,
  dernier_message TEXT,
  commentaire TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bateaux_chantier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_bateau TEXT NOT NULL,
  constructeur TEXT,
  longueur_m DECIMAL(10,2),
  annee INTEGER,
  proprietaire TEXT DEFAULT 'N/A',
  capitaine TEXT DEFAULT 'N/A',
  broker_id UUID REFERENCES public.brokers(id) ON DELETE SET NULL,
  localisation TEXT DEFAULT 'N/A',
  etoile BOOLEAN DEFAULT FALSE,
  nombre_cabines INTEGER,
  prix_actuel TEXT,
  prix_precedent TEXT,
  dernier_message TEXT,
  commentaire TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bateaux_a_suivre_broker_id ON public.bateaux_a_suivre(broker_id);
CREATE INDEX IF NOT EXISTS idx_bateaux_a_suivre_nom_bateau ON public.bateaux_a_suivre(nom_bateau);
CREATE INDEX IF NOT EXISTS idx_bateaux_chantier_broker_id ON public.bateaux_chantier(broker_id);
CREATE INDEX IF NOT EXISTS idx_bateaux_chantier_nom_bateau ON public.bateaux_chantier(nom_bateau);

-- Ensure updated_at is refreshed on updates
CREATE TRIGGER update_bateaux_a_suivre_updated_at
  BEFORE UPDATE ON public.bateaux_a_suivre
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bateaux_chantier_updated_at
  BEFORE UPDATE ON public.bateaux_chantier
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.bateaux_a_suivre IS 'Table des bateaux à suivre (indépendante des listings)';
COMMENT ON TABLE public.bateaux_chantier IS 'Table des bateaux chantier (indépendante des listings)';
