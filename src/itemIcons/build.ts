import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import config from "../../osrs-assets.config";
import { ITEM_ICON_DIR, ITEM_ICON_IDS, itemIconFile } from "../assets";
import { TRANSPARENT, hsl, priority, renderItemIcon } from "./ItemIcon";
import type { Face, IconItem, IconModel, Shading, Sprite } from "./ItemIcon";

const ROOT = resolve(__dirname, "../..");
const USAGE = "usage: item-icons --cache-dir <OpenRS2 cache directory> --reader-path <osrscachereader checkout>";

type Cache = Readonly<{ item(id: number): Promise<unknown>; model(id: number): Promise<unknown>; close(): void }>;

async function main(args: readonly string[]): Promise<void> {
  const { cacheDir, readerPath } = parseArgs(args);
  // osrs-sdk-assets keeps each OpenRS2 cache it downloads at <cache-dir>/<id>/cache.
  const cache = await openCache(resolve(ROOT, readerPath), resolve(ROOT, cacheDir, String(config.cache.openrs2), "cache"));
  try {
    const out = resolve(ROOT, config.outDir);
    rmSync(resolve(out, ITEM_ICON_DIR), { recursive: true, force: true });
    mkdirSync(resolve(out, ITEM_ICON_DIR), { recursive: true });
    for (const id of ITEM_ICON_IDS) {
      const { inventoryModel, icon } = parseItem(id, await cache.item(id));
      const sprite = renderItemIcon(icon, parseModel(id, await cache.model(inventoryModel)));
      const file = resolve(out, itemIconFile(id));
      writeFileSync(file, png(sprite));
      console.log(`item-icons: ${id} ${sprite.width}x${sprite.height} -> ${file}`);
    }
  } finally {
    cache.close();
  }
}

function parseArgs(args: readonly string[]): Readonly<{ cacheDir: string; readerPath: string }> {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (!["--cache-dir", "--reader-path"].includes(flag) || value === undefined || value.startsWith("--")) throw new Error(`${flag}: ${USAGE}`);
    values.set(flag, value);
  }
  const cacheDir = values.get("--cache-dir");
  const readerPath = values.get("--reader-path");
  if (cacheDir === undefined || readerPath === undefined) throw new Error(USAGE);
  return { cacheDir, readerPath };
}

function field(value: unknown, key: string): unknown {
  return (typeof value === "object" || typeof value === "function") && value !== null ? Reflect.get(value, key) : undefined;
}

const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

async function openCache(readerPath: string, cachePath: string): Promise<Cache> {
  const reader: unknown = await import(pathToFileURL(resolve(readerPath, "src/index.js")).href);
  const RSCache = field(reader, "RSCache");
  if (typeof RSCache !== "function") throw new Error(`${readerPath} does not export RSCache`);
  const id = (...path: string[]) => {
    const value = path.reduce(field, reader);
    if (!isInteger(value)) throw new Error(`${readerPath} has no ${path.join(".")}`);
    return value;
  };
  const [configs, models, items] = [id("IndexType", "CONFIGS", "id"), id("IndexType", "MODELS", "id"), id("ConfigType", "ITEM", "id")];
  const cache: unknown = Reflect.construct(RSCache, [cachePath]);
  await field(cache, "onload");
  const call = (method: string, ...args: readonly number[]): unknown => {
    const fn = field(cache, method);
    if (typeof fn !== "function") throw new Error(`the cache reader has no ${method}`);
    return Reflect.apply(fn, cache, args);
  };
  return {
    item: async (itemId) => call("getDef", configs, items, itemId),
    model: async (modelId) => call("getDef", models, modelId),
    close: () => void call("close"),
  };
}

function integers(owner: string, value: unknown, length?: number): number[] {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length) || !value.every(isInteger)) throw new Error(`${owner} is not ${length ?? "a list of"} integers`);
  return value;
}

function perFace(owner: string, value: unknown, faces: number): number[] | null {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0) ? null : integers(owner, value, faces);
}

