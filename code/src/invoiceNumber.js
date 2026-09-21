// Finds an invoice number on a page no parser recognises.
//
// The idea is small: a page prints a heading like "Invoice No" and puts the
// number beside it or under it. Work down the headings in config.js, and for
// each one look in both places. The first heading that yields something that
// looks like an identifier wins.
//
// What makes this awkward is that flattening a PDF into lines puts things next
// to each other that are not related. "Invoice No" with an empty value sits on
// the same line as the start of the next field, so a careless match reads
// "Invoice Date" as the invoice number. Everything in `rejects()` is a case
// that turned up in real files.

import { NUMBER_LABELS, COLON_ONLY_LABELS, MIN_NUMBER_LENGTH, MAX_NUMBER_LENGTH } from './config.js';

// A value starts with a letter or digit and carries on through the characters
// an invoice number is made of. It stops at a space, so "ADH2608CS0000184" is
// read out of "Invoice No ADH2608CS0000184 Invoice Date 01-Aug-2026".
const VALUE = String.raw`([A-Za-z0-9][A-Za-z0-9\/\-_.]{1,${MAX_NUMBER_LENGTH - 1}})`;

// Between a heading and its value there may be a full stop closing an
// abbreviation ("Invoice No."), a colon, a dash, or the tab that marks a column
// boundary - in any combination, or none at all. What there may not be is a
// newline: that is the next-line case, handled separately and more strictly.
const GAP = String.raw`[ \t]*\.?[ \t]*[:\-]?[ \t]*`;

// A heading must not run straight on into a longer word - "Invoice No" must not
// match inside "Invoice Note". A plain \b cannot do this job, because a heading
// ending in "#" is followed by a space in "Invoice # 4412", and \b between "#"
// and a space does not hold.
const NOT_A_LONGER_WORD = String.raw`(?![A-Za-z])`;

// Words that are the start of the NEXT field, not a value. When a page prints
// "Invoice No" with nothing after it, the flattened line often runs straight on
// into the following heading.
const NEXT_FIELD = /^(?:invoice|date|no|number|num|tax|gst|pan|cin|trip|bill|doc|document|ref|reference|serial|credit|debit|note|amount|total|page|of|to|from|for|and|the|customer|client|supplier|name|address|place|supply|hsn|sac|code|id)$/i;

export function findInvoiceNumber(text) {
  const lines = text.split('\n');

  // Every "Invoice No"-style heading first, across the whole page...
  for (const label of NUMBER_LABELS) {
    const found = searchForLabel(text, lines, label, GAP);
    if (found) return found;
  }

  // ...and only then the bare headings, which need a colon to be trusted.
  const colonGap = String.raw`[ \t]*:[ \t]*`;
  for (const label of COLON_ONLY_LABELS) {
    const found = searchForLabel(text, lines, label, colonGap, true);
    if (found) return found;
  }

  return null;
}

function searchForLabel(text, lines, label, gap, needsColon = false) {
  // Beside the heading, on the same line. Tried first because it is by far the
  // commonest layout and the least ambiguous.
  const sameLine = new RegExp(String.raw`\b${label}${NOT_A_LONGER_WORD}${gap}${VALUE}`, 'gi');
  for (const match of text.matchAll(sameLine)) {
    const value = clean(match[1]);
    if (accepts(value)) return { number: value, label: readable(label), where: 'beside the heading' };
  }

  // Under the heading, on the next line. This happens when the heading sits in
  // a narrow column, and it is the weaker of the two: the next line might be
  // anything. So the line has to hold the heading and nothing else, and then
  // the line below it has to be a value and nothing else.
  const tail = needsColon ? String.raw`\s*:\s*` : String.raw`\W*`;
  const headingOnly = new RegExp(String.raw`^\W*${label}${tail}$`, 'i');
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!headingOnly.test(lines[i].trim())) continue;
    const next = lines[i + 1].trim();
    const alone = new RegExp(String.raw`^${VALUE}$`).exec(next);
    if (!alone) continue;
    const value = clean(alone[1]);
    if (accepts(value)) return { number: value, label: readable(label), where: 'under the heading' };
  }

  return null;
}

// Trailing punctuation is part of the layout, not the number: "ADH2608CS0000184."
// at the end of a line, or a value that runs into the next heading's colon.
function clean(raw) {
  return raw.replace(/^[-_.]+/, '').replace(/[-_.]+$/, '');
}

function accepts(value) {
  if (!value) return false;
  if (value.length < MIN_NUMBER_LENGTH || value.length > MAX_NUMBER_LENGTH) return false;
  // Every invoice number has a digit in it. A run of letters is a word.
  if (!/\d/.test(value)) return false;
  return !rejects(value);
}

function rejects(value) {
  // The start of the next field rather than a value.
  if (NEXT_FIELD.test(value)) return true;

  // A date. "01-Aug-2026", "01/08/2026", "2026-08-01", "01.08.2026". These sit
  // beside the invoice number often enough that a heading matched a little too
  // loosely lands on one.
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(value)) return true;
  if (/^\d{1,2}[-/.][A-Za-z]{3,9}[-/.]\d{2,4}$/.test(value)) return true;
  if (/^[A-Za-z]{3,9}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(value)) return true;

  // A GST number. Fifteen characters in a fixed shape, and every Indian invoice
  // prints at least two of them.
  if (/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i.test(value)) return true;

  // A PAN. Ten characters, and it sits under a heading of its own that is
  // sometimes flattened onto the same line as the invoice number's.
  if (/^[A-Z]{5}\d{4}[A-Z]$/i.test(value)) return true;

  // A percentage or a money amount that ended up beside a heading.
  if (/^\d+(?:\.\d+)?%?$/.test(value) && !/^\d{4,}$/.test(value)) return true;

  return false;
}

// Turns the regular expression fragment back into something a person can read,
// for the "found under" column of the report. Split and join rather than a
// replace, because the thing being looked for is itself a backslash.
function readable(label) {
  return label
    .split(String.raw`\s*`).join(' ')
    .split('(?:').join('(')
    .split('|').join(' or ')
    .trim();
}
