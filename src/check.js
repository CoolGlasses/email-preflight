'use strict';
const fs = require('fs');
const path = require('path');
const { RULES } = require('./rules');

const TEMPLATE_EXTS = ['.html', '.htm', '.mjml', '.hbs', '.handlebars', '.ejs', '.liquid', '.erb'];

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // ** crosses directories; consume an optional following /
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$');
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, out);
    } else if (TEMPLATE_EXTS.includes(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

/* Resolve the config's "templates" value into a concrete file list.
 * Accepts: a single file, a directory (walked), or a glob with * / **.  */
function resolveTemplates(templates, cwd) {
  const target = path.resolve(cwd, templates);
  if (fs.existsSync(target)) {
    const stat = fs.statSync(target);
    if (stat.isFile()) return [target];
    if (stat.isDirectory()) return walk(target, []).sort();
  }
  if (/[*?]/.test(templates)) {
    // Find the static prefix before the first wildcard segment, walk from
    // there, and match the whole path against the glob.
    const parts = templates.split('/');
    let staticParts = [];
    for (const p of parts) {
      if (/[*?]/.test(p)) break;
      staticParts.push(p);
    }
    let base = staticParts.join('/') || '.';
    const baseAbs = path.resolve(cwd, base);
    if (!fs.existsSync(baseAbs)) return [];
    const all = walk(baseAbs, []);
    const re = globToRegex(path.resolve(cwd, templates).split(path.sep).join('/'));
    return all.filter((f) => re.test(f.split(path.sep).join('/'))).sort();
  }
  return [];
}

function isIgnored(relPath, ruleId, ignoreList) {
  for (const entry of ignoreList || []) {
    const idx = String(entry).lastIndexOf(':');
    if (idx === -1) continue;
    const pattern = String(entry).slice(0, idx);
    const rule = String(entry).slice(idx + 1).trim();
    if (rule !== ruleId) continue;
    if (relPath.includes(pattern)) return true;
    if (/[*?]/.test(pattern) && globToRegex(pattern).test(relPath)) return true;
  }
  return false;
}

function checkFile(filePath, cfg, cwd) {
  const content = fs.readFileSync(filePath, 'utf8');
  const byteSize = Buffer.byteLength(content, 'utf8');
  const relPath = path.relative(cwd, filePath).split(path.sep).join('/');
  const findings = [];
  for (const [ruleId, fn] of Object.entries(RULES)) {
    const severity = cfg.rules[ruleId];
    if (!severity || severity === 'off') continue;
    let raw;
    try {
      raw = fn(content, cfg, byteSize);
    } catch (err) {
      raw = [{ rule: ruleId, line: 1, message: `Rule error: ${err.message}` }];
    }
    for (const f of raw) {
      // A rule function may emit findings for a sibling rule id (the
      // Outlook checker emits outlook_cosmetic alongside outlook_css);
      // severity and ignores apply per emitted rule, not per function.
      const emittedRule = f.rule || ruleId;
      const emittedSeverity = cfg.rules[emittedRule];
      if (!emittedSeverity || emittedSeverity === 'off') continue;
      if (isIgnored(relPath, emittedRule, cfg.ignore)) continue;
      findings.push({ file: relPath, rule: emittedRule, severity: emittedSeverity, line: f.line, message: f.message });
    }
  }
  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return findings;
}

function runCheck(cfg, cwd) {
  const files = resolveTemplates(cfg.templates, cwd);
  const all = [];
  for (const f of files) all.push(...checkFile(f, cfg, cwd));
  return { files, findings: all };
}

module.exports = { runCheck, resolveTemplates, globToRegex, isIgnored };
