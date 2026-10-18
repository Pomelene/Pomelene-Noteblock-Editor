const path = require("node:path");
const { pathToFileURL } = require("node:url");
(async () => {
  const { build } = await import("vite");
  const root = path.resolve(__dirname, ".."),
    out = path.resolve(root, "test-results/analyzer");
  if (!out.startsWith(path.join(root, "test-results") + path.sep))
    throw Error("Unsafe analysis output path");
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      ssr: path.join(__dirname, "analyze-nbs.ts"),
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
