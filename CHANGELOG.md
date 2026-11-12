# Changelog

## 0.1.0 — 2026-11-12

First working release.

- Seven rules: `outlook_css`, `gmail_clip`, `blank_variables`,
  `staging_links` (with production-domain mode), `dark_mode`,
  `insecure_links`, `image_alt`
- `mailcheck.yml` configuration: rule severities (fail/warn/off),
  production domain + allow list, per-file ignore entries
- CLI with text and JSON output; exit codes for CI use
- GitHub Action (composite) with PR annotations and job-summary report
- Fixture-based test suite: every broken fixture is caught, the clean
  fixture passes with zero findings
- Fixed (same day, caught by this repo's own CI on first push): JSON
  output mode in GitHub Actions environments — workflow annotations were
  printed to stdout after the JSON, breaking machine parsing. JSON mode
  now keeps stdout pure JSON; a regression test covers the Actions
  environment.
