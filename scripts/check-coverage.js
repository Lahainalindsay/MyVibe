#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

function pct(n) { return typeof n === 'number' ? n : Number(n || 0); }

function getTotals(summary) {
  // Istanbul writes coverage-summary.json with a top-level "total" key
  const totals = summary.total || summary.totals || summary;
  return {
    statements: pct(totals.statements && totals.statements.pct),
    branches: pct(totals.branches && totals.branches.pct),
    functions: pct(totals.functions && totals.functions.pct),
    lines: pct(totals.lines && totals.lines.pct),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const thresholds = {
    statements: Number(process.env.COV_STATEMENTS || args.statements || 80),
    branches: Number(process.env.COV_BRANCHES || args.branches || 70),
    functions: Number(process.env.COV_FUNCTIONS || args.functions || 75),
    lines: Number(process.env.COV_LINES || args.lines || 80),
  };

  // Optional per-file thresholds via coverage.config.json
  let perFile = {};
  const cfgPath = path.join(process.cwd(), 'coverage.config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      perFile = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
      console.warn('Warning: unable to parse coverage.config.json:', e.message);
    }
  }

  const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.error(`Coverage summary not found at ${summaryPath}. Did you run \"npm run coverage\"?`);
    process.exit(2);
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const totals = getTotals(summary);

  const failures = [];
  for (const key of Object.keys(thresholds)) {
    const actual = totals[key];
    const required = thresholds[key];
    if (isNaN(actual)) {
      failures.push(`${key}: missing`);
    } else if (actual < required) {
      failures.push(`${key}: ${actual}% < ${required}%`);
    }
  }

  console.log('Coverage totals:', totals);
  console.log('Required thresholds:', thresholds);

  if (failures.length) {
    console.error('Coverage threshold check failed:\n - ' + failures.join('\n - '));
    process.exit(1);
  } else {
    console.log('Coverage threshold check passed ✔');
  }

  // Per-file checks
  const fileFailures = [];
  for (const [file, req] of Object.entries(perFile)) {
    const entry = summary[file] || summary[(file.startsWith('contracts/') ? file : `contracts/${file}`)];
    if (!entry) {
      fileFailures.push(`${file}: not found in coverage summary`);
      continue;
    }
    const s = entry.statements && entry.statements.pct;
    const b = entry.branches && entry.branches.pct;
    const f = entry.functions && entry.functions.pct;
    const l = entry.lines && entry.lines.pct;
    if (req.statements != null && s < req.statements) fileFailures.push(`${file} statements: ${s}% < ${req.statements}%`);
    if (req.branches != null && b < req.branches) fileFailures.push(`${file} branches: ${b}% < ${req.branches}%`);
    if (req.functions != null && f < req.functions) fileFailures.push(`${file} functions: ${f}% < ${req.functions}%`);
    if (req.lines != null && l < req.lines) fileFailures.push(`${file} lines: ${l}% < ${req.lines}%`);
  }
  if (fileFailures.length) {
    console.error('Per-file coverage check failed:\n - ' + fileFailures.join('\n - '));
    process.exit(1);
  }
}

main();