function parseItem(id: number, value: unknown): Readonly<{ inventoryModel: number; icon: IconItem }> {
  const int = (key: string) => {
    const v = field(value, key);
    if (!isInteger(v)) throw new Error(`item ${id} ${key} is not an integer`);
    return v;
  };
  const optional = (key: string) => (field(value, key) === undefined ? 0 : int(key));
  if (int("notedTemplate") !== -1) throw new Error(`item ${id} is a noted item, which has no model of its own to draw`);
  const from = integers(`item ${id} recolorToFind`, field(value, "recolorToFind"));
  const to = integers(`item ${id} recolorToReplace`, field(value, "recolorToReplace"), from.length);
  return {
    inventoryModel: int("inventoryModel"),
    icon: {
      zoom2d: int("zoom2d"),
      xan2d: int("xan2d"),
      yan2d: int("yan2d"),
      zan2d: int("zan2d"),
      xOffset2d: int("xOffset2d"),
      yOffset2d: int("yOffset2d"),
      resize: { x: int("resizeX"), y: int("resizeY"), z: int("resizeZ") },
      recolours: from.map((colour, i) => ({ from: hsl(colour), to: hsl(to[i]) })),
      ambient: optional("ambient"),
      contrast: optional("contrast"),
    },
  };
}

const SHADING: Readonly<Partial<Record<number, Shading>>> = { 0: "smooth", 1: "flat" };

function parseModel(itemId: number, value: unknown): IconModel {
  const owner = (key: string) => `item ${itemId} model ${key}`;
  const count = (key: string) => {
    const v = field(value, key);
    if (!isInteger(v) || v < 0) throw new Error(`${owner(key)} is not a count`);
    return v;
  };
  const [vertexCount, faceCount] = [count("vertexCount"), count("faceCount")];
  const [xs, ys, zs] = ["vertexPositionsX", "vertexPositionsY", "vertexPositionsZ"].map((key) => integers(owner(key), field(value, key), vertexCount));
  const [as, bs, cs] = ["faceVertexIndices1", "faceVertexIndices2", "faceVertexIndices3"].map((key) => integers(owner(key), field(value, key), faceCount));
  const colours = integers(owner("faceColors"), field(value, "faceColors"), faceCount).map(hsl);
  const types = perFace(owner("faceRenderTypes"), field(value, "faceRenderTypes"), faceCount);
  const priorities = (perFace(owner("faceRenderPriorities"), field(value, "faceRenderPriorities"), faceCount) ?? new Array<number>(faceCount).fill(count("priority"))).map(priority);
  // The renderer has no blending: faces at least half transparent (cache alpha 0 is opaque, 255 invisible) are left out
  // and the rest are drawn opaque, so a bow's translucent glow does not hide the bow.
  const alphas = perFace(owner("faceAlphas"), field(value, "faceAlphas"), faceCount);
  if (perFace(owner("faceTextures"), field(value, "faceTextures"), faceCount)?.some((texture) => texture !== -1)) throw new Error(`${owner("faceTextures")}: textured faces are not drawn by this renderer`);

  const faces = colours.flatMap((colour, i): Face[] => {
    if ((alphas?.[i] ?? 0) >= 128) return [];
    const corners: Face["corners"] = [as[i], bs[i], cs[i]];
    const shading = SHADING[types?.[i] ?? 0];
    if (shading === undefined) throw new Error(`${owner("faceRenderTypes")}: face ${i} has render type ${types?.[i]}, which this renderer does not draw`);
    if (corners.some((corner) => corner < 0 || corner >= vertexCount)) throw new Error(`${owner("faceVertexIndices")}: face ${i} names a missing vertex`);
    return [{ corners, colour, shading, priority: priorities[i] }];
  });
  return { vertices: xs.map((x, i) => ({ x, y: ys[i], z: zs[i] })), faces };
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function png({ width, height, pixels }: Sprite): Buffer {
  const rows = Buffer.alloc(height * (1 + width * 4));
  pixels.forEach((pixel, i) => {
    const at = Math.trunc(i / width) * (1 + width * 4) + 1 + (i % width) * 4;
    if (pixel !== TRANSPARENT) rows.set([pixel >> 16, (pixel >> 8) & 255, pixel & 255, 255], at);
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6], 8);
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const framed = Buffer.alloc(body.length + 8);
  framed.writeUInt32BE(data.length, 0);
  body.copy(framed, 4);
  framed.writeUInt32BE(crc32(body), body.length + 4);
  return framed;
}

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
