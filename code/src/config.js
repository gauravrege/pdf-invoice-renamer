// Everything the maintainer is likely to want to change lives here.

export const INPUT_DIR = 'input';
export const OUTPUT_DIR = 'output';

// Renamed copies go into a folder of their own inside the output folder, so
// they are not mixed in with the report and the guide.
//
// The folder carries the date and time of the run, exactly as the report does,
// which pairs the two and means running the tool twice does not put a second
// run's copies on top of the first. Nothing is ever overwritten; old runs are
// left for the person to delete when they are happy with the new one.
export const RENAMED_DIR_PREFIX = 'Renamed_';

export const REPORT_SHEET = 'Renamed Files';
export const DATE_FORMAT = 'dd-mm-yyyy hh:mm';

// The headings a page might print above its invoice number, best first. The
// tool works down this list and takes the first one it finds, so a page that
// prints both "Tax Invoice No" and "Reference No" is named after the first.
//
// ADDING A NEW ONE: put it in the group it belongs to. Write it as a regular
// expression fragment - \s* means "any spaces here", ?: makes a bracket group
// that does not capture. Do not add a capturing bracket; the finder adds its
// own for the value.
export const NUMBER_LABELS = [
  // Strongest: the page says outright that this is the invoice's own number.
  String.raw`Tax\s*Invoice\s*(?:No|Number|Num|#)`,
  String.raw`Invoice\s*(?:No|Number|Num|#)`,
  String.raw`Invoice\s*ID`,

  // A credit or debit note is a document in its own right with its own number.
  String.raw`Credit\s*Note\s*(?:No|Number|#)`,
  String.raw`Debit\s*Note\s*(?:No|Number|#)`,

  // Other names for the same thing.
  String.raw`Bill\s*(?:No|Number|#)`,
  String.raw`Document\s*(?:No|Number|#)`,
  String.raw`Doc\s*(?:No|Number|#)`,
  String.raw`Voucher\s*(?:No|Number|#)`,
  String.raw`Receipt\s*(?:No|Number|#)`,
  String.raw`Serial\s*(?:No|Number|#)`,

  // Weakest, and only used when nothing above is on the page: these headings
  // sometimes sit above a number that is not the invoice's own.
  String.raw`Reference\s*(?:No|Number|#)`,
  String.raw`Ref\s*(?:No|Number|#)`,
];

// The same idea, but for pages that print the heading with no "No" after it -
// "Tax Invoice : MAA/2026/P000154". These are kept apart from the list above
// because they are only safe when the page puts a colon after the heading.
// Without that rule the words "TAX INVOICE" printed as a title across the top
// of almost every invoice would be read as a heading, and whatever happened to
// follow it would be read as the number.
//
// Tried only after every heading above has been looked for and not found.
export const COLON_ONLY_LABELS = [
  String.raw`Tax\s*Invoice`,
  String.raw`Credit\s*Note`,
  String.raw`Debit\s*Note`,
  String.raw`Invoice`,
];

// A value has to look like an identifier to be accepted as one: it must hold at
// least one digit, and be between these lengths. Shorter than this and a stray
// word gets picked up; longer and it is a sentence, not a number.
export const MIN_NUMBER_LENGTH = 3;
export const MAX_NUMBER_LENGTH = 40;

// Below this much text a PDF is a picture of a page rather than a page.
export const MIN_TEXT_LENGTH = 20;

// Characters Windows will not allow in a file name. An invoice number often
// holds a slash - "GST/2026/0041" - so it cannot simply be dropped.
//
// Both slashes matter. A backslash left in a name is not just illegal: it is
// read as a folder separator, so the copy would be written somewhere other
// than where it was meant to go.
export const ILLEGAL_IN_NAME = /[\\/:*?"<>|]/g;
export const ILLEGAL_REPLACEMENT = '-';
