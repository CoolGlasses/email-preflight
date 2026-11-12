# Configuration reference

Email Preflight reads `mailcheck.yml` from the working directory by
default, or the file given with `--config`. The format is a small,
deliberately boring subset of YAML: top-level keys, one nested map
(`rules:`), and simple lists. If a line can't be parsed, or a rule or key
name is unknown, the run stops with an error naming the line — a config is
never silently misread.

A complete annotated example lives in
[`examples/mailcheck.yml`](../examples/mailcheck.yml).

## Keys

### `templates` — required (or pass `--path`)

Where the **rendered** email HTML lives. Accepts:

- a directory — searched recursively for `.html`, `.htm`, `.mjml`, `.hbs`,
  `.handlebars`, `.ejs`, `.liquid`, `.erb` files
- a single file
- a glob, e.g. `"src/emails/**"` (`*` stays within a directory, `**`
  crosses directories)

### `production_domain` — optional, recommended

Your real production host, e.g. `app.example.com`. When set, the
`staging_links` rule flags any absolute link to a host that is neither this
domain nor in `allow_domains`.

### `allow_domains` — optional list

Hosts legitimately linked from your email (help centre, status page,
social profiles). Exempt from the production-domain check.

```yaml
allow_domains:
  - help.example.com
  - status.example.com
```

### `gmail_clip_kb` — optional, default `102`

The size in KB of HTML at which the `gmail_clip` rule fires. 102 is Gmail's
real clipping threshold; lower it only for an earlier warning.

### `rules` — optional map

Severity per rule: `fail` (blocks the run / the merge), `warn` (reported,
exit code stays 0), `off` (not checked). Any rule you don't mention keeps
its default. See [RULES.md](RULES.md) for what each rule checks and its
default.

```yaml
rules:
  outlook_css: fail
  dark_mode: off
```

Unknown rule names are a hard error — a typo must never silently disable a
check you think is running.

### `ignore` — optional list

Per-file exceptions, each in the form `path-part:rule_id`. The path part
matches as a substring of the file's path (or as a glob if it contains
`*`). Use sparingly: every entry is a place a real problem can hide later.

```yaml
ignore:
  - internal-report:staging_links
```

## Command-line interface

```text
email-preflight [--config <file>] [--path <dir|file|glob>] [--format text|json]
```

- `--config` — config file path. Default: `./mailcheck.yml` if present.
- `--path` — templates to check; overrides `templates:` in the config.
- `--format` — `text` (default) or `json` (machine-readable findings and
  summary counts).

Exit codes: `0` = no fail-severity findings, `1` = at least one
fail-severity finding, `2` = configuration or usage error.

## In GitHub Actions

When run under GitHub Actions the checker additionally emits `::error` /
`::warning` annotations (so findings appear on the pull request) and
appends a findings table to the job summary. No configuration is needed
for this; it's driven by the standard `GITHUB_ACTIONS` environment.
