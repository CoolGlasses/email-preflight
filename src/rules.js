'use strict';
/*
 * The rule set. Every rule is a pure function of (content, cfg) returning
 * findings: { rule, line, message }. Severity is applied later from config,
 * so rules themselves never decide how serious they are.
 *
 * Design rule for this project: a finding must name a concrete, documented
 * failure in a real email client — no style preferences, no guesses.
 * A checker that cries wolf gets uninstalled; precision beats coverage.
 */

function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) if (content[i] === '\n') line++;
  return line;
}

/* ---------- outlook_css ----------
 * Outlook for Windows renders HTML email with Microsoft Word's engine.
 * It silently drops the CSS below (flex/grid layouts collapse into a
 * stacked pile, border-radius and shadows vanish, positioned elements
 * land in the wrong place). Nothing errors anywhere — the email just
 * arrives broken for every Outlook-on-Windows recipient.
 */
const OUTLOOK_UNSUPPORTED = [
  { re: /display\s*:\s*(inline-)?flex\b/i, name: 'display: flex' },
  { re: /display\s*:\s*(inline-)?grid\b/i, name: 'display: grid' },
  { re: /\bposition\s*:/i, name: 'position:' },
  { re: /\bfloat\s*:/i, name: 'float:' },
  { re: /\bgap\s*:/i, name: 'gap:' },
  { re: /\bborder-radius\s*:/i, name: 'border-radius' },
  { re: /\bbox-shadow\s*:/i, name: 'box-shadow' },
  { re: /\btext-shadow\s*:/i, name: 'text-shadow' },
  { re: /\bopacity\s*:/i, name: 'opacity' },
  { re: /\btransform\s*:/i, name: 'transform' },
  { re: /\btransition\s*:/i, name: 'transition' },
  { re: /\banimation\s*:/i, name: 'animation' },
  { re: /linear-gradient\s*\(/i, name: 'linear-gradient()' },
  { re: /\bbackground-size\s*:/i, name: 'background-size' },
];

function cssRegions(content) {
  // Yields { text, offset } for every <style> block and style="..." attribute.
  const regions = [];
  const styleBlock = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleBlock.exec(content)) !== null) {
    regions.push({ text: m[1], offset: m.index + m[0].indexOf(m[1]) });
  }
  const styleAttr = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/gi;
  while ((m = styleAttr.exec(content)) !== null) {
    const val = m[1] !== undefined ? m[1] : m[2];
    regions.push({ text: val, offset: m.index + m[0].indexOf(val) });
  }
  return regions;
}

function ruleOutlookCss(content) {
  const findings = [];
  for (const region of cssRegions(content)) {
    for (const item of OUTLOOK_UNSUPPORTED) {
      const re = new RegExp(item.re.source, 'gi');
      let m;
      while ((m = re.exec(region.text)) !== null) {
        findings.push({
          rule: 'outlook_css',
          line: lineOf(content, region.offset + m.index),
          message: `"${item.name}" is ignored by Outlook for Windows (Word rendering engine) — this layout will break for Outlook recipients. Use table-based layout for anything structural.`,
        });
      }
    }
  }
  return findings;
}

/* ---------- gmail_clip ----------
 * Gmail clips messages whose HTML exceeds ~102 KB: the recipient sees
 * "[Message clipped] View entire message" and everything past the cut —
 * often the footer, the unsubscribe line, or the call to action — is
 * hidden behind a click most people never make.
 */
function ruleGmailClip(content, cfg, byteSize) {
  const limit = cfg.gmail_clip_kb * 1024;
  if (byteSize > limit) {
    return [{
      rule: 'gmail_clip',
      line: 1,
      message: `Template is ${(byteSize / 1024).toFixed(1)} KB of HTML; Gmail clips messages over ~${cfg.gmail_clip_kb} KB ("[Message clipped]"), hiding everything past the cut. Trim markup, inline assets, or repeated blocks.`,
    }];
  }
  return [];
}

/* ---------- blank_variables ----------
 * Two ways a variable reaches a customer unfilled:
 *  1. Raw template syntax survives into sent HTML (the template engine
 *     never ran, or ran on the wrong file): {{ name }}, ${name}, <%= %>.
 *  2. The engine ran but the value was empty, producing the literal text
 *     "undefined", "NaN", or "[object Object]" in the message body.
 * Only unambiguous engine syntaxes and standalone value-shaped tokens are
 * flagged, to keep false positives at zero: prose that merely contains
 * the word "undefined" in a sentence is not flagged.
 */
const TEMPLATE_TOKENS = [
  { re: /\{\{\s*[^}]{1,80}\}\}/g, name: 'unrendered {{ }} template expression' },
  { re: /\$\{[^}]{1,80}\}/g, name: 'unrendered ${ } template expression' },
  { re: /<%[\s\S]{1,80}?%>/g, name: 'unrendered <% %> template tag' },
  { re: /\bundefined\s*[.,!]|^undefined\b|Hi,?\s+undefined\b|Hello,?\s+undefined\b|>\s*undefined\s*</gi, name: 'literal "undefined" value in message text' },
  { re: /\[object Object\]/g, name: 'literal "[object Object]" value in message text' },
  { re: />\s*NaN\s*</g, name: 'literal "NaN" value in message text' },
];

