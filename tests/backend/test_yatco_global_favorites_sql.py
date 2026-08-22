from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
UP = (ROOT / "supabase/migrations/20260821T0900__yatco_global_favorites_and_tracking.sql").read_text()
DOWN = (ROOT / "supabase/migrations/20260821T0900__yatco_global_favorites_and_tracking.down.sql").read_text()


def test_favorites_are_scoped_to_broker_and_listing_with_cascade():
    assert "CREATE TABLE IF NOT EXISTS public.yatco_global_favorites" in UP
    assert "broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE" in UP
    assert "listing_id UUID NOT NULL REFERENCES public.yatco_global_listings(id) ON DELETE CASCADE" in UP
    assert "UNIQUE (broker_id, listing_id)" in UP


def test_favorite_history_captures_full_listing_snapshots_on_scraper_updates():
    assert "listing_snapshot JSONB NOT NULL" in UP
    assert "to_jsonb(NEW)" in UP
    assert "AFTER INSERT OR UPDATE ON public.yatco_global_listings" in UP
    assert "listing_status TEXT" in UP
    assert "cabins INTEGER" in UP


def test_down_migration_is_local_and_reversible():
    assert "DROP TABLE IF EXISTS public.yatco_global_favorite_history" in DOWN
    assert "DROP TABLE IF EXISTS public.yatco_global_favorites" in DOWN
    assert "DROP COLUMN IF EXISTS cabins" in DOWN
