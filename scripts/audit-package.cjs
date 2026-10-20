const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const builderRequire = createRequire(require.resolve('electron-builder'));
const asar = createRequire(builderRequire.resolve('app-builder-lib'))('@electron/asar');
const version = require('../package.json').version;
const root = path.resolve(process.argv[2] || `../deliverables/PomeleneNoteblockEditor-${version}/win-unpacked`);
const archive = path.join(root, 'resources/app.asar');
const entries = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
assert(!entries.some(name => /(^|\/)(node_modules|tests|test-results|scripts|src)(\/|$)|\.map$/.test(name)),
  'Development files leaked into the application');
assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, version);
const locales = fs.readdirSync(path.join(root, 'locales')).sort();
assert.deepEqual(locales, ['en-US.pak', 'zh-CN.pak', 'zh-TW.pak']);
function files(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    assert(!fs.lstatSync(file).isSymbolicLink(), 'Unexpected package link');
    return entry.isDirectory() ? files(file) : [file];
  });
}
const assets = path.resolve('src/renderer/public');
const unchangedAssets = files(assets).map(file => {
  const relative = path.relative(assets, file).replaceAll('\\', '/');
  assert(fs.readFileSync(file).equals(asar.extractFile(archive, path.join('out', 'renderer', relative))),
    `Changed or missing asset: ${relative}`);
  return relative;
});
const report = { version, archiveBytes: fs.statSync(archive).size,
  installedFileBytes: files(root).reduce((total, file) => total + fs.statSync(file).size, 0),
  locales, unchangedAssets, developmentFilesExcluded: true };
console.log(JSON.stringify(report, null, 2));
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
