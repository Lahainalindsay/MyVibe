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
}

main();

