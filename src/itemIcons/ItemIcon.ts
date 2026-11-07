/*
 * Ported from RuneLite's cache item sprite renderer (net.runelite.cache.item,
 * net.runelite.cache.models and net.runelite.cache.definitions.ModelDefinition
 * at commit 12f56ce214f6e05f2463bbba9d4a0d2516df742b). ModelDefinition,
 * VertexNormal and FaceNormal have no file header; RuneLite's root licence
 * covers them and is copied verbatim in RUNELITE-LICENSE beside this file.
 *
 * Copyright (c) 2017, Adam <Adam@sigterm.info>
 * Copyright (c) 2018, Adam <Adam@sigterm.info>
 * Copyright (c) 2020 Abex
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

declare const brand: unique symbol;
type Brand<B extends string> = number & { readonly [brand]: B };
type Unbranded = number & { readonly [brand]?: never };

const PRIORITIES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export type Hsl = Brand<"Hsl">;
export type Priority = (typeof PRIORITIES)[number];
type Rgb = Brand<"Rgb">;
type Pixel = Rgb | typeof TRANSPARENT;

const isHsl = (n: Unbranded): n is Unbranded & Hsl => Number.isInteger(n) && n >= 0 && n <= 0xffff;
const isRgb = (n: Unbranded): n is Unbranded & Rgb => Number.isInteger(n) && n > TRANSPARENT && n <= 0xffffff;

export function hsl(n: Unbranded): Hsl {
  if (!isHsl(n)) throw new RangeError(`not a packed HSL colour: ${n}`);
  return n;
}
export function priority(n: Unbranded): Priority {
  const known = PRIORITIES.find((p) => p === n);
  if (known === undefined) throw new RangeError(`not a face priority: ${n}`);
  return known;
}
function rgb(n: Unbranded): Rgb {
  if (!isRgb(n)) throw new RangeError(`not an opaque 0xRRGGBB colour: ${n}`);
  return n;
}

export type Vertex = Readonly<{ x: number; y: number; z: number }>;
export type Shading = "smooth" | "flat";
export type Face = Readonly<{ corners: readonly [number, number, number]; colour: Hsl; shading: Shading; priority: Priority }>;
export type IconModel = Readonly<{ vertices: readonly Vertex[]; faces: readonly Face[] }>;
export type Recolour = Readonly<{ from: Hsl; to: Hsl }>;
export type IconItem = Readonly<{
  zoom2d: number;
  xan2d: number;
  yan2d: number;
  zan2d: number;
  xOffset2d: number;
  yOffset2d: number;
  resize: Vertex;
  recolours: readonly Recolour[];
  ambient: number;
  contrast: number;
}>;
export type Sprite = Readonly<{ width: number; height: number; pixels: readonly Pixel[] }>;

const WIDTH = 36;
const HEIGHT = 32;
const CENTRE = 16;
const ZOOM = 512;
export const TRANSPARENT = 0;
const OUTLINE = rgb(0x000001);
const LIGHT: Vertex = { x: -50, y: -10, z: -50 };
const BRIGHTNESS = 0.6;

const UNIT = Math.PI / 1024;
const SINE = Array.from({ length: 2048 }, (_, i) => Math.trunc(65536 * Math.sin(i * UNIT)));
const COSINE = Array.from({ length: 2048 }, (_, i) => Math.trunc(65536 * Math.cos(i * UNIT)));

export function renderItemIcon(item: IconItem, model: IconModel): Sprite {
  const vertices = model.vertices.map(({ x, y, z }) => ({
    x: Math.trunc((x * item.resize.x) / 128),
    y: Math.trunc((item.resize.y * y) / 128),
    z: Math.trunc((item.resize.z * z) / 128),
  }));
  const faces = model.faces.map((face) => ({ ...face, colour: item.recolours.reduce((colour, { from, to }) => (colour === from ? to : colour), face.colour) }));
  const pixels = new Array<Pixel>(WIDTH * HEIGHT).fill(TRANSPARENT);
  const lit = light(vertices, faces, item.ambient + 64, item.contrast + 768);
  const screen = project(vertices, item);
  for (const { corners: [a, b, c], paint } of drawOrder(lit, screen)) fillTriangle(pixels, [screen.points[a], screen.points[b], screen.points[c]], paint);
  return crop(outline(pixels));
}

type Triple<T> = readonly [T, T, T];
type Paint = Readonly<{ kind: "gouraud"; colours: Triple<Hsl> }> | Readonly<{ kind: "flat"; rgb: Rgb }>;
type LitFace = Readonly<{ corners: readonly [number, number, number]; priority: Priority; paint: Paint }>;
type Normal = { x: number; y: number; z: number; faces: number };

function light(vertices: readonly Vertex[], faces: readonly Face[], ambient: number, contrast: number): LitFace[] {
  const vertexNormals: Normal[] = vertices.map(() => ({ x: 0, y: 0, z: 0, faces: 0 }));
  const faceNormals = faces.map(({ corners: [a, b, c], shading }) => {
    const [ab, ac] = [b, c].map((corner) => ({
      x: vertices[corner].x - vertices[a].x,
      y: vertices[corner].y - vertices[a].y,
      z: vertices[corner].z - vertices[a].z,
    }));
    let normal = { x: ab.y * ac.z - ac.y * ab.z, y: ab.z * ac.x - ac.z * ab.x, z: ab.x * ac.y - ac.x * ab.y };
    while ([normal.x, normal.y, normal.z].some((v) => v > 8192 || v < -8192)) normal = { x: normal.x >> 1, y: normal.y >> 1, z: normal.z >> 1 };
    const length = Math.max(1, Math.trunc(Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z)));
    normal = { x: Math.trunc((normal.x * 256) / length), y: Math.trunc((normal.y * 256) / length), z: Math.trunc((normal.z * 256) / length) };
    if (shading === "smooth") {
      for (const corner of [a, b, c]) {
        const sum = vertexNormals[corner];
        sum.x += normal.x;
        sum.y += normal.y;
        sum.z += normal.z;
        sum.faces++;
      }
    }
    return normal;
  });

  const scale = (Math.trunc(Math.sqrt(LIGHT.x * LIGHT.x + LIGHT.y * LIGHT.y + LIGHT.z * LIGHT.z)) * contrast) >> 8;
  const towardLight = (normal: Vertex) => LIGHT.y * normal.y + LIGHT.z * normal.z + LIGHT.x * normal.x;
  return faces.map(({ corners, colour, shading, priority }, index): LitFace => {
    switch (shading) {
      case "smooth": {
        const lit = (corner: number) => shade(colour, Math.trunc(towardLight(vertexNormals[corner]) / (scale * vertexNormals[corner].faces)) + ambient);
        return { corners, priority, paint: { kind: "gouraud", colours: [lit(corners[0]), lit(corners[1]), lit(corners[2])] } };
      }
      case "flat": {
        const lightness = Math.trunc(towardLight(faceNormals[index]) / (Math.trunc(scale / 2) + scale)) + ambient;
        return { corners, priority, paint: { kind: "flat", rgb: palette()[shade(colour, lightness)] } };
      }
      default: {
        const unhandled: never = shading;
        return unhandled;
      }
    }
  });
}

function shade(colour: Hsl, lightness: number): Hsl {
  return hsl((colour & 0xff80) + Math.min(126, Math.max(2, ((colour & 127) * lightness) >> 7)));
}

type Point = Readonly<{ x: number; y: number }>;
type Screen = Readonly<{ points: readonly Point[]; depths: readonly number[]; radius: number; diameter: number }>;

function project(vertices: readonly Vertex[], item: IconItem): Screen {
  const height = Math.max(0, ...vertices.map(({ y }) => -y));
  const bottom = Math.max(0, ...vertices.map(({ y }) => y));
  const across = Math.trunc(Math.sqrt(Math.max(0, ...vertices.map(({ x, z }) => x * x + z * z))) + 0.99);
  const radius = Math.trunc(Math.sqrt(across * across + height * height) + 0.99);
  const diameter = radius + Math.trunc(Math.sqrt(across * across + bottom * bottom) + 0.99);

  const yOffset = Math.trunc(height / 2) + ((item.zoom2d * SINE[item.xan2d]) >> 16) + item.yOffset2d;
  const zOffset = ((item.zoom2d * COSINE[item.xan2d]) >> 16) + item.yOffset2d;
  const [sinX, cosX] = [SINE[item.xan2d], COSINE[item.xan2d]];
  const eye = (sinX * yOffset + cosX * zOffset) >> 16;
  const points: Point[] = [];
  const depths: number[] = [];
  for (const vertex of vertices) {
    let { x, y, z } = vertex;
    if (item.zan2d !== 0) {
      const [sin, cos] = [SINE[item.zan2d], COSINE[item.zan2d]];
      [x, y] = [(y * sin + x * cos) >> 16, (y * cos - x * sin) >> 16];
    }
    if (item.yan2d !== 0) {
      const [sin, cos] = [SINE[item.yan2d], COSINE[item.yan2d]];
      [x, z] = [(z * sin + x * cos) >> 16, (z * cos - x * sin) >> 16];
    }
    x += item.xOffset2d;
    y += yOffset;
    z += zOffset;
    [y, z] = [(y * cosX - z * sinX) >> 16, (y * sinX + z * cosX) >> 16];
    depths.push(z - eye);
    points.push({ x: Math.trunc((x * ZOOM) / z) + CENTRE, y: Math.trunc((y * ZOOM) / z) + CENTRE });
  }
  return { points, depths, radius, diameter };
}

/** Priorities 10 and 11 interleave by depth with the 0, 3 and 5 layers as the client does. */
function drawOrder(faces: readonly LitFace[], { points, depths, radius, diameter }: Screen): LitFace[] {
  const byDistance: LitFace[][] = Array.from({ length: diameter }, () => []);
  for (const face of faces) {
    const [a, b, c] = face.corners.map((corner) => points[corner]);
    if ((a.x - b.x) * (c.y - b.y) - (c.x - b.x) * (a.y - b.y) <= 0) continue;
    const [da, db, dc] = face.corners.map((corner) => depths[corner]);
    byDistance[Math.trunc((da + db + dc) / 3) + radius].push(face);
  }

  const layers: LitFace[][] = PRIORITIES.map(() => []);
  const distanceSums = PRIORITIES.map(() => 0);
  const late: { face: LitFace; distance: number }[][] = [[], []];
  for (let distance = diameter - 1; distance >= 0; distance--) {
    for (const face of byDistance[distance]) {
      layers[face.priority].push(face);
      if (face.priority < 10) distanceSums[face.priority] += distance;
      else late[face.priority - 10].push({ face, distance });
    }
  }
  const meanDistance = (...priorities: number[]) => {
    const count = priorities.reduce((sum, p) => sum + layers[p].length, 0);
    return count > 0 ? Math.trunc(priorities.reduce((sum, p) => sum + distanceSums[p], 0) / count) : 0;
  };
  const before: Readonly<Partial<Record<number, number>>> = { 0: meanDistance(1, 2), 3: meanDistance(3, 4), 5: meanDistance(6, 8) };

  const pending = late.flat();
  const order: LitFace[] = [];
  let next = 0;
  for (let priority = 0; priority < 10; priority++) {
    const until = before[priority];
    while (until !== undefined && next < pending.length && pending[next].distance > until) order.push(pending[next++].face);
    order.push(...layers[priority]);
  }
  while (next < pending.length) order.push(pending[next++].face);
  return order;
}

