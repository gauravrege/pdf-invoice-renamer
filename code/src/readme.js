// Writes "READ ME.txt" into the output folder. The person who runs this tool
// may not be the person who asked for it, and may open the folder a week later
// with no idea what is in it. This file is the explanation sitting next to the
// thing it explains.

import fs from 'node:fs';
import path from 'node:path';

export function writeReadme(summary, outputDir, reportName) {
  const lines = [];
  const rule = '='.repeat(64);

  lines.push(rule);
  lines.push('  WHAT IS IN THIS FOLDER');
  lines.push(rule);
  lines.push('');
  lines.push(`  Run on ${summary.runDate.toLocaleString()}`);
  lines.push('');
  lines.push(`  ${summary.renamedName}\\`);
  lines.push('      Your files, copied and renamed to the invoice number printed');
  lines.push('      inside each one. This is the folder you want.');
  lines.push('');
  lines.push(`  ${reportName}`);
  lines.push('      One row per file: what it used to be called, what it is called');
  lines.push('      now, and the number that was read off the page. Both file names');
  lines.push('      are links - click one and the file opens.');
  lines.push('');
  lines.push('  READ ME.txt');
  lines.push('      This file.');
  lines.push('');

  lines.push(rule);
  lines.push('  WHAT HAPPENED');
  lines.push(rule);
  lines.push('');
  lines.push(`  Files read                    : ${summary.total}`);
  lines.push(`  Renamed                       : ${summary.renamed}`);
  lines.push(`  Share a number with another   : ${summary.clashes}`);
  lines.push(`  Scanned - no text to read     : ${summary.scanned}`);
  lines.push(`  No invoice number on the page : ${summary.noNumber}`);
  lines.push(`  Could not be copied           : ${summary.copyFailed}`);
  lines.push(`  Could not be read at all      : ${summary.failed}`);
  lines.push('');

  lines.push(rule);
  lines.push('  YOUR ORIGINAL FILES ARE UNTOUCHED');
  lines.push(rule);
  lines.push('');
  lines.push('  Nothing in the input folder was renamed, moved or deleted. This');
  lines.push('  tool only ever makes copies. If a name here looks wrong, delete');
  lines.push('  this whole output folder and run it again - nothing is lost.');
  lines.push('');

  const leftAlone = summary.total - summary.renamed;
  if (leftAlone > 0) {
    lines.push(rule);
    lines.push(`  ${leftAlone} FILE(S) WERE LEFT ALONE`);
    lines.push(rule);
    lines.push('');
    lines.push('  These are not in the renamed folder. They are all listed in the');
    lines.push('  report, each with the reason and a link that opens the file, so');
    lines.push('  you can look at them and name them by hand.');
    lines.push('');
    lines.push('  The tool never guesses a number. A file it could not read is');
    lines.push('  reported rather than named wrongly.');
    lines.push('');
  }

  if (summary.clashes > 0) {
    lines.push(rule);
    lines.push(`  ${summary.clashes} FILE(S) SHARE A NUMBER`);
    lines.push(rule);
    lines.push('');
    lines.push('  Two or more files carry the same invoice number. Nothing was');
    lines.push('  overwritten - the second copy is called "... (2)". They are');
    lines.push('  marked CHECK THIS in the report. Usually it means the same');
    lines.push('  document was put into the input folder twice.');
    lines.push('');
  }

  const target = path.join(outputDir, 'READ ME.txt');
  try {
    fs.writeFileSync(target, lines.join('\r\n'), 'utf8');
    return target;
  } catch (err) {
    console.warn(`Warning: could not write READ ME.txt (${err.message}).`);
    return null;
  }
}
