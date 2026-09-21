// Reads the text out of a PDF in the browser.
//
// The Node version is code/src/pdfText.js. Both hand the bytes to pdf.js and
// then group the pieces into lines with buildLines() from pdfLines.js, so the
// web version and run.bat cannot read the same invoice differently. What
// differs is only how the bytes arrive and how the worker is started.

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { ReadError } from '../../code/src/errors.js';
import { buildLines } from '../../code/src/pdfLines.js';

// pdf.js does its work on a background thread so the page does not freeze while
// a folder of invoices is read. The worker is built beside app.js by build.mjs.
GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', import.meta.url).href;

export async function extractPdfTextFromData(data) {
  let doc;
  try {
    doc = await getDocument({
      data,
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
