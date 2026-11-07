import type { Tile } from "./types";
import { chebyshev, tile } from "./types";
import type { Fact } from "./data";

/**
 * The arena floor, read from region 8291's map in cache 2499. The platform is a bridge: plane 1 tiles flagged as such
 * replace plane 0, so walkability is plane 1's "blocked" flag, flood-filled from the platform. `.` is floor, `#` is not,
 * `L` is the Leviathan's 7x7 pool (the ring of `#` round it is the pool's rim). Row 0 is the northernmost row.
 * SDK tile = (region x, 63 - region y) because the compiled scene sits at the SDK origin.
 */
const ARENA_ROWS = [
  "##############...######",
  "#####...#####......####",
  "##..................###",
  "##...................##",
  "##...................##",
  "##...................##",
  "#....................##",
  "#.......#######.......#",
  "#......#LLLLLLL#......#",
  "#......#LLLLLLL#......#",
  "#......#LLLLLLL#.......",
  ".......#LLLLLLL#.......",
  ".......#LLLLLLL#.......",
  ".......#LLLLLLL#.......",
  "#......#LLLLLLL#......#",
  "#.......#######......##",
  "#....................##",
  "##...................##",
  "##...................##",
  "##...................##",
  "###..........####...###",
  "######.....############",
] as const;

const ARENA_ORIGIN = tile(22, 16);

export const REGION_SIZE = 64;

const key = ({ x, y }: Tile): string => `${x},${y}`;

const FLOOR = new Set<string>();
const POOL_TILES: Tile[] = [];
ARENA_ROWS.forEach((row, dy) => {
  [...row].forEach((cell, dx) => {
    const at = tile(ARENA_ORIGIN.x + dx, ARENA_ORIGIN.y + dy);
    if (cell === ".") FLOOR.add(key(at));
    if (cell === "L") POOL_TILES.push(at);
  });
});

export const isFloor = (at: Tile): boolean => FLOOR.has(key(at));

export function floorTiles(): Tile[] {
  return [...FLOOR].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return tile(x, y);
  });
}

/** The pool's corners in SDK coordinates (y grows southward). */
export const POOL = {
  west: Math.min(...POOL_TILES.map((t) => t.x)),
  east: Math.max(...POOL_TILES.map((t) => t.x)),
  north: Math.min(...POOL_TILES.map((t) => t.y)),
  south: Math.max(...POOL_TILES.map((t) => t.y)),
} as const;

/** The SDK anchors a multi-tile unit at its south-west tile. */
export const BOSS_ANCHOR = tile(POOL.west, POOL.south);

/** Chebyshev distance from a tile to the pool (0 inside it). */
export function distanceToPool(at: Tile): number {
  const dx = Math.max(POOL.west - at.x, 0, at.x - POOL.east);
  const dy = Math.max(POOL.north - at.y, 0, at.y - POOL.south);
  return Math.max(dx, dy);
}

/** Floor tiles next to (diagonals included) a wall of the arena, as opposed to the pool's rim. */
export function edgeTiles(): Tile[] {
  const touchesWall = (at: Tile): boolean => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const next = tile(at.x + dx, at.y + dy);
        if (!isFloor(next) && distanceToPool(next) > 1) return true;
      }
    }
    return false;
  };
  return floorTiles().filter(touchesWall);
}

const AROUND: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Open floor a player can walk to from `from` round `blocked` tiles; a diagonal step needs both tiles beside it open. */
export function reachable(from: Tile, blocked: (at: Tile) => boolean): Set<string> {
  const open = (at: Tile): boolean => isFloor(at) && !blocked(at);
  const seen = new Set([key(from)]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const [dx, dy] of AROUND) {
      const next = tile(at.x + dx, at.y + dy);
      if (seen.has(key(next)) || !open(next) || !open(tile(at.x + dx, at.y)) || !open(tile(at.x, at.y + dy))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Whether `blocked` floor tiles join the pool's rim to the arena wall, so there is no way all round the pool. Tiles that
 * touch diagonally join, as no one can step between them.
 */
export function cutsLoop(blocked: (at: Tile) => boolean): boolean {
  const queue = arenaTiles().filter((at) => !isFloor(at) && distanceToPool(at) <= 1);
  const seen = new Set(queue.map(key));
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const [dx, dy] of AROUND) {
      const next = tile(at.x + dx, at.y + dy);
      if (seen.has(key(next))) continue;
      if (!isFloor(next) && distanceToPool(next) > 1) return true;
      if (!isFloor(next) || !blocked(next)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return false;
}

/** Every tile of the arena map, floor or not. */
function arenaTiles(): Tile[] {
  return ARENA_ROWS.flatMap((row, dy) => [...row].map((_, dx) => tile(ARENA_ORIGIN.x + dx, ARENA_ORIGIN.y + dy)));
}

/**
 * [WS] The bite reaches "directly next to the pool (including diagonal tiles)". The pool's edge is the one-tile rim
 * round it, so that is floor within two tiles of the pool (which also takes in the rim's open corners).
 */
export const inBiteReach = (at: Tile): boolean => isFloor(at) && distanceToPool(at) <= 2;

export const PATH_RING: Fact<number> = {
  value: 4,
  trust: "unverified",
  source: "[WP] spawns north-west and walks clockwise; how far from the pool it walks is not documented. 4 keeps its 7x7 aura across the 7-wide platform",
};

/** The four corners of the pathfinder's loop, clockwise from north-west. */
export const PATH_CORNERS: readonly [Tile, Tile, Tile, Tile] = [
  tile(POOL.west - PATH_RING.value, POOL.north - PATH_RING.value),
  tile(POOL.east + PATH_RING.value, POOL.north - PATH_RING.value),
  tile(POOL.east + PATH_RING.value, POOL.south + PATH_RING.value),
  tile(POOL.west - PATH_RING.value, POOL.south + PATH_RING.value),
];

/** Every tile of the loop in walking order, starting on the north-west corner. */
export const PATH_LOOP: readonly Tile[] = (() => {
  const loop: Tile[] = [];
  PATH_CORNERS.forEach((from, i) => {
    const to = PATH_CORNERS[(i + 1) % PATH_CORNERS.length];
    const steps = chebyshev(from, to);
    for (let s = 0; s < steps; s++) {
      loop.push(tile(from.x + Math.sign(to.x - from.x) * s, from.y + Math.sign(to.y - from.y) * s));
    }
  });
  return loop;
})();

/** Index in PATH_LOOP of each spawn corner, in the clockwise order the pathfinder tries them. */
export const CORNER_INDICES: readonly number[] = PATH_CORNERS.map((corner) => PATH_LOOP.findIndex((t) => t.x === corner.x && t.y === corner.y));
