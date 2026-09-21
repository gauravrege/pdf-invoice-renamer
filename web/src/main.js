// Wires the page to the engine: take files in, show what happened, hand back a
// zip and a report. All the deciding is in engine.js; this file only ever moves
// things about on screen.

import { renameAll, summarise, isReadable } from './engine.js';
import { buildZip, buildReport, save, stamp } from './download.js';

const $ = (id) => document.getElementById(id);

const el = {
  dropStage: $('dropStage'),
  drop: $('drop'),
  dropError: $('dropError'),
  fileInput: $('fileInput'),
  folderInput: $('folderInput'),
  pickFiles: $('pickFiles'),
  pickFolder: $('pickFolder'),

  runStage: $('runStage'),
  runTitle: $('runTitle'),
  runFile: $('runFile'),
  runCount: $('runCount'),
  runBar: $('runBar'),

  resultStage: $('resultStage'),
  stats: $('stats'),
  dlZip: $('dlZip'),
  dlZipText: $('dlZipText'),
  dlReport: $('dlReport'),
  startOver: $('startOver'),
  leftAloneNote: $('leftAloneNote'),
  filters: $('filters'),
  search: $('search'),
  tbody: $('tbody'),
  tableEmpty: $('tableEmpty'),
};

let rows = [];
let summary = null;
let filter = 'ALL';

// ------------------------------------------------------------------ input ---

el.drop.addEventListener('click', (e) => {
  // The two buttons inside the drop zone open different pickers; without this
  // the zone's own click would open the file one on top of them.
  if (e.target.closest('button')) return;
  el.fileInput.click();
});

el.drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    el.fileInput.click();
  }
});

el.pickFiles.addEventListener('click', () => el.fileInput.click());
el.pickFolder.addEventListener('click', () => el.folderInput.click());

el.fileInput.addEventListener('change', () => take([...el.fileInput.files]));
el.folderInput.addEventListener('change', () => take([...el.folderInput.files]));

for (const type of ['dragenter', 'dragover']) {
  el.drop.addEventListener(type, (e) => {
    e.preventDefault();
    el.drop.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) {
  el.drop.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === 'dragleave' && el.drop.contains(e.relatedTarget)) return;
    el.drop.classList.remove('over');
  });
}

el.drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  const dropped = await filesFromDrop(e.dataTransfer);
  take(dropped);
});

// The whole page accepts a drop, so a file let go just outside the dashed box
// does not navigate away from the app and lose the run.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// A dropped folder arrives as a directory entry rather than a file, so it has to
// be walked. Browsers that do not offer the entry API still give the plain file
// list, which is what the fallback uses.
async function filesFromDrop(transfer) {
  const items = [...(transfer.items || [])];
  const entries = items
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length === 0) return [...(transfer.files || [])];

  const out = [];
  await Promise.all(entries.map((entry) => walk(entry, out)));
  return out;
}

async function walk(entry, out) {
  if (entry.isFile) {
    out.push(await new Promise((res, rej) => entry.file(res, rej)));
    return;
  }
  if (!entry.isDirectory) return;

  const reader = entry.createReader();
  // readEntries hands back a batch at a time and signals the end with an empty
  // one, so it has to be called until it does.
  for (;;) {
    const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    await Promise.all(batch.map((child) => walk(child, out)));
  }
}

// ------------------------------------------------------------------- run ---

