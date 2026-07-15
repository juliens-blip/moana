import unittest

from scripts.kyc_worker import (
    EvidenceDocument,
    REPORT_TEMPLATE,
    blank_report,
    canonical_url,
    deterministic_report,
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


if __name__ == "__main__":
    unittest.main()
