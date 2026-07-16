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
from scripts.linkedin_compat import (
    choose_headline,
    choose_location,
    choose_name,
    is_profile_url,
    parse_experience_lines,
    strict_rate_limit_message,
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

    def test_linkedin_compat_uses_current_semantic_headings(self):
        headings = ["0 notifications", "Bill Gates", "About", "Activity"]
        lines = [
            "Bill Gates",
            "Chair, Gates Foundation and Founder, Breakthrough Energy",
            "Seattle, Washington, United States · Contact info",
        ]
        self.assertEqual(choose_name(headings, lines), "Bill Gates")
        self.assertIn("Founder", choose_headline("Bill Gates", lines))
        self.assertEqual(choose_location(lines), "Seattle, Washington, United States")
        self.assertEqual(
            choose_location(["Seattle, Washington, United States", "·", "Contact info"]),
            "Seattle, Washington, United States",
        )

    def test_linkedin_compat_parses_current_experience_sections(self):
        lines = [
            "Experience",
            "Co-chair",
            "Gates Foundation",
            "2000 - Present · 26 yrs 7 mos",
            "Founder",
            "Breakthrough Energy",
            "2015 - Present · 11 yrs 7 mos",
            "About",
        ]
        items = parse_experience_lines(lines)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["company"], "Gates Foundation")
        self.assertEqual(items[1]["title"], "Founder")

    def test_linkedin_compat_does_not_treat_ad_copy_as_rate_limit(self):
        self.assertEqual(
            strict_rate_limit_message(
                "https://www.linkedin.com/in/example/",
                "This ad says try again later.",
            ),
            "",
        )
        self.assertIn(
            "rate limit",
            strict_rate_limit_message(
                "https://www.linkedin.com/in/example/",
                "Too many requests. Please slow down.",
            ).lower(),
        )
        self.assertTrue(is_profile_url("https://www.linkedin.com/in/example/"))
        self.assertFalse(is_profile_url("https://www.linkedin.com/company/example/"))

if __name__ == "__main__":
    unittest.main()
