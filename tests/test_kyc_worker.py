import unittest

from scripts.kyc_worker import (
    EvidenceDocument,
    REPORT_TEMPLATE,
    blank_report,
    rank_search_result_urls,
    searxng_result_urls,
    build_primary_search_queries,
    canonical_url,
    deterministic_report,
    diverse_urls,
    email_domain,
    normalize_report,
    sanitize_error,
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
                url="https://music.example/profile",
                text="Example Person is a professional musician.",
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

if __name__ == "__main__":
    unittest.main()
