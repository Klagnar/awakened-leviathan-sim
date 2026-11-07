export type Tick = number & { readonly brand: "tick" };

function isTick(value: number): value is Tick {
  return Number.isInteger(value) && value >= 0;
}

export function tick(value: number): Tick {
  if (!isTick(value)) throw new RangeError(`not a world tick: ${value}`);
  return value;
}

/** A tile in SDK coordinates: x east, y south. */
export type Tile = Readonly<{ x: number; y: number }> & { readonly brand?: "tile" };

export const tile = (x: number, y: number): Tile => ({ x, y });

export const sameTile = (a: Tile, b: Tile): boolean => a.x === b.x && a.y === b.y;

export const chebyshev = (a: Tile, b: Tile): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export type OrbStyle = "ranged" | "magic";

export type Protection = "melee" | "ranged" | "magic" | null;

/** What happened to one of the boss's hits as it landed. */
export type HitOutcome =
  | Readonly<{ kind: "prayed"; style: OrbStyle | "bite" }>
  | Readonly<{ kind: "pierced"; style: OrbStyle | "bite"; damage: number }>
  | Readonly<{ kind: "unprayed"; style: OrbStyle | "bite"; damage: number }>
  | Readonly<{ kind: "cancelled"; style: OrbStyle | "bite" }>;

export type HitSource = "ranged orb" | "magic orb" | "bite" | "rock" | "tornado" | "roar";

/** One hit as it landed, with what the player saw and did: for checking the simulator against the real fight. */
export type HitRecord = Readonly<{
  /** Fight ticks since the enrage started. */
  tick: number;
  launchedAt: number;
  source: HitSource;
  you: Tile;
  /** Where it struck: your tile for orbs, bites, the tornado and the roar; the shadow's tile for rocks. */
  landedOn: Tile;
  pathfinder: Tile;
  /** Chebyshev distance from the pathfinder's centre tile. */
  pathfinderDistance: number;
  inAura: boolean;
  /** Whether your tile was blue in the frames before the hit. */
  onBlue: boolean;
  needed: Protection;
  /** The protection prayer the server applied. */
  praying: Protection;
  /** Prayers lit on the panel, including clicks the server applies next tick. */
  lit: readonly string[];
  /** "missed": a rock that landed off your tile. */
  outcome: HitOutcome["kind"] | "unprotectable" | "missed";
  damage: number;
  hpAfter: number;
}>;

export type FightLog =
  | Readonly<{ kind: "run"; seed: number; bossHp: number; startHp: number }>
  | Readonly<{ kind: "hit"; hit: HitRecord }>;

export type RunState =
  | Readonly<{ kind: "fighting"; since: Tick }>
  | Readonly<{ kind: "won"; at: Tick; ticks: number }>
  | Readonly<{ kind: "lost"; at: Tick; ticks: number }>;
