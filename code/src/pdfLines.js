// Turns the pieces of text pdf.js hands back into lines of a page.
//
// This sits in a file of its own because it runs in two places: under Node for
// run.bat, and in the browser for the web version. The three numbers below are
// tuned against real invoices, and they are the whole reason a table row comes
// out as one readable line. If they were copied into both places they would
// drift, and the two versions would start reading the same invoice differently.

// How far apart two pieces of text can sit vertically and still count as the
// same line, and the horizontal gap that means a space rather than two
// characters that happen to be adjacent.
const LINE_TOLERANCE = 2.2;
const SPACE_GAP = 1.4;

// Most of these invoices are laid out in two columns - the airline down one side
// and the customer down the other - and flattening a page into lines runs the
// two together: "SAINT-GOBAIN INDIA LTD Kempegowda International Airport,".
//
// The gap between two columns is a different order of thing from the gap between
// two words: around 200 units against around 1. Anything above this is treated
// as a column boundary and kept as a tab, so a parser that needs to can split
// the halves apart. Everything else sees a tab as the whitespace it is.
const COLUMN_GAP = 20;

// A PDF holds pieces of text at coordinates, not lines. Group them by height,
// sort each group left to right, and a table row reads as one line of text.
export function buildLines(items) {
  const rows = [];

  for (const item of items) {
    if (!item.str) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const width = item.width ?? 0;

    let row = rows.find((r) => Math.abs(r.y - y) <= LINE_TOLERANCE);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, end: x + width, str: item.str });
  }

  rows.sort((a, b) => b.y - a.y);

  return rows
    .map((row) => {
      row.parts.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = null;
      for (const part of row.parts) {
        if (prevEnd !== null && !line.endsWith(' ') && !line.endsWith('\t')) {
          const gap = part.x - prevEnd;
          if (gap > COLUMN_GAP) line += '\t';
          else if (gap > SPACE_GAP) line += ' ';
        }
        line += part.str;
        prevEnd = part.end;
      }
      // Runs of blanks collapse, but a column boundary is kept as one tab.
      return line.replace(/[^\S\t\n]+/g, ' ').replace(/ ?\t[\t ]*/g, '\t').trim();
    })
    .filter((line) => line.length > 0)
    .join('\n');
}
