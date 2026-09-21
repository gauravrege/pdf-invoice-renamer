// The two things a run produces: a zip of the renamed files, and the Excel
// report. Both are built in the browser and handed straight to the download
// bar, so nothing is ever sent anywhere.

import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const REPORT_SHEET = 'Renamed Files';
const DATE_FORMAT = 'dd-mm-yyyy hh:mm';

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

export function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `${day}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

// Only the files that were actually given a name go into the zip. The ones that
// were not are in the report instead, with the reason - putting them in under
// their old names would quietly mix the two together.
export async function buildZip(rows, onProgress) {
  const zip = new JSZip();
  const renamed = rows.filter((r) => r.status !== 'NOT RENAMED');

  for (let i = 0; i < renamed.length; i += 1) {
    const row = renamed[i];
    zip.file(row.newName, await row.file.arrayBuffer());
    if (onProgress) await onProgress(i + 1, renamed.length);
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function buildReport(rows, summary) {
  const book = new ExcelJS.Workbook();
  book.creator = 'PDF Invoice Renamer';
  book.created = summary.runDate;

  const sheet = book.addWorksheet(REPORT_SHEET, {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

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

  const head = sheet.addRow(HEADERS);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
  });

  HEADERS.forEach((_, i) => {
    sheet.getColumn(i + 1).width = WIDTHS[i];
  });

  for (const row of rows) {
    const line = sheet.addRow([
      row.status,
      row.newName || '',
      row.name,
      row.number || '',
      row.foundUnder || '',
      row.otherNumbers.length > 0 ? row.otherNumbers.join(', ') : '',
      row.details || '',
    ]);

    const fill = FILL[row.status];
    if (fill) {
      line.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      });
    }
    line.getCell(7).alignment = { wrapText: true, vertical: 'top' };
  }

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4 + rows.length, column: HEADERS.length },
  };

  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// The report the web version writes has no clickable file names, where the one
// run.bat writes does. There is nothing for a link to point at: the files are
// in a zip the person has not opened yet, and a browser cannot link into it.
export function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers, so the URL
  // is let go of on the next turn of the loop instead.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
