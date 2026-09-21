// Every problem the user can hit has a code. The code is printed on screen, put
// in the Details column of the report and repeated in the log, so the same words
// describe a problem wherever it turns up.

export const ERROR_CODES = {
  E01: {
    meaning: 'The file is empty (0 bytes).',
    fix: 'The file did not download properly. Fetch it again.',
  },
  E02: {
    meaning: 'The PDF could not be opened.',
    fix: 'The file is corrupt or password protected. Open it yourself to check, then fetch a fresh copy.',
  },
  E03: {
    meaning: 'No invoice number could be found anywhere on the page.',
    fix: 'Open the file and look for the number. Often there is not one to find - an e-ticket, a covering e-mail or a statement is not an invoice. If the page does print one, under a heading this tool does not know, add that heading to NUMBER_LABELS in code\\src\\config.js.',
  },
  E04: {
    meaning: 'The PDF is a scan - a picture of a page, with no text in it to read.',
    fix: 'Nothing can be read from a picture. Rename this one by hand, or scan it again with text recognition turned on.',
  },
  E05: {
    meaning: 'The renamed copy could not be written.',
    fix: 'Check there is free disk space and that the output folder is not read-only.',
  },
  E06: {
    meaning: 'The input folder is missing.',
    fix: 'Create a folder named "input" beside the "code" folder and put the files in it.',
  },
  E07: {
    meaning: 'The Excel report could not be written.',
    fix: 'Close any open workbook in Excel and run again.',
  },
  E99: {
    meaning: 'An unexpected fault inside the tool itself.',
    fix: 'This is a bug. Send the CRASH log from the output folder to whoever maintains the tool.',
  },
};

// Thrown when the run itself cannot continue - a missing input folder, a report
// that cannot be written. Stops the tool.
export class UserError extends Error {
  constructor(message, code = 'E99') {
    super(message);
    this.name = 'UserError';
    this.code = code;
  }
}

// Thrown when one file cannot be read. The run carries on with the rest.
export class ReadError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ReadError';
    this.code = code;
  }
}

export function labelled(code, message) {
  return code ? `[${code}] ${message}` : message;
}

export function explain(codes) {
  const lines = [];
  for (const code of [...new Set(codes)].filter(Boolean).sort()) {
    const entry = ERROR_CODES[code];
    if (!entry) continue;
    lines.push(`  ${code}  ${entry.meaning}`);
    lines.push(`       What to do: ${entry.fix}`);
  }
  return lines;
}
