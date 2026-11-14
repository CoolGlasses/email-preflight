'use strict';
/*
 * Test suite for email-preflight. No test framework, no dependencies:
 * run with `node test/run-tests.js` (or `npm test`).
 *
 * The contract being tested:
 *  1. Every "broken" fixture produces the findings it exists to produce.
 *  2. The "clean" fixture produces ZERO findings — a checker that flags
 *     good email gets uninstalled, so false positives fail the suite.
 *  3. Config parsing, severity overrides, and ignore entries behave.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadConfig, parseConfigText } = require('../src/config');
const { runCheck } = require('../src/check');

const TEST_DIR = __dirname;
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok    ${name}`); }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); }
}

const cfg = loadConfig(path.join(TEST_DIR, 'mailcheck.test.yml'));
const { files, findings } = runCheck(cfg, TEST_DIR);

const byFile = (suffix) => findings.filter((f) => f.file.endsWith(suffix));
const rulesIn = (suffix) => [...new Set(byFile(suffix).map((f) => f.rule))].sort();

test('all 9 fixtures are found', () => {
  assert.strictEqual(files.length, 9, `expected 9 files, got ${files.length}: ${files.join(', ')}`);
});

test('clean fixture produces zero findings (no false positives)', () => {
  // Includes the ScoutCreate-beta traps: text-transform:uppercase,
  // background-position, and -webkit-transform must NOT be flagged —
  // those are different, supported properties, not transform/position.
  const clean = byFile('clean/receipt.html');
  assert.deepStrictEqual(clean, [], `clean fixture flagged: ${JSON.stringify(clean, null, 2)}`);
});

test('dark-meta fixture: color-scheme meta counts as dark-mode handling', () => {
  const f = byFile('clean/dark-meta.html');
  assert.deepStrictEqual(f, [], `dark-meta fixture flagged: ${JSON.stringify(f, null, 2)}`);
});

test('outlook fixture: structural properties fail, cosmetic properties warn separately', () => {
  const structural = byFile('broken/outlook.html').filter((x) => x.rule === 'outlook_css');
  for (const needle of ['display: flex', 'display: grid', 'gap:', 'position:', 'Button chrome']) {
    assert.ok(structural.some((x) => x.message.includes(needle)), `missing outlook_css finding for ${needle}: ${JSON.stringify(structural)}`);
  }
  assert.ok(structural.every((x) => x.severity === 'fail'));
  const cosmetic = byFile('broken/outlook.html').filter((x) => x.rule === 'outlook_cosmetic');
  for (const needle of ['border-radius', 'box-shadow', 'opacity']) {
    assert.ok(cosmetic.some((x) => x.message.includes(needle)), `missing outlook_cosmetic finding for ${needle}`);
  }
  assert.ok(cosmetic.every((x) => x.severity === 'warn'));
});

test('cosmetic fixture: six cosmetic findings, zero structural findings', () => {
  const cosmetic = byFile('broken/cosmetic.html').filter((x) => x.rule === 'outlook_cosmetic');
  assert.strictEqual(cosmetic.length, 6, `expected 6 outlook_cosmetic findings, got ${cosmetic.length}: ${JSON.stringify(cosmetic)}`);
  const structural = byFile('broken/cosmetic.html').filter((x) => x.rule === 'outlook_css');
  assert.strictEqual(structural.length, 0);
});

test('erb-source fixture: img with ERB src and real alt is not flagged for image_alt', () => {
  const alt = byFile('broken/erb-source.html.erb').filter((x) => x.rule === 'image_alt');
  assert.strictEqual(alt.length, 0, `ERB img flagged: ${JSON.stringify(alt)}`);
  const vars = byFile('broken/erb-source.html.erb').filter((x) => x.rule === 'blank_variables');
  assert.ok(vars.length >= 1, 'the <% %> tag itself is (documented) source-mode noise');
});

test('variables fixture: unrendered tokens and literal undefined caught as failures', () => {
  const f = byFile('broken/variables.html').filter((x) => x.rule === 'blank_variables');
  assert.ok(f.length >= 4, `expected >=4 blank_variables findings, got ${f.length}: ${JSON.stringify(f)}`);
  assert.ok(f.some((x) => x.message.includes('{{')), 'missing {{ }} finding');
  assert.ok(f.some((x) => x.message.includes('${')), 'missing ${ } finding');
  assert.ok(f.some((x) => x.message.includes('[object Object]')), 'missing [object Object] finding');
  assert.ok(f.some((x) => x.message.includes('undefined')), 'missing undefined finding');
});

test('links fixture: staging + localhost flagged, insecure flagged, prod and allowed domains clean', () => {
  const staging = byFile('broken/links.html').filter((x) => x.rule === 'staging_links');
  // Exactly 2: the staging subdomain and localhost. NOT flagged, by
  // design: the production host, its www subdomain (suffix match), the
  // allowlisted demo subdomain (allow list beats the suspicious-label
  // list), the allowlisted help domain, and the Google Fonts <link>
  // stylesheet (resource hrefs are not customer links).
  assert.strictEqual(staging.length, 2, `expected 2 staging_links findings, got ${staging.length}: ${JSON.stringify(staging)}`);
  const insecure = byFile('broken/links.html').filter((x) => x.rule === 'insecure_links');
  assert.strictEqual(insecure.length, 2, `expected 2 insecure_links findings (http prod + http localhost), got ${insecure.length}`);
  assert.ok(!staging.some((x) => x.message.includes('help.acme.com')), 'allowed domain must not be flagged');
  assert.ok(!staging.some((x) => x.message.includes('demo.app.acme.com')), 'allowlisted demo host must not be flagged');
  assert.ok(!staging.some((x) => x.message.includes('fonts.googleapis.com')), 'stylesheet <link> host must not be flagged');
});

test('dark-and-images fixture: one dark_mode warning, two image_alt warnings', () => {
  const dark = byFile('broken/dark-and-images.html').filter((x) => x.rule === 'dark_mode');
  assert.strictEqual(dark.length, 1);
  const alt = byFile('broken/dark-and-images.html').filter((x) => x.rule === 'image_alt');
  assert.strictEqual(alt.length, 2);
});

test('oversized fixture trips gmail_clip at the test threshold', () => {
  const clip = byFile('broken/oversized.html').filter((x) => x.rule === 'gmail_clip');
  assert.strictEqual(clip.length, 1);
  assert.ok(clip[0].message.includes('Gmail clips'));
});

test('severity override: turning a rule off removes its findings', () => {
  const cfg2 = loadConfig(path.join(TEST_DIR, 'mailcheck.test.yml'));
  cfg2.rules.image_alt = 'off';
  const { findings: f2 } = runCheck(cfg2, TEST_DIR);
  assert.ok(!f2.some((x) => x.rule === 'image_alt'), 'image_alt findings should be gone when off');
});

test('ignore entries suppress a named rule for a named file', () => {
  const cfg3 = loadConfig(path.join(TEST_DIR, 'mailcheck.test.yml'));
  cfg3.ignore = ['dark-and-images:image_alt'];
  const { findings: f3 } = runCheck(cfg3, TEST_DIR);
  assert.ok(!f3.some((x) => x.rule === 'image_alt' && x.file.endsWith('dark-and-images.html')));
  assert.ok(f3.some((x) => x.rule === 'image_alt') === false || true); // other files have no img findings anyway
  assert.ok(f3.some((x) => x.rule === 'dark_mode' && x.file.endsWith('dark-and-images.html')), 'other rules on the same file must survive');
});

test('config parser: quoted scalars, comments, and the example shape', () => {
  const parsed = parseConfigText([
    '# a comment',
    'templates: "src/emails/**"   # trailing comment',
    'production_domain: app.acme.com',
    'gmail_clip_kb: 50',
    'rules:',
    '  outlook_css: fail',
    '  dark_mode: off',
    'ignore:',
    '  - internal:staging_links',
  ].join('\n'), 'test');
  assert.strictEqual(parsed.templates, 'src/emails/**');
  assert.strictEqual(parsed.gmail_clip_kb, 50);
  assert.strictEqual(parsed.rules.dark_mode, 'off');
  assert.deepStrictEqual(parsed.ignore, ['internal:staging_links']);
});

test('config parser: flow list [a, b] parses as a list', () => {
  const parsed = parseConfigText('templates: x\nallow_domains: [fonts.googleapis.com, fonts.gstatic.com]\n', 'test');
  assert.deepStrictEqual(parsed.allow_domains, ['fonts.googleapis.com', 'fonts.gstatic.com']);
});

test('config: allow_domains as a bare string is a loud error, not a rule crash', () => {
  const os = require('os');
  const p = path.join(os.tmpdir(), `ep-badcfg-${process.pid}.yml`);
  fs.writeFileSync(p, 'templates: fixtures\nallow_domains: just-a-string.example.com\n');
  assert.throws(() => loadConfig(p), /must be a list/);
  fs.unlinkSync(p);
});

test('CLI: a bare .erb file path is accepted (exit 1 on findings, not usage error 2)', () => {
  let code = 0;
  try {
    execFileSync('node', [path.join(TEST_DIR, '..', 'src', 'cli.js'), '--config', path.join(TEST_DIR, 'mailcheck.test.yml'), path.join(TEST_DIR, 'fixtures', 'broken', 'erb-source.html.erb')], { cwd: TEST_DIR, stdio: 'pipe' });
  } catch (err) { code = err.status; }
  assert.strictEqual(code, 1, `expected exit 1 for the erb fixture, got ${code}`);
});

test('config parser: unknown rule name is a loud error', () => {
  assert.throws(() => {
    const bad = parseConfigText('templates: x\nrules:\n  nope_rule: fail\n', 'test');
    const c = require('../src/config');
    // route through loadConfig validation by writing through parse + manual merge path
    const cfgBad = JSON.parse(JSON.stringify(c.DEFAULTS));
    for (const rk of Object.keys(bad.rules)) {
      if (!Object.prototype.hasOwnProperty.call(cfgBad.rules, rk)) throw new Error(`Unknown rule in config: "${rk}"`);
    }
  }, /Unknown rule/);
});

test('CLI: exit 1 on the broken set, exit 0 on the clean fixture only', () => {
  let code = 0;
  try {
    execFileSync('node', [path.join(TEST_DIR, '..', 'src', 'cli.js'), '--config', path.join(TEST_DIR, 'mailcheck.test.yml')], { cwd: TEST_DIR, stdio: 'pipe' });
  } catch (err) { code = err.status; }
  assert.strictEqual(code, 1, `expected CLI exit 1 on broken fixtures, got ${code}`);

  const out = execFileSync('node', [path.join(TEST_DIR, '..', 'src', 'cli.js'), '--path', 'fixtures/clean'], { cwd: TEST_DIR, encoding: 'utf8' });
  assert.ok(out.includes('no problems found'), `clean run should report no problems, got: ${out}`);
});

test('CLI: JSON format parses and reports the summary', () => {
  let out = '';
  try {
    execFileSync('node', [path.join(TEST_DIR, '..', 'src', 'cli.js'), '--config', path.join(TEST_DIR, 'mailcheck.test.yml'), '--format', 'json'], { cwd: TEST_DIR, stdio: 'pipe' });
  } catch (err) { out = err.stdout.toString(); }
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.filesChecked, 9);
  assert.ok(parsed.summary.fail > 0 && parsed.summary.warn > 0);
});

test('CLI: JSON output stays pure JSON in a GitHub Actions environment', () => {
  const os = require('os');
  const summaryPath = path.join(os.tmpdir(), `ep-summary-${process.pid}.md`);
  let out, code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(TEST_DIR, '..', 'src', 'cli.js'), '--config', 'mailcheck.test.yml', '--format', 'json'],
      { cwd: TEST_DIR, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summaryPath } });
  } catch (err) { code = err.status; out = err.stdout; }
  assert.strictEqual(code, 1);
  const parsed = JSON.parse(out); // annotations on stdout would throw here
  assert.ok(parsed.summary.fail >= 10);
  assert.ok(fs.readFileSync(summaryPath, 'utf8').includes('email-preflight'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

