# PDF Invoice Renamer

Reads the invoice number printed inside an invoice and names the file after it.

There are two ways to run it, and they read an invoice identically - the same
readers do the work in both:

| | |
|---|---|
| **The web version** (`web/`) | Drop files onto a page, get a zip back. Nothing is uploaded: the invoices are read inside the browser tab. |
| **The desktop version** (`code/`) | Double-click `code\run.bat`. Works on a whole `input` folder at once and writes the copies to disk. |

**Your originals are never touched.** Both only ever copy. A run that got
something wrong costs nothing: delete the output and run it again.

---

## The desktop version

Reads the invoice number printed inside each file in `input`, and saves a copy
of that file under that number into `output`.

**If you just want to run it:** put the files in `input`, double-click
`code\run.bat`, and read `output\READ ME.txt`. The rest of this section is for
whoever maintains the code.

## The folder

```
input\                          the files to read - PDF or HTML
output\
    Renamed_2026-09-21_164134\  the renamed copies from one run
    Renamed_2026-09-21_164134.xlsx   the report for that same run
    READ ME.txt                 what all of this is
code\                           this folder: run.bat, tool.mjs, and src\
```

`input` and `output` sit beside `code`, not inside it. `run.bat` works that out
for itself, so the three folders can be moved anywhere as long as they stay
together.

**Every run gets its own folder**, stamped with the date and time, and the
report for that run carries the same stamp. Nothing a previous run wrote is
overwritten or deleted, so running the tool twice is always safe - and running
it twice is exactly what someone does when they are not sure it worked the
first time. Old folders are the person's to delete when they are happy.

## Running it

Run these from inside `code`.