const slope = (from: Point, to: Point) => (from.y === to.y ? 0 : Math.trunc(((to.x - from.x) << 14) / (to.y - from.y)));

/** Which edge is on the left when the top is flat or two slopes tie depends on which corner is topmost, so that choice follows the client case by case. */
function longEdgeOnLeft(top: number, middleIsNext: boolean, topY: number, middleY: number, long: number, short: number, lower: number): boolean {
  if (middleIsNext) return top === 2 ? long < short : (topY !== middleY && long < short) || (topY === middleY && long > lower);
  return !(top === 0 ? (topY !== middleY && short < long) || (topY === middleY && lower > long) : short < long);
}

function fillTriangle(pixels: Pixel[], corners: Triple<Point>, paint: Paint): void {
  const [p0, p1, p2] = corners;
  let colourDx = 0;
  let colourDy = 0;
  if (paint.kind === "gouraud") {
    const [c0, c1, c2] = paint.colours;
    const area = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
    if (area === 0) return;
    colourDx = Math.trunc((((c1 - c0) * (p2.y - p0.y) - (c2 - c0) * (p1.y - p0.y)) << 8) / area);
    colourDy = Math.trunc((((c2 - c0) * (p1.x - p0.x) - (c1 - c0) * (p2.x - p0.x)) << 8) / area);
  }

  const top = p0.y <= p1.y && p0.y <= p2.y ? 0 : p1.y <= p2.y ? 1 : 2;
  const [t, n, p] = [corners[top], corners[(top + 1) % 3], corners[(top + 2) % 3]];
  if (t.y >= HEIGHT) return;
  const [nextY, previousY] = [Math.min(n.y, HEIGHT), Math.min(p.y, HEIGHT)];
  const middleIsNext = nextY < previousY;
  const [middle, bottom] = middleIsNext ? [n, p] : [p, n];
  const bottomY = middleIsNext ? previousY : nextY;
  let middleY = middleIsNext ? nextY : previousY;
  const [longSlope, shortSlope, lowerSlope] = [slope(t, bottom), slope(t, middle), slope(middle, bottom)];

  let colour = paint.kind === "gouraud" ? colourDx + ((paint.colours[top] << 8) - t.x * colourDx) : 0;
  let [long, short, lower] = [t.x << 14, t.x << 14, middle.x << 14];
  let topY = t.y;
  if (topY < 0) {
    long -= topY * longSlope;
    short -= topY * shortSlope;
    colour -= topY * colourDy;
    topY = 0;
  }
  if (middleY < 0) {
    lower -= lowerSlope * middleY;
    middleY = 0;
  }

  const onLeft = longEdgeOnLeft(top, middleIsNext, topY, middleY, longSlope, shortSlope, lowerSlope);
  const span = (y: number, a: number, b: number) => {
    const [from, to] = onLeft ? [a >> 14, b >> 14] : [b >> 14, a >> 14];
    const row = y * WIDTH;
    for (let x = Math.max(0, from); x < Math.min(WIDTH, to); x++) {
      pixels[row + x] = paint.kind === "gouraud" ? palette()[(colour + x * colourDx) >> 8] : paint.rgb;
    }
  };
  let y = topY;
  for (; y < middleY; y++, long += longSlope, short += shortSlope, colour += colourDy) span(y, long, short);
  for (; y < bottomY; y++, long += longSlope, lower += lowerSlope, colour += colourDy) span(y, long, lower);
}

