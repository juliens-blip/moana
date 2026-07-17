import unittest

from scripts.kyc_worker import (
    EvidenceDocument,
    REPORT_TEMPLATE,
    blank_report,
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
from scripts.apify_linkedin import _comparable, _importance_score, _is_corroborated, _select, _to_profile, split_name


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
        self.assertEqual(len(report["kyc_assessment"]["executive_summary"]), 4)
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
        self.assertIn("preuve de fonds", summary)
        self.assertNotIn("30 M€", summary)
        self.assertNotIn("Aucun signal", summary)

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

if __name__ == "__main__":
    unittest.main()
