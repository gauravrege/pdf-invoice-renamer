// Reads the text out of a PDF under Node, for run.bat.
//
// The browser version is web/src/pdfBrowser.js. Both do the same two things -
// hand the bytes to pdf.js, then group the pieces into lines - and both use
// buildLines() from pdfLines.js, so the two cannot drift apart. What differs is
// only how the bytes arrive and how the worker is started.

import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { ReadError } from './errors.js';
import { buildLines } from './pdfLines.js';

globalThis.pdfjsWorker = pdfjsWorker;

export async function extractPdfText(filePath) {
  return extractPdfTextFromData(new Uint8Array(fs.readFileSync(filePath)));
}

export async function extractPdfTextFromData(data) {
  let doc;
  try {
    doc = await getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    throw new ReadError(
      `PDF could not be opened (${err.message}). The file may be corrupt or password protected.`,
      'E02',
    );
  }

  const pages = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(buildLines(content.items));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return pages.join('\n');
}
