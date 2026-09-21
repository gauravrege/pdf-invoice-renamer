// Prints the first rows of a report, links and all, so a change to report.js
// can be checked without opening Excel.
//
//   node tests/dump-report.mjs ../output/Renamed_2026-09-21_1635.xlsx
//   node tests/dump-report.mjs <file> 40        how many rows to show

import ExcelJS from 'exceljs';

const [file, howMany = '12'] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node tests/dump-report.mjs <report.xlsx> [rows]');
  process.exit(1);
}

const book = new ExcelJS.Workbook();
await book.xlsx.readFile(file);

for (const sheet of book.worksheets) {
  console.log(`\n=== ${sheet.name}  (${sheet.rowCount} rows) ===\n`);
  sheet.eachRow((row, n) => {
    if (n > Number(howMany)) return;
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) cells.push('');
      else if (typeof v === 'object' && v.hyperlink) cells.push(`${v.text}  ->[${v.hyperlink}]`);
      else if (v instanceof Date) cells.push(v.toISOString());
      else cells.push(String(v));
    });
    console.log(`${String(n).padStart(3)} | ${cells.join(' | ')}`);
  });
}
