from scripts.sync_yatco_boss_global import build_patch, parse_date, parse_number, split_location


def test_parse_boss_numbers_and_location():
    assert parse_number("€12,500,000") == 12500000
    assert parse_number("69.1m") == 69.1
    assert split_location("Cannes, Provence-Alpes-Côte d'Azur, France") == (
        "Cannes",
        "France",
    )


def test_boss_feed_maps_to_public_listing_without_boss_url():
    mls_id, patch = build_patch(
        {
            "feedType": "modified",
            "mlsId": "483953",
            "vid": "467303",
            "vesselName": "SALUZI",
            "builder": "AUSTAL",
            "modelYear": "2014",
            "loaText": "69.1m",
            "priceText": "Price on Application",
            "location": "Genoa, Liguria, Italy",
            "brokerName": "Camper & Nicholsons",
        },
        "2026-08-21T12:00:00+00:00",
    )
    assert mls_id == "483953"
    assert patch["listing_status"] == "Active"
    assert patch["city"] == "Genoa"
    assert patch["country"] == "Italy"
    assert patch["length_m"] == 69.1
    assert "listing_url" not in patch
    assert patch["raw_payload"]["yatco_boss"]["vid"] == "467303"


def test_sold_date_is_the_only_precise_boss_event_date():
    assert parse_date("07/31/2026") == "2026-07-31T00:00:00+00:00"
    _, patch = build_patch(
        {"feedType": "sold", "mlsId": "1", "vesselName": "X", "soldDate": "07/31/2026"},
        "2026-08-21T12:00:00+00:00",
    )
    assert patch["listing_status"] == "Sold"
    assert patch["source_updated_at"].startswith("2026-07-31")
