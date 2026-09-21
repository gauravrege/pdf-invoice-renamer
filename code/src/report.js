// Writes the Excel report: one row per file, saying what it was called, what it
// is called now, and - when it was left alone - why.
//
// Both file names are links. Clicking the new name opens the renamed copy;
// clicking the original opens the file it was made from. That is what makes the
// report usable for checking a run rather than just reading about it.

import path from 'node:path';
import ExcelJS from 'exceljs';

import { REPORT_SHEET, DATE_FORMAT } from './config.js';

const HEADERS = [
  'STATUS',
  'NEW NAME',
  'ORIGINAL FILE',
  'INVOICE NUMBER',
  'FOUND UNDER',
  'ALSO IN THIS FILE',
  'DETAILS',
];

const WIDTHS = [16, 34, 46, 26, 26, 30, 64];

// Colours are a second way of seeing the same thing the STATUS column says, for
// someone scrolling a long report. They are not the only way: the status is
// always written out in words.
const FILL = {
  RENAMED: 'FFE8F5E9',
  'NOT RENAMED': 'FFFFEBEE',
  'CHECK THIS': 'FFFFF8E1',
};

export async function writeReport(records, summary, target) {
  const book = new ExcelJS.Workbook();
  book.creator = 'PDF Invoice Renamer';
  book.created = summary.runDate;

  const sheet = book.addWorksheet(REPORT_SHEET, {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  title(sheet, summary);

  const head = sheet.addRow(HEADERS);
  head.font = { bold: true };
  head.alignment = { vertical: 'middle' };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
  });

  HEADERS.forEach((_, i) => {
    sheet.getColumn(i + 1).width = WIDTHS[i];
  });

  for (const record of records) {
    const row = sheet.addRow([
      record.status,
      record.newName ? link(record.newName, record.newLink) : '',
      link(record.file, record.sourceLink),
      record.number || '',
      record.foundUnder || '',
      record.otherNumbers.length > 0 ? record.otherNumbers.join(', ') : '',
      record.details || '',
    ]);

    const fill = FILL[record.status];
    if (fill) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      });
    }
    styleLink(row.getCell(2));
    styleLink(row.getCell(3));
    row.getCell(7).alignment = { wrapText: true, vertical: 'top' };
  }

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4 + records.length, column: HEADERS.length },
  };

  await book.xlsx.writeFile(target);
}

// Three lines above the table: what the run did, so the report says what it is
// without anyone having to count rows.
function title(sheet, summary) {
  const heading = sheet.addRow(['PDF Invoice Renamer - what this run did']);
  heading.font = { bold: true, size: 14 };

  const when = sheet.addRow(['Run on', summary.runDate]);
  when.getCell(2).numFmt = DATE_FORMAT;

  sheet.addRow([
    'Files read',
    summary.total,
    'Renamed',
    summary.renamed,
    'Left alone',
    summary.total - summary.renamed,
  ]);
}

// A link needs a path the spreadsheet can follow. The copies sit in a folder
// beside the report, and the originals are wherever they were read from, so
// both are written relative to the report itself.
function link(text, target) {
  if (!target) return text;
  return {
    text,
    hyperlink: target.split(path.sep).join('/').split('/').map(encodeURIComponent).join('/'),
  };
}

function styleLink(cell) {
  if (cell.value && typeof cell.value === 'object' && cell.value.hyperlink) {
    cell.font = { color: { argb: 'FF0563C1' }, underline: true };
  }
}
