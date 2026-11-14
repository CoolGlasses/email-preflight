# Changelog

## 0.1.1 — 2026-11-13

Fixes from the first real-world beta (ScoutCreate's production mailers,
9 rendered templates). 0.1.0 reported 80 findings on that corpus, 71 of
them false positives; 0.1.1 reports 46 — and every failure is real.

### Fixed

- Property matchers no longer confuse hyphenated properties with the
  Outlook-unsupported ones: `text-transform` is not `transform`,
  `background-position` is not `position`, `column-gap` is not `gap`,
  `fill-opacity` is not `opacity`. (43 of the 71 false positives were
  `text-transform` alone.) Vendor-prefixed names are not flagged either.
- `staging_links` checks anchor hrefs only — stylesheet and preconnect
  `<link>` hosts (e.g. Google Fonts) are resources, not destinations.
- `allow_domains` now exempts a host from the non-production label check
  too, and hosts match on a dot boundary (`www.` counts as production).
- `dark_mode` recognises `color-scheme` / `supported-color-schemes`
  meta declarations as handling; message wording softened to match what
  clients actually do.
- `image_alt` tag matching is quote-aware — an ERB `<%= %>` inside an
  attribute value no longer truncates the tag and invents a missing alt.
- Config shape errors (e.g. `allow_domains` as a bare string) fail at
  load time with a clear message instead of crashing a rule mid-run.
  Flow lists (`allow_domains: [a, b]`) now parse as lists.
- The CLI accepts the same file extensions as a bare path argument that
  a directory walk accepts (`.erb`, `.liquid`, `.handlebars` included).

### Changed

- Cosmetic Outlook properties (border-radius, box-shadow, text-shadow,
  opacity, linear-gradient, background-size) moved to a new rule,
  `outlook_cosmetic`, default `warn` — Outlook drops them but the layout
  stays intact, so they no longer fail the build.
- Text output severity tags are consistently uppercase (FAIL / WARN).

### Added

- `outlook_css` now catches button chrome on `<a>` tags (`padding` /
  `display: inline-block` on an anchor) — the most common real Outlook
  break in transactional mail, and the one genuine failure class the
  beta found in ScoutCreate's mail (9 call-to-action buttons).
- Six regression tests from the beta's cases; suite is now 20 tests.

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
