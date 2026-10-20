const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const { build } = await import('vite');
  const out = path.resolve(__dirname, '../test-results/core-benchmark');
  await build({ configFile: false, logLevel: 'error', build: {
    ssr: path.join(__dirname, 'benchmark-core.ts'), outDir: out, emptyOutDir: false,
    rollupOptions: { output: { format: 'es', entryFileNames: 'index.mjs' } },
  } });
  await import(pathToFileURL(path.join(out, 'index.mjs')).href);
})().catch(error => { console.error(error); process.exitCode = 1; });
