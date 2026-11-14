'use strict';
/*
 * Minimal YAML-subset parser for the email-preflight config schema.
 * Supports exactly what the documented config format uses:
 *   - top-level scalar keys:            key: value
 *   - one nested map (rules:):            subkey: value   (indented)
 *   - scalar lists (ignore:, allow_domains:):
 *       - item
 *   - comments (# ...) and blank lines, quoted or bare scalars.
 * Anything outside that subset throws with the line number, so a
 * malformed config fails loudly instead of being silently misread.
 */
const fs = require('fs');

const DEFAULTS = {
  templates: null, // REQUIRED unless --path is given: glob/dir of templates
  production_domain: null,
  gmail_clip_kb: 102,
  rules: {
    outlook_css: 'fail',
    outlook_cosmetic: 'warn',
    gmail_clip: 'warn',
    blank_variables: 'fail',
    staging_links: 'fail',
    dark_mode: 'warn',
    insecure_links: 'warn',
    image_alt: 'warn',
  },
  allow_domains: [],
  ignore: [], // entries of the form "path-substring-or-glob:rule_id"
};

const SEVERITIES = ['fail', 'warn', 'off'];

function stripComment(line) {
  let inSingle = false, inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    // Flow list: [a, b, c] — one-line equivalent of the "- item" form.
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((s) => parseScalar(s));
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function parseConfigText(text, sourceName) {
  const out = {};
  const lines = text.split(/\r?\n/);
  // parent: name of the last top-level key whose value is a block (map or list)
  let parent = null;
  for (let n = 0; n < lines.length; n++) {
    const line = stripComment(lines[n]);
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    const body = line.trim();

    if (body.startsWith('- ')) {
      if (parent === null) throw new Error(`${sourceName}:${n + 1}: list item with no parent key`);
      if (out[parent] === null) out[parent] = [];
      if (!Array.isArray(out[parent])) throw new Error(`${sourceName}:${n + 1}: list item under "${parent}", which is a map`);
      out[parent].push(parseScalar(body.slice(2)));
      continue;
    }
    const m = body.match(/^([A-Za-z_][A-Za-z0-9_]*):(.*)$/);
    if (!m) throw new Error(`${sourceName}:${n + 1}: cannot parse line: ${lines[n].trim()}`);
    const [, key, rest] = m;
    const value = rest.trim();
    if (indent > 0) {
      if (parent === null) throw new Error(`${sourceName}:${n + 1}: indented key "${key}" has no parent`);
      if (out[parent] === null) out[parent] = {};
      if (Array.isArray(out[parent])) throw new Error(`${sourceName}:${n + 1}: map entry under "${parent}", which is a list`);
      out[parent][key] = parseScalar(value);
    } else if (value === '') {
      out[key] = null; // block parent; first child decides map vs list
      parent = key;
    } else {
      out[key] = parseScalar(value);
      parent = null;
    }
  }
  for (const k of Object.keys(out)) if (out[k] === null) out[k] = {};
  return out;
}

function loadConfig(configPath, overrides = {}) {
  let parsed = {};
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    parsed = parseConfigText(fs.readFileSync(configPath, 'utf8'), configPath);
  }
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  for (const [k, v] of Object.entries(parsed)) {
    if (k === 'rules') {
      for (const [rk, rv] of Object.entries(v || {})) {
        if (!Object.prototype.hasOwnProperty.call(cfg.rules, rk)) {
          throw new Error(`Unknown rule in config: "${rk}". Known rules: ${Object.keys(cfg.rules).join(', ')}`);
        }
        if (!SEVERITIES.includes(rv)) {
          throw new Error(`Rule "${rk}" has invalid severity "${rv}" (use fail, warn, or off)`);
        }
        cfg.rules[rk] = rv;
      }
    } else if (Object.prototype.hasOwnProperty.call(cfg, k)) {
      cfg[k] = v;
    } else {
      throw new Error(`Unknown config key: "${k}". Known keys: ${Object.keys(cfg).join(', ')}`);
    }
  }
  if (overrides.templates) cfg.templates = overrides.templates;
  if (!cfg.templates) {
    throw new Error('No templates to check: set "templates:" in the config file or pass --path.');
  }
  // Type-check the merged config. A config that parses to the wrong
  // SHAPE (e.g. allow_domains as a bare string) must fail here, loudly,
  // at load time — 0.1.0 let one through and a rule crashed mid-run,
  // surfacing as a "Rule error" finding instead of a config error.
  if (typeof cfg.templates !== 'string') {
    throw new Error('"templates" must be a single path or glob string');
  }
  if (cfg.production_domain !== null && typeof cfg.production_domain !== 'string') {
    throw new Error('"production_domain" must be a string');
  }
  for (const listKey of ['allow_domains', 'ignore']) {
    if (!Array.isArray(cfg[listKey]) || cfg[listKey].some((v) => typeof v !== 'string')) {
      throw new Error(`"${listKey}" must be a list of strings — use "- item" lines or the [a, b] form`);
    }
  }
  if (typeof cfg.gmail_clip_kb !== 'number' || cfg.gmail_clip_kb <= 0) {
    throw new Error('gmail_clip_kb must be a positive number');
  }
  return cfg;
}

module.exports = { loadConfig, parseConfigText, DEFAULTS };
