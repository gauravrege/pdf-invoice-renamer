// Works out what every dropped file should be called.
//
// This is the same job code/src/index.js does under Node, and it uses the same
// two modules to do it - findNumber() and safeName()/NameRegister - so the web
// version and run.bat give the same answer for the same invoice. What is
// different is only the ends: files arrive from a drop instead of a folder, and
// the result is held in memory instead of copied to disk.

import { MIN_TEXT_LENGTH } from '../../code/src/config.js';
import { ReadError, labelled } from '../../code/src/errors.js';
import { findNumber } from '../../code/src/findNumber.js';
import { htmlToText } from '../../code/src/htmlToText.js';
import { safeName, NameRegister } from '../../code/src/rename.js';
import { extractPdfTextFromData } from './pdfBrowser.js';

const HTML = ['.html', '.htm'];

export const READABLE = ['.pdf', ...HTML];

export function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function isReadable(name) {
  return READABLE.includes(extensionOf(name));
}

// Reads every file and returns one row per file, in the order they were given.
// `onProgress` is called after each one so the page can show how far it has got;
// the work is otherwise uninterrupted.
export async function renameAll(files, onProgress) {
  const register = new NameRegister();
  const rows = [];

  for (let i = 0; i < files.length; i += 1) {
    const row = await processFile(files[i], register);
    rows.push(row);
    if (onProgress) await onProgress(i + 1, files.length, row);
  }

  return rows;
}

async function processFile(file, register) {
  const row = blank(file);

  let text = '';
  try {
    if (file.size === 0) return leave(row, 'The file is empty (0 bytes).', 'E01');
    text = HTML.includes(extensionOf(file.name))
      ? htmlToText(await file.text())
      : await extractPdfTextFromData(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    return leave(row, err.message, err instanceof ReadError ? err.code : 'E99');
  }

  if (text.trim().length < MIN_TEXT_LENGTH) {
    return leave(
      row,
      HTML.includes(extensionOf(file.name))
        ? 'The page holds no text to read.'
        : 'This PDF is a scan - a picture of a page. There is no text in it to read a number from.',
      'E04',
    );
  }

  const found = findNumber(text);
  if (!found) {
    return leave(
      row,
      'No invoice number could be found on the page. Often there is not one to find - an e-ticket or a covering e-mail is not an invoice.',
      'E03',
    );
  }

  row.number = found.number;
  row.foundUnder = found.foundUnder;
  row.otherNumbers = found.otherNumbers;
  row.source = found.source;

  const base = safeName(found.number);
  if (!base) {
    return leave(
      row,
      `The number read from the page ("${found.number}") leaves nothing usable as a file name.`,
      'E03',
    );
  }

  const claim = register.claim(base, extensionOf(file.name));
  row.newName = claim.name;
  row.clashed = claim.clashed;
  row.status = 'RENAMED';

  const notes = [];
  if (found.source) notes.push(`Read by the ${found.source}.`);
  if (claim.clashed) {
    row.status = 'CHECK THIS';
    notes.push(
      `Another file carries the same number, so this one is called "${claim.name}". Check whether the same document was added twice.`,
    );
  }
  if (found.otherNumbers.length > 0) {
    row.status = 'CHECK THIS';
    notes.push(
      `This one file holds ${found.documentsInFile} documents. It is named after the first; the others are ${found.otherNumbers.join(', ')}.`,
    );
  }
  if (base !== found.number) {
    notes.push(
      `The number on the page is "${found.number}". Windows does not allow those characters in a file name, so it is called "${base}".`,
    );
  }
  row.details = notes.join(' ');
  return row;
}

function blank(file) {
  return {
    file,
    name: file.name,
    size: file.size,
    status: 'NOT RENAMED',
    newName: '',
    number: '',
    foundUnder: '',
    source: '',
    otherNumbers: [],
    clashed: false,
    code: '',
    details: '',
  };
}

// The file is left as it is. The row says why, and the page shows it.
function leave(row, why, code) {
  row.status = 'NOT RENAMED';
  row.code = code;
  row.details = labelled(code, why);
  return row;
}

export function summarise(rows) {
  const summary = {
    total: rows.length,
    renamed: 0,
    clashes: 0,
    scanned: 0,
    noNumber: 0,
    failed: 0,
    runDate: new Date(),
  };

  for (const row of rows) {
    if (row.status !== 'NOT RENAMED') summary.renamed += 1;
    if (row.clashed) summary.clashes += 1;
    if (row.code === 'E04') summary.scanned += 1;
    else if (row.code === 'E03') summary.noNumber += 1;
    else if (row.status === 'NOT RENAMED') summary.failed += 1;
  }

  return summary;
}
