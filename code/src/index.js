import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { INPUT_DIR, OUTPUT_DIR, RENAMED_DIR_PREFIX, MIN_TEXT_LENGTH } from './config.js';
import { UserError, ReadError, labelled, explain } from './errors.js';
import { nowReading, writeCrashReport, crashReportPath } from './crash.js';
import { extractPdfText } from './pdfText.js';
import { extractHtmlText } from './htmlText.js';
import { findNumber } from './findNumber.js';
import { safeName, NameRegister } from './rename.js';
import { writeReport } from './report.js';
import { writeReadme } from './readme.js';

// "input" and "output" sit beside the "code" folder, not inside it. There are
// two places this file runs from and they are different depths:
//
//   code\tool.mjs      the bundle everyone else runs - root is one level up
//   code\src\index.js  running from source while changing the code - two
//
// Anywhere else, the folders are taken to be beside the file itself. Either
// way, a folder given on the command line wins over all of this.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEPTH = { src: '../..', code: '..' };
const UP = DEPTH[path.basename(SCRIPT_DIR).toLowerCase()];
const PROJECT_ROOT = UP ? path.resolve(SCRIPT_DIR, UP) : SCRIPT_DIR;

const [argInput, argOutput] = process.argv.slice(2);
const inputDir = path.resolve(PROJECT_ROOT, argInput || INPUT_DIR);
const outputDir = path.resolve(PROJECT_ROOT, argOutput || OUTPUT_DIR);

const ESC = String.fromCharCode(27);
const COLOUR = Boolean(process.stdout.isTTY && process.stdout.hasColors && process.stdout.hasColors());
const red = (s) => (COLOUR ? `${ESC}[31m${s}${ESC}[39m` : s);
const bold = (s) => (COLOUR ? `${ESC}[1m${s}${ESC}[22m` : s);

const HTML = ['.html', '.htm'];
const READABLE = ['.pdf', ...HTML];

process.on('uncaughtException', (err) => stop(err));
process.on('unhandledRejection', (err) => stop(err));

main().catch(stop);

function stop(err) {
  console.error('');
  if (err instanceof UserError) {
    console.error(red(`  ERROR [${err.code}]  ${err.message}`));
    const help = explain([err.code]);
    if (help.length > 0) {
      console.error('');
      for (const line of help) console.error(line);
    }
  } else {
    const report = writeCrashReport(err, outputDir);
    console.error(red('  ERROR [E99]  The tool hit an unexpected problem and stopped.'));
    console.error('');
    console.error(`               ${(err && err.message) || String(err)}`);
    console.error('');
    if (report) {
      console.error('               A full report has been saved to:');
      console.error(`                 ${report}`);
      console.error('               Send that file to whoever maintains the tool.');
    } else {
      console.error('  ' + ((err && err.stack) || String(err)));
    }
  }
  console.error('');
  process.exitCode = 1;
}

async function main() {
  const startedAt = Date.now();
  banner();

  const files = collectInputFiles(inputDir);
  if (files.length === 0) {
    console.log(`No PDF or HTML files found in "${inputDir}".`);
    console.log('Put your invoices in the input folder and run this again.');
    return;
  }

  // The run is stamped before anything is written, so the folder of copies and
  // the report that describes it always carry the same name.
  const runDate = new Date();
  const run = claimRunFolder(outputDir, timestamp(runDate));
  const { dir: renamedDir, name: renamedName, stamp } = run;

  console.log(`Found ${files.length} file(s) in "${inputDir}".`);
  console.log('');

  const register = new NameRegister();
  const records = [];
  const summary = {
    total: files.length,
    renamed: 0,
    clashes: 0,
    scanned: 0,
    noNumber: 0,
    failed: 0,
    copyFailed: 0,
    runDate,
    renamedName,
  };

  for (let i = 0; i < files.length; i += 1) {
    const record = await processFile(files[i], register, renamedDir, renamedName);
    records.push(record);

    if (record.status !== 'NOT RENAMED') summary.renamed += 1;
    if (record.clashed) summary.clashes += 1;
    if (record.code === 'E04') summary.scanned += 1;
    else if (record.code === 'E03') summary.noNumber += 1;
    else if (record.code === 'E05') summary.copyFailed += 1;
    else if (record.status === 'NOT RENAMED') summary.failed += 1;

    reportProgress(i + 1, files.length, record);
  }

  const reportPath = await saveReport(records, summary, stamp);
  const readmePath = writeReadme(summary, outputDir, path.basename(reportPath));

  printSummary(summary, reportPath, readmePath, records, Date.now() - startedAt);
}

