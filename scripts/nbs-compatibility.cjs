const path = require("node:path");
const { pathToFileURL } = require("node:url");
(async () => {
  const { build } = await import("vite");
  const root = path.resolve(__dirname, ".."),
    out = path.join(root, "test-results/nbs-compatibility");
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      ssr: path.join(__dirname, "nbs-compatibility.ts"),
      outDir: out,
      emptyOutDir: false,
      rollupOptions: { output: { format: "es", entryFileNames: "index.mjs" } },
    },
  });
  await import(pathToFileURL(path.join(out, "index.mjs")).href);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
