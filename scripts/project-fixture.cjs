// Smoke fixtures use the production codec, including its version and integrity checks.
let codec;
async function loadCodec() {
  codec ??= (async () => {
    const { createServer } = await import("vite");
    const server = await createServer({
      configFile: false,
      root: require("node:path").resolve(__dirname, ".."),
      logLevel: "error",
      server: { middlewareMode: true, hmr: false },
    });
    try {
      return await server.ssrLoadModule("/src/shared/io.ts");
    } finally {
      await server.close();
    }
  })();
  return codec;
}
exports.encodeProject = async (project) =>
  (await loadCodec()).encodeProject(project);
exports.decodeProject = async (bytes) =>
  (await loadCodec()).decodeProject(bytes, "fixture.nbproject");
