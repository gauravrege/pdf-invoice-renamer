// Decides what number a file should be named after.
//
// Two ways of reading a page, tried in order:
//
//   1. The airline parsers. For the thirteen airlines they cover they are
//      exact - they know where on that airline's page the number sits, even
//      when the heading is split across three lines by the flattening.
//   2. The general reader in invoiceNumber.js, for everything else.
//
// A parser that recognises the page but then fails - the airline changed its
// amounts table, say - does not stop the run. The number is usually still
// printed where it always was, so the general reader gets a turn at it. That is
// the whole reason this tool is more forgiving than the one it came from: it
// only needs one field, not eleven.

import { parseInvoice, isRecognised } from './parsers/index.js';
import { findInvoiceNumber } from './invoiceNumber.js';

export function findNumber(text) {
  const recognised = isRecognised(text);

  if (recognised) {
    const fromParser = tryParsers(text);
    if (fromParser) return fromParser;
  }

  const generic = findInvoiceNumber(text);
  if (generic) {
    return {
      number: generic.number,
      source: recognised ? 'general reader (the airline parser found no number)' : 'general reader',
      foundUnder: generic.label,
      where: generic.where,
      documentsInFile: 1,
      otherNumbers: [],
    };
  }

  return null;
}

function tryParsers(text) {
  let documents;
  try {
    documents = parseInvoice(text);
  } catch {
    // The parser recognised the airline but could not read the page. Say
    // nothing; the general reader is tried next.
    return null;
  }

  const numbers = documents.map((d) => d.documentNumber).filter(Boolean);
  if (numbers.length === 0) return null;

  return {
    number: numbers[0],
    source: `${documents[0].issuer} parser`,
    foundUnder: documents[0].documentType || 'invoice',
    where: 'read by the parser for this airline',
    documentsInFile: documents.length,
    // A file holding several documents is named after the first. The rest are
    // listed in the report so nothing goes unnoticed.
    otherNumbers: numbers.slice(1),
  };
}