// Reads one file, works out its number, and writes the renamed copy. Returns
// the row that describes what happened, whether or not anything was copied.
async function processFile(filePath, register, renamedDir, renamedName) {
  const record = blank(path.relative(inputDir, filePath));
  const isHtml = HTML.includes(path.extname(filePath).toLowerCase());
  record.sourceLink = path.relative(outputDir, filePath);

  nowReading(record.file);

  let text = '';
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return leave(record, 'The file is empty (0 bytes).', 'E01');
    text = isHtml ? extractHtmlText(filePath) : await extractPdfText(filePath);
  } catch (err) {
    return leave(record, err.message, err instanceof ReadError ? err.code : noteBug(err));
  }

  if (text.trim().length < MIN_TEXT_LENGTH) {
    return leave(
      record,
      isHtml
        ? 'The page holds no text to read.'
        : 'This PDF is a scan - a picture of a page. There is no text in it to read a number from.',
      'E04',
    );
  }

  const found = findNumber(text);
  if (!found) {
    return leave(
      record,
      'No invoice number could be found on the page. Open the file and look for it; if the heading above it is one this tool does not know, add that heading to NUMBER_LABELS in code\\src\\config.js.',
      'E03',
    );
  }

  record.number = found.number;
  record.foundUnder = found.foundUnder;
  record.otherNumbers = found.otherNumbers;

  const base = safeName(found.number);
  if (!base) {
    return leave(
      record,
      `The number read from the page ("${found.number}") leaves nothing usable as a file name.`,
      'E03',
    );
  }

  const claim = register.claim(base, path.extname(filePath));
  record.newName = claim.name;
  record.clashed = claim.clashed;

  try {
    // Never overwrite. Each run writes into a folder of its own and the register
    // has already made the name unique within that folder, so nothing should be
    // in the way - but if something is, it is said out loud rather than quietly
    // replacing a file nobody knew was there.
    fs.copyFileSync(filePath, path.join(renamedDir, claim.name), fs.constants.COPYFILE_EXCL);
  } catch (err) {
    if (err.code === 'EEXIST') {
      return leave(
        record,
        `Something is already called "${claim.name}" in this run's folder, so the copy was not made. Nothing was overwritten.`,
        'E05',
      );
    }
    return leave(record, `The renamed copy could not be written: ${err.message}`, 'E05');
  }

  record.status = 'RENAMED';
  record.newLink = path.join(renamedName, claim.name);

  const notes = [];
  if (found.source) notes.push(`Read by the ${found.source}.`);
  if (claim.clashed) {
    record.status = 'CHECK THIS';
    notes.push(
      `Another file in this run carries the same number, so this copy is called "${claim.name}". Check whether the same document was put in twice.`,
    );
  }
  if (found.otherNumbers.length > 0) {
    record.status = 'CHECK THIS';
    notes.push(
      `This one file holds ${found.documentsInFile} documents. It is named after the first; the others are ${found.otherNumbers.join(', ')}.`,
    );
  }
  if (base !== found.number) {
    notes.push(
      `The number on the page is "${found.number}". Windows does not allow those characters in a file name, so the copy is called "${base}".`,
    );
  }
  record.details = notes.join(' ');
  return record;
}

function blank(file) {
  return {
    file,
    status: 'NOT RENAMED',
    newName: '',
    newLink: '',
    sourceLink: '',
    number: '',
    foundUnder: '',
    otherNumbers: [],
    clashed: false,
    code: '',
    details: '',
  };
}

// The file keeps its name and stays where it is. The report says why.
function leave(record, why, code) {
  record.status = 'NOT RENAMED';
  record.code = code;
  record.details = labelled(code, why);
  return record;
}

function noteBug(err) {
  writeCrashReport(err, outputDir);
  return 'E99';
}

async function saveReport(records, summary, stamp) {
  const MAX_ATTEMPTS = 20;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 1 ? '' : ` (${attempt})`;
    const target = path.join(outputDir, `Renamed_${stamp}${suffix}.xlsx`);
    try {
      await writeReport(records, summary, target);
      if (attempt > 1) {
        console.log(`  Note: an earlier report was open, so this run was saved as "${path.basename(target)}".`);
      }
      return target;
    } catch (err) {
      const locked = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES';
      if (!locked) throw new UserError(`Could not write the report "${target}": ${err.message}`, 'E07');
      if (attempt === MAX_ATTEMPTS) {
        throw new UserError(
          `Could not write the report into "${outputDir}" - every name tried was locked.\n  Fix: close any open workbooks in Excel and run this again.`,
          'E07',
        );
      }
    }
  }
  throw new UserError(`Could not write the report into "${outputDir}".`, 'E07');
}

