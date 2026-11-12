# Rules reference

Every rule checks **rendered** email HTML. Severity for each rule is set in
`mailcheck.yml` (`fail` / `warn` / `off`) — the defaults below are the
out-of-box behaviour. A rule only exists in this list if its finding names a
concrete, documented failure in a real email client.

---

## outlook_css — default: fail

Outlook for Windows (desktop) renders HTML email with Microsoft Word's
rendering engine. Word silently drops a set of now-standard CSS, so a layout
that is fine in every other client collapses for Outlook recipients:

- `display: flex`, `display: inline-flex`
- `display: grid`, `display: inline-grid`
- `position:` (any value)
- `float:`
- `gap:`
- `border-radius`, `box-shadow`, `text-shadow`
- `opacity`
- `transform`, `transition`, `animation`
- `linear-gradient()`
- `background-size`

Findings report the property and the line. The fix is structural: use
table-based layout for anything load-bearing, and treat modern CSS as
progressive enhancement only, behind Outlook conditional comments if needed.

## gmail_clip — default: warn

Gmail clips messages whose HTML exceeds ~102 KB. Recipients see
"[Message clipped] View entire message" and everything after the cut —
commonly the footer, the legal text, or a secondary call to action — is
hidden behind a click most people never make.

The threshold is configurable (`gmail_clip_kb`) if you want an earlier
warning than Gmail's real limit. The finding reports the template's actual
size. Common causes: inlined base64 images, repeated un-minified blocks,
and generated markup with heavy inline styles on every element.

## blank_variables — default: fail

Two failure shapes, both of which mean a variable reached a customer
unfilled:

1. **Raw template syntax in the output** — `{{ name }}`, `${name}`,
   `<% … %>`. The template engine never ran on this file, ran on the wrong
   file, or failed on this expression. This is why preflight checks
   *rendered* HTML: in rendered output, template syntax is never correct.
2. **Literal engine values in the text** — `undefined` in value position
   ("Hi undefined,"), `[object Object]`, a standalone `NaN`. The engine
   ran, but the data wasn't there.

Deliberately *not* flagged: the word "undefined" in ordinary prose (e.g. a
sentence in your documentation-style footer), and other engines' syntaxes
not listed above. Precision over coverage.

## staging_links — default: fail

A link to a non-production environment in a live email sends customers to a
server that does not know them — the reset link 404s, or worse, works
against test data. Flagged hosts:

- `localhost`, `127.0.0.1`, other bare IP hosts, `*.local`
- Tunnel domains (`ngrok.io`, `ngrok-free.app`, `trycloudflare.com`,
  `loca.lt`, `localtunnel.me`)
- Hosts with a non-production label: `staging.`, `dev.`, `test.`, `qa.`,
  `uat.`, `sandbox.`, `preview.`, `demo.`, or a leading `staging-` /
  `dev-` / `test-` style label

When `production_domain` is set in the config, the check extends: **any**
absolute link whose host is neither the production domain nor listed in
`allow_domains` is flagged. That is the version of this rule that catches
the classic incident — a `staging.app.example.com` link is only the
obvious case; a forgotten `app-v2.example.net` or an engineer's personal
deployment is the quiet one.

Non-HTTP links (`mailto:`, `tel:`, `#anchors`, template-generated URLs that
don't begin with `http`) are skipped.

## dark_mode — default: warn

Apple Mail, Outlook, and Gmail apps apply dark-mode transformations:
inverting or force-darkening backgrounds. An email that hard-codes a light
background (`#ffffff`) and dark text with **no**
`@media (prefers-color-scheme: dark)` handling anywhere in the file
commonly renders as dark text on a darkened background — unreadable.

This rule fires at most once per file, and only when explicit light-theme
colours are present *and* dark-mode handling is absent. It is a prompt to
make a decision (add dark rules, or choose colours that survive
inversion), not a claim that the email is certainly broken in every client.

## insecure_links — default: warn

`http://` links in email are blocked or downgraded by several clients and
expose the click — including any token in the URL — in plain text. Use
`https://` for everything customer-facing.

## image_alt — default: warn

An `<img>` without an `alt` attribute renders as an unexplained empty box
wherever images are blocked by default (Outlook on Windows, many corporate
setups) and is skipped entirely by screen readers. If the image carries
meaning — a chart, a logo that is also a link, a product photo — it needs
alt text. Purely decorative images should carry an explicit empty `alt=""`,
which this rule accepts.