| | |
|---|---|
| `run.bat` | What everyone else uses. Runs the bundled `tool.mjs`. |
| `npm install` | Needed once before any of the three below. |
| `npm start` | Runs from `src\` instead. Use this while changing the code. |
| `npm run build` | Rebuilds `tool.mjs` from `src\`. **Do this before handing the folder on.** |
| `node src/index.js <input> <output>` | Runs against other folders. |

`node_modules` is not shipped, and is only needed to build or to run from
`src\`. A machine that only runs `run.bat` needs the `code` folder and Node.js,
nothing else - `tool.mjs` already has everything bundled into it.

## How a run works

```
input/*.pdf  ─→ pdfText.js  ─┐                   ┌─→ output/Renamed_<stamp>/<number>.pdf
                             ├─→ findNumber.js ──┼─→ output/Renamed_<stamp>.xlsx
input/*.html ─→ htmlText.js ─┘                   └─→ output/READ ME.txt
```

| File | What it does |
|---|---|
| `src/index.js` | Walks the input folder, drives everything, prints the summary. |
| `src/config.js` | The headings to look for, the folder names, the name rules. |
| `src/findNumber.js` | Picks which reader to use: airline parser first, then general. |
| `src/invoiceNumber.js` | The general reader - finds a number under a heading. |
| `src/rename.js` | Turns a number into a legal Windows name; stops two files clashing. |
| `src/pdfText.js` | PDF to text, by grouping the text pieces into lines by height. |
| `src/htmlText.js` | HTML to text, one line per cell. |
| `src/parsers/` | One module per airline, carried over from PDF Invoice to Excel. |
| `src/report.js` | Writes the Excel report. |
| `src/readme.js` | Writes `output\READ ME.txt`. |
| `src/errors.js` | The E-codes and what they mean. |
| `src/crash.js` | Writes a crash report when the tool itself has a bug. |

## How the number is found

Two readers, tried in order.

**1. The airline parsers.** Thirteen airlines, carried over unchanged from the
PDF Invoice to Excel tool. For those layouts they are exact: they know where on
that airline's page the number sits, even when flattening the page has split the
heading across three lines.

**2. The general reader**, `invoiceNumber.js`, for every other document. It
works down `NUMBER_LABELS` in `config.js` - "Invoice No", "Invoice Number",
"Bill No", "Credit Note No" and the rest - and for each heading looks in two
places: beside it on the same line, and on the line below it.

A parser that recognises the airline but then fails does **not** stop the file
being renamed. This tool needs one field where the Excel tool needed eleven, so
the number is usually still readable when the amounts table is not. That case
shows in the report as "the airline parser found no number".

### Adding a heading

Put it in `NUMBER_LABELS` in `src/config.js`, in the group it belongs to. It is
a regular expression fragment: `\s*` means "any spaces here", `(?:a|b)` is a
bracket group that does not capture. Do not add a capturing bracket - the finder
adds its own for the value.

`COLON_ONLY_LABELS` below it is for bare headings like `Tax Invoice`, which are
only safe when the page puts a colon after them. Without that rule the words
"TAX INVOICE" printed as a title across the top of nearly every invoice would be
read as a heading, and whatever followed would be read as the number.

### Why a value gets rejected

`rejects()` in `invoiceNumber.js` throws out anything that is clearly not an
invoice number: a date, a GST number, a PAN, a bare amount, or the first word of
the next field. Every one of those is a case that turned up in a real file - a
heading matched a little too loosely and landed on the value beside it.

**The tool never guesses.** A file it cannot read keeps its name, stays where it
is, and is listed in the report with the reason. That is deliberate: a wrongly
named invoice is worse than one that was left alone, because nobody notices it.

## Credit notes and debit notes

A credit note is a document in its own right with its own number, and is renamed
by that number exactly as an invoice is. Nothing special is needed: the parsers
return it, and `NUMBER_LABELS` has "Credit Note No" and "Debit Note No" in it.

Some airlines - Akasa and SriLankan - put **several documents in one file**: an
invoice with a debit note and a credit note against it. One file can only have
one name, so it is named after the first document, and the other numbers go in
the report's `ALSO IN THIS FILE` column. Those rows are marked `CHECK THIS`.

## Two files, one number

The second file claiming a name gets `(2)` after it, the third `(3)`, and so on.
Nothing is ever overwritten, and both rows are marked `CHECK THIS` in the report.

Usually it means the same document was put into `input` twice - a browser that
downloaded it again as `Invoice__2.pdf`. Occasionally it is two genuinely
different documents an airline gave the same number to. The report shows both so
the difference can be seen.

Windows treats `ABC.pdf` and `abc.pdf` as the same file, so the check ignores
case even though the name written does not.

## Names Windows will not take

An invoice number is not always a legal file name. `GST/2026/0041` holds
slashes; a backslash left in would be read as a folder separator and the copy
would land somewhere else entirely. `safeName()` in `rename.js` swaps those
characters for `-`, trims a trailing dot or space (Windows silently drops them,
which would quietly turn two numbers into one file), and sidesteps the reserved
DOS names like `CON`.

The report always shows **both** the number as printed and the name used, so
nothing is hidden by that swap.

## Testing

Run these from inside `code`.

```
node tests/scan-folder.mjs <folder>                    # read a folder, write nothing
node tests/scan-folder.mjs <folder> --expect-filename  # check against known-good names
node tests/scan-folder.mjs <folder> --verbose          # every file, one line each
node tests/dump-report.mjs ../output/Renamed_*.xlsx    # the report, links and all
```

`scan-folder.mjs` reads and checks without writing anything, which makes it the
thing to run after changing a heading or a reject rule.

`--expect-filename` treats each file's existing name as the right answer. Point
it at a folder that is already named by invoice number and it reports how often
the tool agrees - that is how the general reader was measured.

---

## The web version

A static page. There is no server and no API: the invoices are read by
JavaScript inside the browser tab, and the zip and the report are built there
too. Nothing is ever sent anywhere, which is the point - these are live client
invoices and the repository is public.

```
web/
    src/
        main.js         the page: drop zone, table, buttons
        engine.js       runs each file through the same readers as run.bat
        pdfBrowser.js   PDF to text in the browser
        download.js     builds the zip and the .xlsx
    public/             what Vercel serves - index.html, styles.css, and the
                        two bundles that build.mjs writes into it
```

Run these from inside `web`.

```
npm install
npm run build     writes public/app.js and public/pdf.worker.mjs
npm run dev       the same, rebuilt whenever a source file changes
```

`public/` needs serving over HTTP - opening `index.html` straight off the disk
will not work, because a module script and a worker both need a real origin.
Anything will do:

```
npx serve web/public
```

### Sharing the readers with the desktop version

`web/src/` imports straight out of `code/src/`. There is no copy of a parser
and no second set of rules; the bundler follows those imports and builds them
in. Change how a number is found and both versions change together.

Three files exist only so that sharing is possible. `code/src/pdfLines.js` and
`code/src/htmlToText.js` hold the parts that are pure - no file system, no
Node - and `code/src/pdfText.js` and `htmlText.js` are the thin Node wrappers
that read a file off the disk and hand the contents over. The browser skips the
wrappers and uses the pure parts directly.

**Do not import `index.js`, `report.js`, `readme.js` or `crash.js` from `web/`.**
Those four reach for `node:fs` and will not bundle.

### Deploying

`vercel.json` at the root has everything: the install command, the build
command, and `web/public` as the output. Import the repository on Vercel and
take the defaults - there is nothing to configure and no environment variable
to set.

It also sets a Content-Security-Policy that allows the page to load nothing but
its own files. That is worth keeping. It was tested with those headers on, not
just added at the end.

### What it scored when it was built

| Folder | Files | Read | Result |
|---|---|---|---|
| `ERP retail\output` | 330 | 316 | 316 right, 0 wrong. The 14 misses are blank templates with no number printed on them at all. |
| Airline training data | 141 | 136 | The 5 misses are 4 covering e-mails and 1 e-ticket - none of them is an invoice. |

Both folders are real client data and neither is in this repo.