function collectInputFiles(dir) {
  if (!fs.existsSync(dir)) {
    throw new UserError(`The input folder is missing. Expected "${dir}".`, 'E06');
  }

  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && READABLE.includes(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  };
  walk(dir);
  return out.sort((a, b) => a.localeCompare(b));
}

function reportProgress(done, total, record) {
  const width = String(total).length;

  if (record.status === 'NOT RENAMED') {
    if (process.stdout.isTTY) process.stdout.write(`\r${' '.repeat(40)}\r`);
    console.log(`  ${red(bold('LEFT ALONE'))}  ${record.file}`);
    console.log(`              ${record.details}`);
    return;
  }

  if (process.stdout.isTTY) {
    if (done % 25 === 0 || done === total) {
      const suffix = done === total ? '\n' : '';
      process.stdout.write(`\r  Reading... ${String(done).padStart(width)} of ${total}${suffix}`);
    }
  } else if (done % 250 === 0 || done === total) {
    console.log(`  Reading... ${String(done).padStart(width)} of ${total}`);
  }
}

function printSummary(summary, reportPath, readmePath, records, elapsedMs) {
  const line = '-'.repeat(64);
  console.log('');
  console.log(line);
  console.log('  DONE');
  console.log(line);
  console.log(`  Files read                    : ${summary.total}`);
  console.log(`  Renamed                       : ${summary.renamed}`);
  console.log(`  Share a number with another   : ${summary.clashes}`);
  console.log(`  Scanned - no text to read     : ${summary.scanned}`);
  console.log(`  No invoice number on the page : ${summary.noNumber}`);
  console.log(`  Could not be copied           : ${summary.copyFailed}`);
  console.log(`  Could not be read at all      : ${summary.failed}`);
  console.log(`  Time taken                    : ${(elapsedMs / 1e3).toFixed(1)}s`);
  console.log(line);
  console.log(`  Renamed copies : ${summary.renamedName}\\`);
  console.log(`  Report         : ${path.basename(reportPath)}`);
  if (readmePath) console.log(`  Guide          : ${path.basename(readmePath)}  (explains these files)`);
  console.log(`  Folder         : ${outputDir}`);
  console.log(line);

  const leftAlone = records.filter((r) => r.status === 'NOT RENAMED');
  if (leftAlone.length > 0) {
    console.log('');
    console.log(`  ${leftAlone.length} file(s) were left alone and still have their old names.`);
    console.log('  Every one is listed in the report, with a link that opens it.');
  }
  if (summary.clashes > 0) {
    console.log('');
    console.log(`  ${summary.clashes} file(s) share a number with another file - marked "CHECK THIS".`);
  }

  const help = explain(records.map((r) => r.code));
  if (help.length > 0) {
    console.log('');
    console.log('  What the codes mean:');
    for (const hl of help) console.log('  ' + hl);
  }

  const crash = crashReportPath();
  if (crash) {
    console.log('');
    console.log(`  A crash report with the technical detail is in: ${path.basename(crash)}`);
  }
  console.log('');
}

// Makes the folder this run's copies go into, and returns the stamp that was
// actually used so the report can be given the matching name.
//
// Two runs in the same second would otherwise land in the same folder and the
// second would find every name taken. Seconds make that rare; the suffix makes
// it impossible. `recursive: false` is the point of this - it throws rather
// than quietly handing back a folder that is already full of another run.
function claimRunFolder(outputDir, stamp) {
  fs.mkdirSync(outputDir, { recursive: true });

  for (let attempt = 1; attempt < 100; attempt += 1) {
    const withSuffix = attempt === 1 ? stamp : `${stamp} (${attempt})`;
    const name = `${RENAMED_DIR_PREFIX}${withSuffix}`;
    const dir = path.join(outputDir, name);
    try {
      fs.mkdirSync(dir);
      return { dir, name, stamp: withSuffix };
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw new UserError(`Could not make the folder "${dir}": ${err.message}`, 'E05');
      }
    }
  }

  throw new UserError(
    `Could not make a folder for this run inside "${outputDir}" - the first hundred names were all taken.\n  Fix: delete some of the old "${RENAMED_DIR_PREFIX}..." folders and run this again.`,
    'E05',
  );
}

function timestamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `${day}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function banner() {
  console.log('');
  console.log('='.repeat(64));
  console.log('  PDF INVOICE RENAMER');
  console.log('='.repeat(64));
  console.log('');
}
