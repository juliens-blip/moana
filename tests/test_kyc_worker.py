import unittest

import asyncio
import os
from unittest import mock

from scripts.kyc_worker import (
    EvidenceDocument,
    REPORT_TEMPLATE,
    Settings,
    blank_report,
    enrich_adverse_media,
    enrich_company_profile,
    linkedin_company_url,
    linkedin_content_chars,
    rank_search_result_urls,
    searxng_result_urls,
    searxng_search_hits,
    build_primary_search_queries,
    canonical_url,
    deterministic_report,
    diverse_urls,
    email_domain,
    normalize_report,
    sanitize_error,
)
from scripts.apify_linkedin import (
    _comparable,
    _importance_score,
    _is_corroborated,
    _normalize_company,
    _profile_text,
    _select,
    _to_profile,
    split_name,
)
from scripts.apify_adverse_media import (
    _is_subject_adverse,
    _map_category,
    _map_confidence,
    _normalize_hit,
    _normalize_items,
)


QUERY = {
    "full_name": "Example Person",
    "email": "person@example.com",
    "company_name": "Example Co",
    "country": "FR",
    "city": "Cannes",
}


class KycWorkerTests(unittest.TestCase):
    def test_blank_report_uses_exact_top_level_contract(self):
        report = blank_report(QUERY)
        self.assertEqual(set(report), set(REPORT_TEMPLATE))
        self.assertEqual(report["query_input"], QUERY)
        self.assertEqual(report["identity_resolution"]["status"], "unresolved")

    def test_unknown_source_is_removed_and_result_becomes_insufficient(self):
        candidate = blank_report(QUERY)
        candidate["identity_resolution"]["status"] = "confirmed"
        candidate["sources"] = [
            {"type": "news", "url": "https://invented.example/story", "note": "Unsupported"}
        ]
        report = normalize_report(candidate, QUERY, [])
        self.assertEqual(report["sources"], [])
        self.assertEqual(report["identity_resolution"]["status"], "unresolved")
        self.assertEqual(report["kyc_assessment"]["recommended_review"], "insufficient_data")

    def test_clear_screening_is_not_claimed_by_v1(self):
        source = EvidenceDocument(
            url="https://example.com/profile",
            text="Example Person is listed on the company team page.",
            source_type="company_website",
        )
        candidate = blank_report(QUERY)
        candidate["sources"] = [
            {"type": "company_website", "url": source.url, "note": "Team profile"}
        ]
        candidate["risk_screening"]["sanctions"]["status"] = "clear"
        report = normalize_report(candidate, QUERY, [source])
        self.assertEqual(report["risk_screening"]["sanctions"]["status"], "not_enough_data")

    def test_url_and_email_normalization(self):
        self.assertEqual(email_domain("Person@Example.COM"), "example.com")
        self.assertEqual(canonical_url("HTTPS://Example.COM/a//b#fragment"), "https://example.com/a/b")
        self.assertEqual(canonical_url("file:///etc/passwd"), "")

    def test_canonical_url_collapses_linkedin_country_subdomains(self):
        # LinkedIn serves the same public profile under country subdomains
        # (it.linkedin.com, fr.linkedin.com, ...). Apify always returns
        # www.linkedin.com; SearXNG/Crawl4AI discovery can surface a
        # localized subdomain for the exact same profile. Both must collapse
        # to the same key so Apify's richer document wins the merge instead
        # of silently losing to a bare search-snippet duplicate.
        self.assertEqual(
            canonical_url("https://it.linkedin.com/in/gaetano-nicolosi-22211433"),
            canonical_url("https://www.linkedin.com/in/gaetano-nicolosi-22211433"),
        )
        # Unrelated linkedin.com paths (company pages, feed, etc.) are untouched.
        self.assertEqual(
            canonical_url("https://it.linkedin.com/company/example"),
            "https://it.linkedin.com/company/example",
        )

    def test_secret_like_error_values_are_redacted(self):
        message = sanitize_error(RuntimeError("Authorization: Bearer abc123 failed"))
        self.assertNotIn("abc123", message)
        self.assertIn("[redacted]", message)

    def test_primary_query_uses_professional_context(self):
        queries = build_primary_search_queries(QUERY)
        self.assertEqual(len(queries), 1)
        self.assertIn('"Example Person"', queries[0])
        self.assertIn("example.com", queries[0])

    def test_search_result_links_exclude_navigation_and_images(self):
        links = {
            "external": [
                {
                    "href": "https://example.com/team/example-person",
                    "text": "Example Person - Director",
                },
                {"href": "https://imgs.search.brave.com/asset.webp"},
                {
                    "href": "https://docs.example.org/example-person.pdf",
                    "text": "Example Person dossier",
                },
                {"href": "https://search.brave.com/help"},
                {
                    "href": "https://news.example.org/example-person#bio",
                    "text": "Interview with Example Person",
                },
                {"href": "https://irrelevant.example.net/profile", "text": "Another Person"},
            ]
        }
        self.assertEqual(
            rank_search_result_urls(links, 5, "Example Person"),
            [
                "https://example.com/team/example-person",
                "https://news.example.org/example-person",
            ],
        )

    def test_searxng_results_are_filtered_and_ranked(self):
        payload = {
            "results": [
                {
                    "url": "https://social.example/other",
                    "title": "Example Person - Musician",
                    "content": "Professional drummer and album artist",
                },
                {
                    "url": "https://business.example/example-person",
                    "title": "Example Person - CEO",
                    "content": "Company founder and director",
                },
            ]
        }
        self.assertEqual(
            searxng_result_urls(payload, 5, "Example Person"),
            [
                "https://business.example/example-person",
                "https://social.example/other",
            ],
        )
        hits = searxng_search_hits(payload, 1, "Example Person")
        self.assertEqual(hits[0].title, "Example Person - CEO")
        self.assertIn("founder", hits[0].content)

    def test_discovery_keeps_multiple_domains(self):
        urls = [
            "https://www.linkedin.com/in/one",
            "https://www.linkedin.com/in/two",
            "https://www.linkedin.com/in/three",
            "https://example.com/profile",
            "https://news.example.org/story",
        ]
        self.assertEqual(
            diverse_urls(urls, 4),
            [urls[0], urls[3], urls[4]],
        )

    def test_deterministic_report_uses_multiple_crawl4ai_sources(self):
        documents = [
            EvidenceDocument(
                url="https://www.linkedin.com/in/example-person",
                text="# Example Person\nDirector at Example Co in Cannes",
                source_type="linkedin",
            ),
            EvidenceDocument(
                url="https://example.com/team/example-person",
                text="Example Person is a director at Example Co in France.",
                source_type="company_website",
            ),
        ]
        report = deterministic_report(QUERY, documents)
        self.assertEqual(report["identity_resolution"]["status"], "probable")
        self.assertEqual(len(report["sources"]), 2)
        self.assertIn("Crawl4AI", report["kyc_assessment"]["key_reasons"][0])
        self.assertEqual(len(report["kyc_assessment"]["executive_summary"]), 3)
        self.assertIn("Client potentiel", report["kyc_assessment"]["executive_summary"][0])
        self.assertEqual(
            report["risk_screening"]["pep"]["status"],
            "not_enough_data",
        )

    def test_exact_public_email_confirms_identity(self):
        documents = [
            EvidenceDocument(
                url="https://example.com/team",
                text="Example Person — person@example.com — Example Co",
                source_type="company_website",
            )
        ]
        report = deterministic_report(QUERY, documents)
        self.assertEqual(report["identity_resolution"]["status"], "confirmed")
        self.assertEqual(report["person_profile"]["emails"], ["person@example.com"])

    def test_name_only_homonyms_stay_ambiguous(self):
        weak_query = {
            "full_name": "Example Person",
            "email": "person@gmail.com",
            "company_name": "",
            "country": "",
            "city": "",
        }
        documents = [
            EvidenceDocument(
                url="https://legal.example/profile",
                text="Example Person is a commercial lawyer.",
                source_type="other",
            ),
            EvidenceDocument(
                url="https://business.example/profile",
                text="Example Person is a company president.",
                source_type="other",
            ),
        ]
        report = deterministic_report(weak_query, documents)
        self.assertEqual(report["identity_resolution"]["status"], "ambiguous")
        self.assertEqual(len(report["identity_resolution"]["matched_persons"]), 2)
        self.assertTrue(
            all(len(item["evidence"]) == 1 for item in report["identity_resolution"]["matched_persons"])
        )

    def test_yachting_candidate_is_ranked_without_confirming_identity(self):
        documents = [
            EvidenceDocument(
                url="https://www.linkedin.com/in/example-person",
                text="Example Person works in a general professional role.",
                source_type="linkedin",
            ),
            EvidenceDocument(
                url="https://broker.example.org/example-person",
                text="Example Person is a yacht charter broker and company founder.",
                source_type="company_website",
            ),
        ]
        report = deterministic_report(QUERY, documents)
        selected = report["identity_resolution"]["matched_persons"][0]
        rationale = report["identity_resolution"]["selected_profile_rationale"]
        self.assertIn("yacht charter broker", selected["headline"].lower())
        self.assertIn("proximité yachting", rationale)
        self.assertIn(report["identity_resolution"]["status"], {"probable", "ambiguous"})

    def test_summary_never_claims_unsupported_wealth_or_screening_clearance(self):
        weak_query = {
            "full_name": "Example Person",
            "email": "person@gmail.com",
            "company_name": "",
            "country": "",
            "city": "",
        }
        document = EvidenceDocument(
            url="https://www.linkedin.com/in/example-person",
            text="# Example Person - Founder at Example Ventures\nEntrepreneur and company director",
            source_type="linkedin",
        )
        report = deterministic_report(weak_query, [document])
        summary = " ".join(report["kyc_assessment"]["executive_summary"])
        self.assertIn("non confirmée", summary)
        self.assertNotIn("capacité d’achat", summary)
        self.assertNotIn("30 M€", summary)
        self.assertNotIn("Aucun signal", summary)

    def test_summary_keeps_warning_line_on_pep_possible_homonym(self):
        documents = [
            EvidenceDocument(
                url="https://www.linkedin.com/in/example-person",
                text="# Example Person\nDirector at Example Co in Cannes",
                source_type="linkedin",
            ),
            EvidenceDocument(
                url="https://example.com/team/example-person",
                text="Example Person is a director at Example Co in France.",
                source_type="company_website",
            ),
            EvidenceDocument(
                url="https://pep.example/example-person",
                text="Example Person listed as a politically exposed person.",
                source_type="pep_db",
            ),
        ]
        report = deterministic_report(QUERY, documents)
        summary = report["kyc_assessment"]["executive_summary"]
        self.assertEqual(len(summary), 4)
        self.assertIn("Homonyme sanctions ou PEP possible", summary[-1])

    def test_summary_surfaces_linkedin_location(self):
        documents = [
            EvidenceDocument(
                url="https://www.linkedin.com/in/example-person",
                text="Example Person\nDirector at Example Co\nLocation: Cannes, France",
                source_type="linkedin",
            ),
            EvidenceDocument(
                url="https://example.com/team/example-person",
                text="Example Person is a director at Example Co in France.",
                source_type="company_website",
            ),
        ]
        report = deterministic_report(QUERY, documents)
        summary = " ".join(report["kyc_assessment"]["executive_summary"])
        self.assertIn("Cannes, France", summary)
        self.assertEqual(report["person_profile"]["location"], "Cannes")

    def test_summary_surfaces_linkedin_about_excerpt(self):
        documents = [
            EvidenceDocument(
                url="https://www.linkedin.com/in/example-person",
                text=(
                    "Example Person\nDirector at Example Co\n"
                    "About: Twenty years building cross-border ventures across Europe."
                ),
                source_type="linkedin",
            ),
            EvidenceDocument(
                url="https://example.com/team/example-person",
                text="Example Person is a director at Example Co in France.",
                source_type="company_website",
            ),
        ]
        report = deterministic_report(QUERY, documents)
        summary = " ".join(report["kyc_assessment"]["executive_summary"])
        self.assertIn("Rôle et missions", summary)
        self.assertIn("cross-border ventures", summary)

    def test_summary_renders_structured_template_fields(self):
        item = {
            "name": "Gaetano NICOLOSI",
            "headline": "Presidente presso Nicolosi Trasporti",
            "linkedinUrl": "https://www.linkedin.com/in/gaetano-nicolosi-22211433",
            "location": {"parsed": {"text": "Catania, Italie"}},
            "currentPosition": [
                {
                    "position": "Presidente",
                    "companyName": "Nicolosi Trasporti",
                    "description": "Direction générale et développement commercial.",
                }
            ],
        }
        document = EvidenceDocument(
            url=item["linkedinUrl"],
            text=_profile_text(item),
            source_type="linkedin",
        )
        report = deterministic_report({**QUERY, "full_name": "Gaetano Nicolosi"}, [document])
        summary = report["kyc_assessment"]["executive_summary"]
        joined = " ".join(summary)
        self.assertIn("Métier : Presidente", joined)
        self.assertIn("Entreprise : Nicolosi Trasporti", joined)
        self.assertIn("Rôle et missions majeures : Direction générale", joined)
        self.assertIn("Localisation : Catania, Italie", joined)

    def test_profile_text_emits_structured_fields(self):
        item = {
            "name": "Daniel Weitmann",
            "headline": "CEO at Golden Suisse",
            "linkedinUrl": "https://www.linkedin.com/in/daniel-weitmann",
            "location": {"parsed": {"text": "Zürich"}},
            "currentPosition": [
                {"position": "Chief Executive Officer", "companyName": "Golden Suisse"}
            ],
        }
        text = _profile_text(item)
        self.assertIn("Métier: Chief Executive Officer", text)
        self.assertIn("Entreprise: Golden Suisse", text)
        self.assertIn("Location: Zürich", text)

    def test_person_profile_location_falls_back_to_linkedin_when_query_city_unconfirmed(self):
        query = {**QUERY, "city": "Nice"}
        documents = [
            EvidenceDocument(
                url="https://www.linkedin.com/in/example-person",
                text="Example Person\nDirector at Example Co\nLocation: Zürich, Switzerland",
                source_type="linkedin",
            ),
            EvidenceDocument(
                url="https://example.com/team/example-person",
                text="Example Person is a director at Example Co in France.",
                source_type="company_website",
            ),
        ]
        report = deterministic_report(query, documents)
        self.assertEqual(report["person_profile"]["location"], "Zürich, Switzerland")

    def test_split_name_requires_first_and_last(self):
        self.assertEqual(split_name("Gaetano Nicolosi"), ("Gaetano", "Nicolosi"))
        self.assertEqual(split_name("Foulques de Raigniac"), ("Foulques", "de Raigniac"))
        self.assertIsNone(split_name("Madonna"))

    def test_to_profile_builds_evidence_text(self):
        item = {
            "name": "Gaetano NICOLOSI",
            "position": "Presidente presso Nicolosi Trasporti Società Benefit s.r.l.",
            "location": {"linkedinText": "Catania"},
            "linkedinUrl": "https://www.linkedin.com/in/gaetano-nicolosi-22211433",
        }
        profile = _to_profile(item)
        self.assertEqual(profile["url"], item["linkedinUrl"])
        self.assertIn("Presidente", profile["text"])
        self.assertIn("Catania", profile["text"])

    def test_to_profile_rejects_incomplete_items(self):
        self.assertIsNone(_to_profile({"name": "No URL"}))
        self.assertIsNone(_to_profile({"linkedinUrl": "https://www.linkedin.com/in/x/"}))
        self.assertIsNone(_to_profile("not-a-dict"))

    def test_corroboration_rejects_unrelated_homonym(self):
        president = _to_profile(
            {
                "name": "Gaetano Nicolosi",
                "position": "Presidente presso Nicolosi Trasporti Società Benefit s.r.l.",
                "location": {"linkedinText": "Catania"},
                "linkedinUrl": "https://www.linkedin.com/in/gaetano-nicolosi-22211433",
            }
        )
        homonym = _to_profile(
            {
                "name": "Gaetano Nicolosi",
                "position": "Ingegnere presso Altra Azienda S.p.A.",
                "location": {"linkedinText": "Milano"},
                "linkedinUrl": "https://www.linkedin.com/in/ing-gaetano-nicolosi-00074bbb",
            }
        )
        context_terms = [_comparable("Nicolosi Trasporti")]
        self.assertTrue(_is_corroborated(president, context_terms))
        self.assertFalse(_is_corroborated(homonym, context_terms))

    def test_importance_score_ranks_seniority_and_yachting(self):
        founder = _to_profile(
            {
                "name": "Jane Example",
                "position": "Founder and CEO at Example Holdings",
                "linkedinUrl": "https://www.linkedin.com/in/jane-example/",
            }
        )
        director = _to_profile(
            {
                "name": "Jim Example",
                "position": "Managing Director at Example Holdings",
                "linkedinUrl": "https://www.linkedin.com/in/jim-example/",
            }
        )
        yacht_broker = _to_profile(
            {
                "name": "John Example",
                "position": "Superyacht charter broker",
                "linkedinUrl": "https://www.linkedin.com/in/john-example/",
            }
        )
        clerk = _to_profile(
            {
                "name": "Jo Example",
                "position": "Administrative assistant at Example Holdings",
                "linkedinUrl": "https://www.linkedin.com/in/jo-example/",
            }
        )
        self.assertGreater(_importance_score(founder), _importance_score(director))
        self.assertGreater(_importance_score(director), _importance_score(clerk))
        self.assertGreater(_importance_score(yacht_broker), _importance_score(clerk))
        self.assertEqual(_importance_score(clerk), 0)

    def test_to_profile_reads_full_mode_shape(self):
        profile = _to_profile(
            {
                "firstName": "Daniel",
                "lastName": "Weitmann",
                "headline": "Executive Chairman at Golden Suisse",
                "about": "20+ years building investment strategies across Europe.",
                "location": {
                    "linkedinText": "Greater Geneva Area",
                    "parsed": {"text": "Geneva, Switzerland"},
                },
                "currentPosition": [
                    {"position": "Executive Chairman", "companyName": "Golden Suisse"},
                ],
                "linkedinUrl": "https://www.linkedin.com/in/daniel-weitmann-example/",
            }
        )
        self.assertEqual(profile["name"], "Daniel Weitmann")
        self.assertIn("Geneva, Switzerland", profile["text"])
        self.assertIn("About", profile["text"])
        self.assertIn("20+ years", profile["text"])
        self.assertIn("Executive Chairman - Golden Suisse", profile["text"])

    def test_select_falls_back_to_importance_without_context(self):
        junior = _to_profile(
            {"name": "Jo Example", "position": "Intern", "linkedinUrl": "https://www.linkedin.com/in/jo/"}
        )
        senior = _to_profile(
            {"name": "Jo Example", "position": "Founder at Acme", "linkedinUrl": "https://www.linkedin.com/in/jo2/"}
        )
        selected = _select([junior, senior], max_profiles=1, context_terms=[], full_name="Jo Example")
        self.assertEqual(selected, [senior])


