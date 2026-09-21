// Turns an invoice number into a file name Windows will accept, and makes sure
// no two files in the output folder end up with the same one.

import { ILLEGAL_IN_NAME, ILLEGAL_REPLACEMENT } from './config.js';

// Windows refuses these as file names whatever the extension: they are device
// names left over from DOS. An invoice number will never be one, but a page
// read wrongly could be, and the failure is confusing enough to be worth
// heading off.
const RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

// Windows allows 255 characters for a name. Invoice numbers are far shorter
// than this; the cap is here so a misread page cannot produce a name the file
// system rejects.
const MAX_NAME_LENGTH = 120;

// Control characters cannot legally appear in a file name, and they are
// invisible in the report - so they are dropped rather than replaced with
// something that would misrepresent what was on the page.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

// The number as printed on the invoice is not always a name a file can have:
// "GST/2026/0041" holds slashes. This keeps the number readable while making it
// legal - the report shows both the number and the name, so nothing is lost.
export function safeName(number) {
  let name = String(number).replace(CONTROL_CHARACTERS, '').replace(ILLEGAL_IN_NAME, ILLEGAL_REPLACEMENT);

  // A run of replacements reads badly: "GST///2026" would become "GST---2026".
  // Done by hand rather than with a regular expression, so that changing
  // ILLEGAL_REPLACEMENT in config.js to something else cannot break it.
  const doubled = ILLEGAL_REPLACEMENT + ILLEGAL_REPLACEMENT;
  while (name.includes(doubled)) name = name.split(doubled).join(ILLEGAL_REPLACEMENT);

  // Windows silently drops a trailing dot or space, which would quietly turn
  // two different numbers into one file.
  name = name.trim().replace(/[. ]+$/, '');

  if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH);
  if (RESERVED.test(name)) name = name + '_';

  return name;
}

// Keeps track of what has already been used, so the second file claiming a name
// gets "(2)" after it rather than overwriting the first.
//
// Windows treats "ABC123.pdf" and "abc123.pdf" as the same file, so the check
// has to ignore case even though the name that gets written does not.
export class NameRegister {
  constructor() {
    this.taken = new Set();
  }

  // Returns the name to use and, when it was not the first choice, says so - so
  // the report can explain why a file is called "... (2)".
  claim(base, extension) {
    const first = base + extension;
    if (!this.taken.has(first.toLowerCase())) {
      this.taken.add(first.toLowerCase());
      return { name: first, clashed: false };
    }

    for (let n = 2; n < 1000; n += 1) {
      const candidate = `${base} (${n})${extension}`;
      if (!this.taken.has(candidate.toLowerCase())) {
        this.taken.add(candidate.toLowerCase());
        return { name: candidate, clashed: true };
      }
    }

    throw new Error(`More than a thousand files carry the invoice number "${base}".`);
  }
}
