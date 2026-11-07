// Cloudflare Pages serves files up to 25 MiB, and phase 3's body is ~33 MB. Split every asset over the limit into
// <file>.part0, <file>.part1, ... and list them in osrs-assets/split-assets.json; src/splitAssets.ts joins them back
// in the browser, so the SDK still sees the whole file (its length and CRC checks run on the joined bytes).
// Also writes dist/_headers so the hashed asset files are cached as immutable. Run after `npm run build`.
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PART_BYTES = 24 * 1024 * 1024;
const assets = join("dist", "osrs-assets");

const splits = {};
for (const name of await readdir(assets)) {
  if (!/\.(bin|soundpack)$/.test(name)) continue;
  const path = join(assets, name);
  if ((await stat(path)).size <= PART_BYTES) continue;
  const bytes = await readFile(path);
  const parts = Math.ceil(bytes.length / PART_BYTES);
  for (let i = 0; i < parts; i++) {
    await writeFile(`${path}.part${i}`, bytes.subarray(i * PART_BYTES, (i + 1) * PART_BYTES));
  }
  await rm(path);
  splits[name] = parts;
  console.log(`pages-postbuild: split ${name} (${bytes.length} bytes) into ${parts} parts`);
}
await writeFile(join(assets, "split-assets.json"), JSON.stringify(splits));

// Pages allows one * per rule, so each part gets its own exact rule.
const immutable = [
  "/osrs-assets/*.bin",
  "/osrs-assets/*.soundpack",
  ...Object.entries(splits).flatMap(([name, parts]) => Array.from({ length: parts }, (_, i) => `/osrs-assets/${name}.part${i}`)),
];
await writeFile(
  join("dist", "_headers"),
  immutable.map((path) => `${path}\n  Cache-Control: public, max-age=31536000, immutable\n`).join(""),
);