GOLDEN_COMPANY = {
    "name": "Golden Suisse",
    "website": "https://www.goldensuisse.com",
    "industries": [{"name": "Financial Services"}],
    "locations": [
        {"line1": "Golden Suisse", "city": "Zurich", "geographicArea": "Canton of Zurich", "country": "CH"}
    ],
    "foundedOn": {"year": 2016},
    "companyType": "Privately Held",
    "employeeCount": 12,
}


class CompanyEnrichmentTests(unittest.TestCase):
    def test_normalize_company_maps_all_available_fields(self):
        profile = _normalize_company(GOLDEN_COMPANY)
        self.assertEqual(profile["company_name"], "Golden Suisse")
        self.assertEqual(profile["website"], "https://www.goldensuisse.com")
        self.assertEqual(profile["industry"], "Financial Services")
        self.assertIn("Zurich", profile["address"])
        self.assertEqual(profile["jurisdiction"], "CH")
        self.assertEqual(profile["incorporation_date"], "2016")
        self.assertEqual(profile["legal_form"], "Privately Held")
        self.assertEqual(profile["financials"]["employees"], "12")

    def test_normalize_company_robust_to_missing_fields(self):
        self.assertEqual(_normalize_company({}), {})
        self.assertEqual(_normalize_company("not-a-dict"), {})
        self.assertEqual(_normalize_company({"name": "Acme"}), {"company_name": "Acme"})
        # None values must not create keys
        self.assertEqual(_normalize_company({"name": "Acme", "website": None}), {"company_name": "Acme"})

    def test_profile_text_emits_company_url_line(self):
        item = {
            "name": "Xavier Yonn",
            "linkedinUrl": "https://www.linkedin.com/in/xavier-yonn",
            "currentPosition": [
                {
                    "position": "CEO",
                    "companyName": "Acme",
                    "companyLinkedinUrl": "https://www.linkedin.com/company/acme/",
                }
            ],
        }
        text = _profile_text(item)
        self.assertIn("EntrepriseUrl: https://www.linkedin.com/company/acme/", text)

    def test_linkedin_company_url_reads_line(self):
        doc = EvidenceDocument(
            url="https://www.linkedin.com/in/xavier-yonn",
            text="Xavier Yonn\nEntrepriseUrl: https://www.linkedin.com/company/acme/",
            source_type="linkedin",
        )
        self.assertEqual(linkedin_company_url(doc), "https://www.linkedin.com/company/acme/")

    def test_enrich_company_profile_merges_without_overwriting_stronger_source(self):
        report = blank_report(QUERY)
        report["identity_resolution"]["status"] = "confirmed"
        # Stronger source (domain match) already set the website — must survive.
        report["company_profile"]["website"] = "https://existing.example"
        docs = [
            EvidenceDocument(
                url="https://www.linkedin.com/in/xavier-yonn",
                text="Xavier Yonn\nEntrepriseUrl: https://www.linkedin.com/company/acme/",
                source_type="linkedin",
            )
        ]

        async def fake_company(company_url, company_name, token, actor_id):
            self.assertEqual(company_url, "https://www.linkedin.com/company/acme/")
            return {"company_name": "Acme", "website": "https://apify.example", "industry": "Tech"}

        with mock.patch.dict(os.environ, {"APIFY_API_TOKEN": "x", "APIFY_COMPANY_ENRICH": "1"}):
            settings = Settings.from_env(require_database=False, require_llm=False)
            with mock.patch("scripts.kyc_worker.search_linkedin_company", fake_company):
                out = asyncio.run(enrich_company_profile(report, docs, QUERY, settings))
        self.assertEqual(out["company_profile"]["website"], "https://existing.example")
        self.assertEqual(out["company_profile"]["company_name"], "Acme")
        self.assertEqual(out["company_profile"]["industry"], "Tech")

    def test_enrich_company_profile_skips_pure_homonym(self):
        report = blank_report({**QUERY, "company_name": ""})
        report["identity_resolution"]["status"] = "ambiguous"
        called = False

        async def fake_company(*args):
            nonlocal called
            called = True
            return {"company_name": "Should not be used"}

        with mock.patch.dict(os.environ, {"APIFY_API_TOKEN": "x", "APIFY_COMPANY_ENRICH": "1"}):
            settings = Settings.from_env(require_database=False, require_llm=False)
            with mock.patch("scripts.kyc_worker.search_linkedin_company", fake_company):
                out = asyncio.run(enrich_company_profile(report, [], {**QUERY, "company_name": ""}, settings))
        self.assertFalse(called)
        self.assertEqual(out["company_profile"]["company_name"], "")

    def test_enrich_company_profile_disabled_by_flag(self):
        report = blank_report(QUERY)
        called = False

        async def fake_company(*args):
            nonlocal called
            called = True
            return {}

        with mock.patch.dict(os.environ, {"APIFY_API_TOKEN": "x", "APIFY_COMPANY_ENRICH": "0"}):
            settings = Settings.from_env(require_database=False, require_llm=False)
            with mock.patch("scripts.kyc_worker.search_linkedin_company", fake_company):
                out = asyncio.run(enrich_company_profile(report, [], QUERY, settings))
        self.assertFalse(called)


