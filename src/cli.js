#!/usr/bin/env node
'use strict';
/*
 * email-preflight — pre-flight lint for transactional email templates.
 *
 * Usage:
 *   email-preflight [--config mailcheck.yml] [--path <templates>] [--format text|json]
 *
 * Exit codes: 0 = no fail-severity findings, 1 = at least one fail finding,
 *             2 = configuration / usage error.
 * In GitHub Actions it also emits ::error / ::warning annotations so findings
 * land directly on the pull request, and appends a summary to the job summary.
 */
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');
const { runCheck } = require('./check');

function parseArgs(argv) {
  const args = { config: null, path: null, format: 'text' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.config = argv[++i];
    else if (a === '--path') args.path = argv[++i];
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('--') && !args.path && /\.(html?|mjml|hbs|handlebars|ejs|liquid|erb)$/i.test(a)) args.path = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

const HELP = `email-preflight — catch broken transactional email before it ships.

Usage:
  email-preflight [--config <file>] [--path <dir|file|glob>] [--format text|json]

Options:
  --config   Config file (default: ./mailcheck.yml if present)
  --path     Templates to check; overrides the config's templates: setting.
             A directory, a single file, or a glob like "src/emails/**"
  --format   text (default) or json

Exit codes: 0 clean (warnings allowed), 1 fail-severity findings, 2 usage/config error.
Docs: https://github.com/CoolGlasses/email-preflight
`;

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (args.help) { console.log(HELP); process.exit(0); }

  const cwd = process.cwd();
  let configPath = args.config;
  if (!configPath && fs.existsSync(path.join(cwd, 'mailcheck.yml'))) {
    configPath = path.join(cwd, 'mailcheck.yml');
  }
  let cfg;
  try {
    cfg = loadConfig(configPath, { templates: args.path });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  const { files, findings } = runCheck(cfg, cwd);
  if (files.length === 0) {
    console.error(`Error: no template files matched "${cfg.templates}". Check the path in your config.`);
    process.exit(2);
  }

  const fails = findings.filter((f) => f.severity === 'fail');
  const warns = findings.filter((f) => f.severity === 'warn');

  if (args.format === 'json') {
    console.log(JSON.stringify({ filesChecked: files.length, findings, summary: { fail: fails.length, warn: warns.length } }, null, 2));
  } else {
    if (findings.length === 0) {
      console.log(`✓ email-preflight: ${files.length} template(s) checked, no problems found.`);
    } else {
      const byFile = new Map();
      for (const f of findings) {
        if (!byFile.has(f.file)) byFile.set(f.file, []);
        byFile.get(f.file).push(f);
      }
      for (const [file, list] of byFile) {
        console.log(`\n${file}`);
        for (const f of list) {
          const tag = f.severity === 'fail' ? 'FAIL' : 'WARN';
          console.log(`  line ${f.line}  [${tag}] ${f.rule}: ${f.message}`);
        }
      }
      console.log(`\nemail-preflight: ${files.length} template(s) checked — ${fails.length} failure(s), ${warns.length} warning(s).`);
    }
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    // Annotations go to stdout, so JSON mode must skip them: stdout stays
    // pure JSON for machine consumers (tests caught this in CI).
    if (args.format !== 'json') {
      for (const f of findings) {
        const level = f.severity === 'fail' ? 'error' : 'warning';
        console.log(`::${level} file=${f.file},line=${f.line},title=${f.rule}::${f.message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
      }
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = [
        `## email-preflight`,
        ``,
        `${files.length} template(s) checked — **${fails.length} failure(s)**, ${warns.length} warning(s).`,
        ``,
      ];
      if (findings.length) {
        lines.push(`| File | Line | Severity | Rule | Finding |`, `|---|---|---|---|---|`);
        for (const f of findings) lines.push(`| ${f.file} | ${f.line} | ${f.severity} | ${f.rule} | ${f.message.replace(/\|/g, '\\|')} |`);
      }
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    }
  }

  process.exit(fails.length > 0 ? 1 : 0);
}

main();