async function take(all) {
  const files = all.filter((f) => isReadable(f.name));

  if (files.length === 0) {
    show(el.dropError, all.length === 0
      ? 'No files were given.'
      : `None of those ${all.length} file(s) is a PDF or an HTML page. Those are the two this reads.`);
    return;
  }

  hide(el.dropError);
  el.dropStage.hidden = true;
  el.runStage.hidden = false;
  el.resultStage.hidden = true;
  setProgress(0, files.length, '');

  rows = await renameAll(files, async (done, total, row) => {
    setProgress(done, total, row.name);
    // Hands the thread back so the bar actually moves; without it the page
    // would sit frozen and then jump straight to the finished state.
    await new Promise((r) => setTimeout(r, 0));
  });

  summary = summarise(rows);
  el.runStage.hidden = true;
  el.resultStage.hidden = false;
  render();
  el.resultStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setProgress(done, total, name) {
  el.runBar.style.width = `${total ? (done / total) * 100 : 0}%`;
  el.runCount.textContent = `${done} of ${total}`;
  el.runFile.textContent = name;
  el.runTitle.textContent = done === total && total > 0
    ? 'Finishing up...'
    : 'Reading your invoices...';
}

// --------------------------------------------------------------- results ---

function render() {
  const left = summary.total - summary.renamed;

  el.stats.innerHTML = '';
  addStat(summary.total, 'files read', '');
  addStat(summary.renamed, 'renamed', summary.renamed > 0 ? 'good' : '');
  if (summary.clashes > 0) addStat(summary.clashes, 'share a number', 'warn');
  if (left > 0) addStat(left, 'left alone', 'bad');

  el.dlZipText.textContent = summary.renamed === 1
    ? 'Download 1 renamed file'
    : `Download ${summary.renamed} renamed files`;
  el.dlZip.disabled = summary.renamed === 0;

  if (left > 0) {
    show(el.leftAloneNote,
      `${left} file(s) could not be given a number, so they are not in the download. ` +
      'Each one is in the table below with the reason, and in the report. ' +
      'Nothing was guessed at.');
  } else {
    hide(el.leftAloneNote);
  }

  renderFilters();
  renderTable();
}

function addStat(n, label, tone) {
  const box = document.createElement('div');
  box.className = `stat ${tone}`.trim();
  const num = document.createElement('div');
  num.className = 'n';
  num.textContent = String(n);
  const key = document.createElement('div');
  key.className = 'k';
  key.textContent = label;
  box.append(num, key);
  el.stats.append(box);
}

function renderFilters() {
  const counts = {
    ALL: rows.length,
    RENAMED: rows.filter((r) => r.status === 'RENAMED').length,
    'CHECK THIS': rows.filter((r) => r.status === 'CHECK THIS').length,
    'NOT RENAMED': rows.filter((r) => r.status === 'NOT RENAMED').length,
  };

  el.filters.innerHTML = '';
  for (const [key, n] of Object.entries(counts)) {
    if (n === 0 && key !== 'ALL') continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('aria-pressed', String(filter === key));
    chip.innerHTML = `${key === 'ALL' ? 'All' : key}<span class="c">${n}</span>`;
    chip.addEventListener('click', () => {
      filter = key;
      renderFilters();
      renderTable();
    });
    el.filters.append(chip);
  }
}

const TONE = { RENAMED: 'ok', 'CHECK THIS': 'warn', 'NOT RENAMED': 'bad' };

function renderTable() {
  const needle = el.search.value.trim().toLowerCase();

  const shown = rows.filter((r) => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    if (!needle) return true;
    return `${r.name} ${r.newName} ${r.number}`.toLowerCase().includes(needle);
  });

  el.tbody.innerHTML = '';
  el.tableEmpty.hidden = shown.length > 0;

  const frag = document.createDocumentFragment();
  for (const r of shown) {
    const tr = document.createElement('tr');

    const status = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `pill ${TONE[r.status]}`;
    pill.textContent = r.status;
    status.append(pill);

    const old = cell(r.name, 'cell-old');
    const neu = cell(r.newName || '-', 'cell-new');
    const num = cell(r.number || '-', 'cell-num');
    const note = cell(r.details || '', 'cell-note');

    tr.append(status, old, neu, num, note);
    frag.append(tr);
  }
  el.tbody.append(frag);
}

function cell(text, className) {
  const td = document.createElement('td');
  td.className = className;
  td.textContent = text;
  return td;
}

el.search.addEventListener('input', renderTable);

// ------------------------------------------------------------ downloads ---

el.dlZip.addEventListener('click', async () => {
  await whileBusy(el.dlZip, 'Packing...', async () => {
    const blob = await buildZip(rows);
    save(blob, `Renamed_${stamp(summary.runDate)}.zip`);
  });
});

el.dlReport.addEventListener('click', async () => {
  await whileBusy(el.dlReport, 'Building...', async () => {
    const blob = await buildReport(rows, summary);
    save(blob, `Renamed_${stamp(summary.runDate)}.xlsx`);
  });
});

// Building a zip of a few hundred invoices takes a moment. The button says so
// rather than looking as though the click did nothing.
async function whileBusy(button, label, work) {
  const span = button.querySelector('span') || button;
  const was = span.textContent;
  button.disabled = true;
  span.textContent = label;
  try {
    await work();
  } catch (err) {
    show(el.dropError, `That could not be built: ${err.message}`);
    el.dropError.hidden = false;
    el.dropStage.hidden = false;
  } finally {
    span.textContent = was;
    button.disabled = false;
  }
}

el.startOver.addEventListener('click', () => {
  rows = [];
  summary = null;
  filter = 'ALL';
  el.search.value = '';
  el.fileInput.value = '';
  el.folderInput.value = '';
  el.resultStage.hidden = true;
  el.runStage.hidden = true;
  el.dropStage.hidden = false;
  hide(el.dropError);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function show(node, text) {
  node.textContent = text;
  node.hidden = false;
}

function hide(node) {
  node.hidden = true;
}
