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
- `transform`, `transition`, `animation`
- Button chrome on an `<a>` tag: `padding` or `display: inline-block` in an
  anchor's style. Outlook ignores both on anchors, so a styled
  call-to-action renders as an unpadded link — white button text can land
  on a white card. Put `bgcolor` and padding on a surrounding `<td>` and
  keep the anchor as plain text.

Property matching is exact: hyphenated properties are different properties.
`text-transform`, `background-position`, `column-gap`, and
`-webkit-transform` are **not** flagged — they are not the properties above.

Findings report the property and the line. The fix is structural: use
table-based layout for anything load-bearing, and treat modern CSS as
progressive enhancement only, behind Outlook conditional comments if needed.

## outlook_cosmetic — default: warn

The other half of Outlook's ignored list — properties whose loss degrades
the email gracefully instead of breaking it:

- `border-radius`, `box-shadow`, `text-shadow`
- `opacity`
- `linear-gradient()`
- `background-size`

Outlook drops these and the layout stays intact (square corners, full
opacity). They warn by default rather than fail: blocking a merge over
square corners is how a checker gets switched off.

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

Details that matter:

- Matching is by host suffix on a dot boundary: with
  `production_domain: example.com`, links to `www.example.com` count as
  production. A suspicious label still flags (`staging.example.com`).
- `allow_domains` wins over everything, including the label list:
  allowlisting `demo.example.com` exempts it. That is how you say "this
  one is intended."
- Only `<a href>` links are checked — the destinations a customer can
  click. `<link>` resource hrefs (stylesheets, preconnects) are not
  destinations and are never flagged by this rule.

Non-HTTP links (`mailto:`, `tel:`, `#anchors`, template-generated URLs that
don't begin with `http`) are skipped.

## dark_mode — default: warn

Apple Mail, Outlook, and Gmail apps apply dark-mode transformations:
inverting or force-darkening backgrounds. An email that hard-codes a light
background (`#ffffff`) and dark text with **no** dark-mode handling
anywhere in the file commonly renders as dark text on a darkened
background — unreadable.

"Handling" means any of: an `@media (prefers-color-scheme: dark)` block, or
a `<meta name="color-scheme">` / `<meta name="supported-color-schemes">`
declaration (the `light only` opt-out is a legitimate strategy).

This rule fires at most once per file, and only when explicit light-theme
colours are present *and* dark-mode handling is absent. It is a prompt to
make a decision (add dark rules, declare a color-scheme meta, or choose
colours that survive inversion), not a claim that the email is certainly
broken in every client.

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
