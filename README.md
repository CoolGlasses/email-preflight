# Email Preflight

**Catch broken transactional email before it ships.**

Your password-reset email renders perfectly in Gmail and falls apart in Outlook. Your receipt gets clipped by Gmail at 102 KB, hiding the footer. A staging link survives into production and a customer's reset button points at a server that has never heard of them. A template variable ships empty and a real person is greeted with "Hi, undefined."

None of these produce an error anywhere. The customer just quietly has a bad day, and you find out from a support ticket — or never.

Email Preflight is a linter for **rendered transactional email HTML**. It runs in your CI, on every pull request, and fails the change when the email would have broken — with the file and line that caused it.

```text
src/emails/password-reset.html
  line 14  [FAIL] staging_links: Link points at a non-production host (non-production subdomain): https://staging.app.example.com/reset?token=… — customers will land on a server that does not know them.
  line 22  [FAIL] blank_variables: literal "undefined" value in message text: "Hi undefined," — a variable reached the output unfilled.
  line 31  [FAIL] outlook_css: "display: flex" is ignored by Outlook for Windows (Word rendering engine) — this layout will break for Outlook recipients.
```

## What it checks

| Rule | Catches | Default |
|---|---|---|
| `outlook_css` | CSS that Outlook for Windows silently ignores (flex, grid, position, border-radius, shadows, …) — layout collapses for every Outlook recipient | fail |
| `gmail_clip` | HTML over ~102 KB, which Gmail clips behind "[Message clipped]", hiding everything past the cut | warn |
| `blank_variables` | Unrendered `{{ }}`, `${ }`, `<% %>` expressions, and literal `undefined` / `[object Object]` values that reached the output | fail |
| `staging_links` | Links to staging/dev/localhost/tunnel hosts, bare IPs — and, once you set your production domain, any link to an unexpected host | fail |
| `dark_mode` | Hard-coded light-theme colours with no `prefers-color-scheme: dark` handling — dark text on a darkened background | warn |
| `insecure_links` | Plain `http://` links | warn |
| `image_alt` | `<img>` without `alt` — an empty box wherever images are blocked, which is Outlook's default | warn |

Every rule's severity is configurable per project: `fail`, `warn`, or `off`. Full details in [docs/RULES.md](docs/RULES.md).

The rule set is deliberately conservative: a finding must name a concrete, documented failure in a real email client. No style opinions. A checker that cries wolf gets uninstalled, so precision beats coverage here.

## Quick start (GitHub Action)

1. Render your email templates to HTML in CI, with test data — the same way you'd preview them. Preflight checks the **rendered** output, because that's what your customers receive.
2. Copy [`examples/mailcheck.yml`](examples/mailcheck.yml) to your repo root as `mailcheck.yml` and set three things: where the rendered templates live, your production domain, and any legitimate third-party domains your email links to.
3. Add the action (see [`examples/workflow.yml`](examples/workflow.yml)):

```yaml
- uses: CoolGlasses/email-preflight@v1
```

Findings appear as annotations on the pull request and in the job summary. Fail-severity findings block the merge, exactly like a failing test.

## Or run it locally / anywhere

No dependencies — just Node 18+.

```bash
git clone https://github.com/CoolGlasses/email-preflight
cd email-preflight
node src/cli.js --path path/to/rendered-emails
node src/cli.js --config mailcheck.yml --format json
```

Exit codes: `0` clean (warnings allowed), `1` fail-severity findings, `2` config/usage error.

## Configuration

A typical config is a dozen lines — where the templates are, what your production domain is, which rules block. See [`examples/mailcheck.yml`](examples/mailcheck.yml) and the full reference in [docs/CONFIG.md](docs/CONFIG.md).

## What this is not

- **Not a screenshot service.** It doesn't render your email in 40 clients; it statically checks the HTML for the failures that are knowable from the code. (If you need pixel previews at enterprise scale, that's Litmus or Email on Acid — priced accordingly.)
- **Not a marketing-email tool.** It's built for transactional templates that live in a codebase — password resets, receipts, OTPs, notifications — checked the way code is checked.
- **Not a data collector.** The check runs inside your own CI, on your own runners. Your templates never leave your infrastructure.

## Development

```bash
npm test   # fixture-based suite: broken templates must be caught, clean ones must pass untouched
```

## License

MIT — see [LICENSE](LICENSE).