function ruleBlankVariables(content) {
  const findings = [];
  for (const item of TEMPLATE_TOKENS) {
    const re = new RegExp(item.re.source, item.re.flags);
    let m;
    while ((m = re.exec(content)) !== null) {
      findings.push({
        rule: 'blank_variables',
        line: lineOf(content, m.index),
        message: `${item.name}: "${m[0].trim().slice(0, 60)}" — a variable reached the output unfilled. Check the data passed to this template and the variable name.`,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return findings;
}

/* ---------- link extraction shared by the link rules ---------- */
function extractLinks(content) {
  const links = [];
  const re = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const url = m[1] !== undefined ? m[1] : m[2];
    links.push({ url, index: m.index });
  }
  return links;
}

function hostOf(url) {
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/* ---------- staging_links ----------
 * A link to a non-production environment in a live email sends customers
 * to a server that does not know them: their reset link 404s or points
 * at test data. Flagged: localhost, *.local, IP hosts, well-known tunnel
 * domains, hosts with a staging/dev/test/qa/uat subdomain or label, and —
 * when production_domain is configured — any absolute link to a different
 * host that is not on the allow list.
 */
const SUSPICIOUS_HOST = [
  { re: /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/, name: 'localhost' },
  { re: /\.local$/, name: '*.local address' },
  { re: /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/, name: 'bare IP address' },
  { re: /(ngrok\.io|ngrok-free\.app|trycloudflare\.com|loca\.lt|localtunnel\.me)$/, name: 'tunnel domain' },
  { re: /(^|\.)(staging|stage|dev|develop|test|testing|qa|uat|sandbox|preview|demo)\./, name: 'non-production subdomain' },
  { re: /^(staging|stage|dev|test|qa|uat|sandbox)[.-]/, name: 'non-production host label' },
];

function ruleStagingLinks(content, cfg) {
  const findings = [];
  for (const { url, index } of extractLinks(content)) {
    if (!/^https?:\/\//i.test(url)) continue; // mailto:, tel:, #anchors, template URLs
    const host = hostOf(url);
    if (!host) continue;
    const hostNoPort = host.split(':')[0];
    const suspicious = SUSPICIOUS_HOST.find((s) => s.re.test(hostNoPort));
    if (suspicious) {
      findings.push({
        rule: 'staging_links',
        line: lineOf(content, index),
        message: `Link points at a non-production host (${suspicious.name}): ${url.slice(0, 90)} — customers will land on a server that does not know them.`,
      });
      continue;
    }
    if (cfg.production_domain) {
      const prod = String(cfg.production_domain).toLowerCase();
      const allowed = (cfg.allow_domains || []).map((d) => String(d).toLowerCase());
      if (hostNoPort !== prod && !allowed.includes(hostNoPort)) {
        findings.push({
          rule: 'staging_links',
          line: lineOf(content, index),
          message: `Link host "${hostNoPort}" is not your production domain (${prod}) and is not in allow_domains: ${url.slice(0, 90)} — if this third-party link is intended, add the host to allow_domains.`,
        });
      }
    }
  }
  return findings;
}

/* ---------- insecure_links ----------
 * http:// links in email are downgraded or blocked by several clients and
 * leak the click (and any token in it) in plain text.
 */
function ruleInsecureLinks(content) {
  const findings = [];
  for (const { url, index } of extractLinks(content)) {
    if (/^http:\/\//i.test(url)) {
      findings.push({
        rule: 'insecure_links',
        line: lineOf(content, index),
        message: `Link uses plain http:// (not https): ${url.slice(0, 90)} — some clients block or downgrade it, and any token in the URL travels unencrypted.`,
      });
    }
  }
  return findings;
}

/* ---------- dark_mode ----------
 * Apple Mail, Outlook, and Gmail invert or force-darken emails in dark
 * mode. An email that hard-codes a light background / dark text with no
 * prefers-color-scheme handling commonly renders as dark text on a
 * darkened background — unreadable. This rule fires once per file, only
 * when explicit light-theme colours are present AND no dark-mode media
 * query exists anywhere in the file.
 */
function ruleDarkMode(content) {
  const hasDarkHandling = /prefers-color-scheme\s*:\s*dark/i.test(content);
  if (hasDarkHandling) return [];
  const lightSignals = [
    /bgcolor\s*=\s*"#(fff|ffffff)"/i,
    /background(-color)?\s*:\s*(#fff\b|#ffffff\b|white\b)/i,
    /color\s*:\s*(#000\b|#000000\b|#111\b|#222\b|#333\b)/i,
  ];
  const hit = lightSignals.find((re) => re.test(content));
  if (!hit) return [];
  const idx = content.search(hit);
  return [{
    rule: 'dark_mode',
    line: lineOf(content, idx),
    message: 'Template hard-codes light-theme colours but has no @media (prefers-color-scheme: dark) handling — in dark mode several clients will render dark text on a darkened background. Add dark-mode rules or use colour values that survive inversion.',
  }];
}

/* ---------- image_alt ----------
 * Images without alt text show as blank boxes wherever images are blocked
 * (Outlook's default) and are invisible to screen readers.
 */
function ruleImageAlt(content) {
  const findings = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (!/\balt\s*=/i.test(m[0])) {
      const src = (m[0].match(/src\s*=\s*"([^"]*)"/i) || [])[1] || '';
      findings.push({
        rule: 'image_alt',
        line: lineOf(content, m.index),
        message: `<img> has no alt attribute${src ? ` (src: ${src.slice(0, 60)})` : ''} — where images are blocked (Outlook default) this is an empty box, and screen readers skip it.`,
      });
    }
  }
  return findings;
}

const RULES = {
  outlook_css: ruleOutlookCss,
  gmail_clip: ruleGmailClip,
  blank_variables: ruleBlankVariables,
  staging_links: ruleStagingLinks,
  insecure_links: ruleInsecureLinks,
  dark_mode: ruleDarkMode,
  image_alt: ruleImageAlt,
};

module.exports = { RULES, lineOf };