GOLDEN_HIT = {
    "title": "Bernard Madoff, Architect of Largest Ponzi Scheme in History",
    "url": "https://www.nytimes.com/2021/04/14/business/bernie-madoff-dead.html",
    "source": "The New York Times",
    "publishedDate": "Apr 15, 2021",
    "snippet": "Architect of largest Ponzi scheme in history.",
    "riskCategory": "financial_crime",
    "severity": "high",
    "entityRole": "perpetrator",
    "entityMatchConfidence": "high",
    "reason": "Perpetrator of a Ponzi scheme.",
}

# A rich "Full"-mode LinkedIn profile (>600 chars) — above the default screen gate.
RICH_LINKEDIN_DOCS = [
    EvidenceDocument(
        url="https://www.linkedin.com/in/example-person",
        text=(
            "Name: Example Person\nTitre: Managing Director\nPoste: Example Capital\n"
            "Localisation: Monaco\nAbout: " + ("Seasoned executive in maritime finance. " * 20)
        ),
        source_type="linkedin",
    )
]


class AdverseMediaTests(unittest.TestCase):
    def test_map_category_covers_families(self):
        self.assertEqual(_map_category("financial_crime"), "criminal")
        self.assertEqual(_map_category("money laundering"), "criminal")  # space-normalised
        self.assertEqual(_map_category("sanctions"), "regulatory")
        self.assertEqual(_map_category("regulatory-enforcement"), "regulatory")  # hyphen-normalised
        self.assertEqual(_map_category("litigation"), "civil")
        self.assertEqual(_map_category("tax"), "fiscal")
        self.assertEqual(_map_category("environmental"), "reputational")
        self.assertEqual(_map_category("something_unknown"), "reputational")  # safe default
        self.assertEqual(_map_category(None), "reputational")

    def test_map_confidence_from_severity(self):
        self.assertEqual(_map_confidence("high"), "high")
        self.assertEqual(_map_confidence("Medium"), "medium")
        self.assertEqual(_map_confidence("low"), "low")
        self.assertEqual(_map_confidence("bogus"), "low")
        self.assertEqual(_map_confidence(None), "low")

    def test_normalize_hit_maps_all_fields(self):
        item = _normalize_hit(GOLDEN_HIT, jurisdiction="US")
        self.assertEqual(item["category"], "criminal")
        self.assertEqual(item["confidence"], "high")
        self.assertEqual(item["date"], "Apr 15, 2021")
        self.assertEqual(item["jurisdiction"], "US")
        self.assertEqual(item["status_type"], "media_report")
        self.assertEqual(item["source_url"], GOLDEN_HIT["url"])
        self.assertIn("Ponzi", item["summary"])

    def test_normalize_hit_drops_non_adverse_role(self):
        # Subject is the victim/plaintiff -> never framed as wrongdoer.
        self.assertIsNone(_normalize_hit({**GOLDEN_HIT, "entityRole": "victim"}))
        self.assertIsNone(_normalize_hit({**GOLDEN_HIT, "entityRole": "plaintiff"}))
        self.assertFalse(_is_subject_adverse("victim"))
        self.assertTrue(_is_subject_adverse("perpetrator"))

    def test_normalize_hit_drops_low_match_confidence(self):
        # Likely homonym -> drop (anti-defamation second guard).
        self.assertIsNone(_normalize_hit({**GOLDEN_HIT, "entityMatchConfidence": "low"}))

    def test_normalize_hit_requires_source_url(self):
        self.assertIsNone(_normalize_hit({**GOLDEN_HIT, "url": ""}))
        self.assertIsNone(_normalize_hit("not-a-dict"))

    def test_normalize_items_flattens_and_dedupes(self):
        items = [
            {"country": "US", "hits": [GOLDEN_HIT, GOLDEN_HIT]},  # duplicate URL
            {"country": "US", "hits": [{**GOLDEN_HIT, "url": "https://other.example/x"}]},
        ]
        out = _normalize_items(items)
        self.assertEqual(len(out), 2)  # de-duplicated by source_url
        self.assertEqual({h["source_url"] for h in out},
                         {GOLDEN_HIT["url"], "https://other.example/x"})

    def test_linkedin_content_chars_counts_only_linkedin(self):
        docs = [
            EvidenceDocument(url="https://a", text="x" * 100, source_type="linkedin"),
            EvidenceDocument(url="https://b", text="y" * 50, source_type="linkedin"),
            EvidenceDocument(url="https://c", text="z" * 999, source_type="news"),
        ]
        self.assertEqual(linkedin_content_chars(docs), 150)
        self.assertEqual(linkedin_content_chars([]), 0)

    def test_enrich_adverse_media_guards_unresolved_identity(self):
        report = blank_report(QUERY)
        report["identity_resolution"]["status"] = "ambiguous"  # not confirmed/probable
        report["person_profile"]["full_name"] = "Example Person"
        called = False

        async def fake_screen(*args, **kwargs):
            nonlocal called
            called = True
            return [_normalize_hit(GOLDEN_HIT)]

        with mock.patch.dict(os.environ, {"APIFY_API_TOKEN": "x", "APIFY_ADVERSE_MEDIA": "1"}):
            settings = Settings.from_env(require_database=False, require_llm=False)
            with mock.patch("scripts.kyc_worker.screen_adverse_media", fake_screen):
                out = asyncio.run(enrich_adverse_media(report, RICH_LINKEDIN_DOCS, QUERY, settings))
        self.assertFalse(called)  # never screens an unattributed subject
        self.assertEqual(out["adverse_media"], [])

    def test_enrich_adverse_media_skips_thin_linkedin(self):
        # Attributable identity, but LinkedIn returned little -> not worth the paid screen.
        report = blank_report(QUERY)
        report["identity_resolution"]["status"] = "confirmed"
        report["person_profile"]["full_name"] = "Example Person"
        thin_docs = [EvidenceDocument(url="https://li", text="Name: Example Person", source_type="linkedin")]
        called = False

        async def fake_screen(*args, **kwargs):
            nonlocal called
            called = True
            return [_normalize_hit(GOLDEN_HIT)]

        with mock.patch.dict(os.environ, {"APIFY_API_TOKEN": "x", "APIFY_ADVERSE_MEDIA": "1"}):
            settings = Settings.from_env(require_database=False, require_llm=False)
            with mock.patch("scripts.kyc_worker.screen_adverse_media", fake_screen):
                out = asyncio.run(enrich_adverse_media(report, thin_docs, QUERY, settings))
        self.assertFalse(called)  # LinkedIn footprint below threshold -> no screen
        self.assertEqual(out["adverse_media"], [])

    def test_enrich_adverse_media_merges_when_rich_linkedin(self):
        report = blank_report(QUERY)
        report["identity_resolution"]["status"] = "confirmed"
        report["person_profile"]["full_name"] = "Example Person"

        async def fake_screen(names, entity_type, country, aliases, token, actor_id, min_sev, max_hits):
            self.assertEqual(names, ["Example Person"])
            self.assertEqual(entity_type, "person")
            return [_normalize_hit(GOLDEN_HIT)]

        with mock.patch.dict(os.environ, {"APIFY_API_TOKEN": "x", "APIFY_ADVERSE_MEDIA": "1"}):
            settings = Settings.from_env(require_database=False, require_llm=False)
            with mock.patch("scripts.kyc_worker.screen_adverse_media", fake_screen):
                out = asyncio.run(enrich_adverse_media(report, RICH_LINKEDIN_DOCS, QUERY, settings))
        self.assertEqual(len(out["adverse_media"]), 1)
        self.assertEqual(out["adverse_media"][0]["source_url"], GOLDEN_HIT["url"])
        self.assertIn(GOLDEN_HIT["url"], out["sources"])  # source recorded

    def test_enrich_adverse_media_disabled_by_flag(self):
        report = blank_report(QUERY)
        report["identity_resolution"]["status"] = "confirmed"
        report["person_profile"]["full_name"] = "Example Person"
        called = False

        async def fake_screen(*args, **kwargs):
            nonlocal called
            called = True
            return []

        with mock.patch.dict(os.environ, {"APIFY_API_TOKEN": "x", "APIFY_ADVERSE_MEDIA": "0"}):
            settings = Settings.from_env(require_database=False, require_llm=False)
            with mock.patch("scripts.kyc_worker.screen_adverse_media", fake_screen):
                out = asyncio.run(enrich_adverse_media(report, RICH_LINKEDIN_DOCS, QUERY, settings))
        self.assertFalse(called)


if __name__ == "__main__":
    unittest.main()
