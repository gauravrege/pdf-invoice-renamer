// Dry run: reads every file in a folder, works out what it would be renamed to,
// and writes nothing at all.
//
//   node tests/scan-folder.mjs <folder>
//   node tests/scan-folder.mjs <folder> --expect-filename
//
// --expect-filename treats each file's existing name as the right answer and
// reports how often the tool agrees. Use it on a folder that is already named
// by invoice number; it is how the general reader was measured.

import fs from 'node:fs';
import path from 'node:path';
import { extractPdfText } from '../src/pdfText.js';
import { extractHtmlText } from '../src/htmlText.js';
import { findNumber } from '../src/findNumber.js';
import { MIN_TEXT_LENGTH } from '../src/config.js';

const folder = process.argv[2];
const checkAgainstName = process.argv.includes('--expect-filename');
const verbose = process.argv.includes('--verbose');

if (!folder) {
  console.error('Usage: node tests/scan-folder.mjs <folder> [--expect-filename] [--verbose]');
  process.exit(1);
}

const READABLE = ['.pdf', '.html', '.htm'];
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (READABLE.includes(path.extname(e.name).toLowerCase())) files.push(full);
  }
})(folder);

files.sort();
console.log(`${files.length} file(s) in ${folder}\n`);

const tally = { found: 0, scanned: 0, none: 0, broken: 0, agreed: 0, disagreed: 0 };
const bySource = new Map();
const disagreements = [];
const notFound = [];

for (const file of files) {
  const stem = path.parse(file).name;
  const isHtml = ['.html', '.htm'].includes(path.extname(file).toLowerCase());

  let text = '';
  try {
    text = isHtml ? extractHtmlText(file) : await extractPdfText(file);
  } catch (err) {
    tally.broken += 1;
    notFound.push([stem, `could not be opened: ${err.message}`]);
    continue;
  }

  if (text.trim().length < MIN_TEXT_LENGTH) {
    tally.scanned += 1;
    notFound.push([stem, 'scanned image - no text']);
    continue;
  }

  const result = findNumber(text);
  if (!result) {
    tally.none += 1;
    notFound.push([stem, 'no number found']);
    continue;
  }

  tally.found += 1;
  bySource.set(result.source, (bySource.get(result.source) || 0) + 1);

  if (checkAgainstName) {
    const same = result.number.toUpperCase() === stem.toUpperCase();
    if (same) tally.agreed += 1;
    else {
      tally.disagreed += 1;
      disagreements.push([stem, result.number, result.foundUnder]);
    }
  }
  if (verbose) console.log(`  ${stem}  ->  ${result.number}   (${result.source})`);
}

console.log('-'.repeat(64));
console.log(`  Number found       : ${tally.found}`);
console.log(`  Scanned, no text   : ${tally.scanned}`);
console.log(`  No number found    : ${tally.none}`);
console.log(`  Could not be read  : ${tally.broken}`);
if (checkAgainstName) {
  console.log(`  Matches file name  : ${tally.agreed}`);
  console.log(`  Differs from name  : ${tally.disagreed}`);
}
console.log('-'.repeat(64));

console.log('\n  Where the numbers came from:');
for (const [source, n] of [...bySource].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(5)}  ${source}`);
}

if (disagreements.length > 0) {
  console.log(`\n  DIFFERS FROM FILE NAME (${disagreements.length}):`);
  for (const [stem, got, under] of disagreements.slice(0, 40)) {
    console.log(`    file "${stem}"  ->  read "${got}"   under ${under}`);
  }
  if (disagreements.length > 40) console.log(`    ... and ${disagreements.length - 40} more`);
}

if (notFound.length > 0) {
  console.log(`\n  NOTHING READ (${notFound.length}):`);
  const reasons = new Map();
  for (const [, why] of notFound) reasons.set(why, (reasons.get(why) || 0) + 1);
  for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(5)}  ${why}`);
  }
  for (const [stem, why] of notFound.slice(0, 15)) console.log(`      ${stem}: ${why}`);
  if (notFound.length > 15) console.log(`      ... and ${notFound.length - 15} more`);
}
