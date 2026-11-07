// osrs-sdk-assets compiles osrs-assets.config.ts with esbuild and marks its own import
// external by absolute path. On Windows that path ("D:\...") is not a valid ESM specifier,
// so the build dies with ERR_UNSUPPORTED_ESM_URL_SCHEME. Point it at a file:// URL instead.
// Idempotent; run after scripts/install-beta-sdk.sh.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("osrs-sdk-assets/package.json"));
//
// It also stops on any sound id the cache does not hold (a server-sent sound we only know by number); skip those
// with a warning instead, so one wrong id cannot sink the whole extraction.
const patches = [
  {
    broken: 'path: fileURLToPath(new URL("../dist/index.js", import.meta.url)),',
    fixed: 'path: new URL("../dist/index.js", import.meta.url).href,',
  },
  {
    broken: "const file = await cache.getFile(IndexType.SOUNDEFFECTS, id2, 0, { cacheResults: false });\n        soundEffects.push({ id: id2, bytes: Uint8Array.from(file.content) });",
    fixed: "const file = await cache.getFile(IndexType.SOUNDEFFECTS, id2, 0, { cacheResults: false }).catch(() => undefined);\n        if (!file?.content) { console.warn(`osrs-sdk-assets: no sound effect ${id2} in this cache, skipped`); continue; }\n        soundEffects.push({ id: id2, bytes: Uint8Array.from(file.content) });",
  },
];

for (const file of ["dist/cli.js", "dist/index.js"]) {
  const path = join(root, file);
  let source = await readFile(path, "utf8");
  let changed = false;
  for (const { broken, fixed } of patches) {
    if (source.includes(fixed)) continue;
    if (!source.includes(broken)) throw new Error(`patch-sdk-assets: expected code not found in ${path}`);
    source = source.replace(broken, fixed);
    changed = true;
  }
  if (changed) {
    await writeFile(path, source);
    console.log(`patch-sdk-assets: patched ${file}`);
  }
}
