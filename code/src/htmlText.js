// Reads an HTML invoice off disk under Node, for run.bat. The conversion itself
// is in htmlToText.js, which the browser version uses too.

import fs from 'node:fs';
import { ReadError } from './errors.js';
import { htmlToText } from './htmlToText.js';

export { htmlToText };

export function extractHtmlText(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new ReadError(`The file could not be read (${err.message}).`, 'E10');
  }
  return htmlToText(raw);
}
