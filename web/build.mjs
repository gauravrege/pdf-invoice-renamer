// Builds the site into public/, which is what Vercel serves.
//
//   npm run build        once
//   npm run dev          rebuild whenever a source file changes
//
// Two bundles come out, not one. pdf.js does its reading on a background thread
// so a folder of invoices does not freeze the page, and a worker has to be its
// own file for the browser to start it.

import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022', 'chrome111', 'edge111', 'firefox113', 'safari16.4'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
};

const builds = [
  { ...common, entryPoints: ['src/main.js'], outfile: 'public/app.js' },
  {
    ...common,
    entryPoints: ['node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    outfile: 'public/pdf.worker.mjs',
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('watching src/ - press Ctrl+C to stop');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