function outline(pixels: readonly Pixel[]): Pixel[] {
  return pixels.map((pixel, i) => {
    if (pixel !== TRANSPARENT) return pixel;
    const [x, y] = [i % WIDTH, Math.trunc(i / WIDTH)];
    const touches = (x > 0 && pixels[i - 1] !== TRANSPARENT) || (y > 0 && pixels[i - WIDTH] !== TRANSPARENT) || (x < WIDTH - 1 && pixels[i + 1] !== TRANSPARENT) || (y < HEIGHT - 1 && pixels[i + WIDTH] !== TRANSPARENT);
    return touches ? OUTLINE : TRANSPARENT;
  });
}

function crop(pixels: readonly Pixel[]): Sprite {
  const drawn = Array.from(pixels.keys()).filter((i) => pixels[i] !== TRANSPARENT);
  if (drawn.length === 0) throw new Error("the model drew no pixels");
  const xs = drawn.map((i) => i % WIDTH);
  const ys = drawn.map((i) => Math.trunc(i / WIDTH));
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  const [width, height] = [Math.max(...xs) - left + 1, Math.max(...ys) - top + 1];
  const rows = Array.from({ length: height }, (_, y) => pixels.slice((top + y) * WIDTH + left, (top + y) * WIDTH + left + width));
  return { width, height, pixels: rows.flat() };
}

let cachedPalette: readonly Rgb[] | null = null;

function palette(): readonly Rgb[] {
  cachedPalette ??= Array.from({ length: 65536 }, (_, packed) => hslToRgb(hsl(packed)));
  return cachedPalette;
}

function hslToRgb(colour: Hsl): Rgb {
  const hue = ((colour >> 10) & 63) / 64 + 0.5 / 64;
  const saturation = ((colour >> 7) & 7) / 8 + 0.5 / 8;
  const luminance = (colour & 127) / 128;
  const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
  const base = luminance - chroma / 2;
  const [r, g, b] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][Math.trunc(hue * 6)].map((add) => Math.trunc((base + add) * 256));
  const bright = (channel: number) => Math.trunc(Math.pow(channel / 256, BRIGHTNESS) * 256);
  const value = (bright(r) << 16) | (bright(g) << 8) | bright(b);
  return value === TRANSPARENT ? OUTLINE : rgb(value);
}
