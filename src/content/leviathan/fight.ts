import { Projectile } from "osrs-sdk";
import type { Region, Unit } from "osrs-sdk";
import { DEBRIS, ENRAGE, PATHFINDER, SEQ, SPOT, TORNADO } from "./data";
import { GroundSpot } from "./entities/effects";
import type { TileMark } from "./entities/effects";
import { Debris } from "./entities/scenery";
import { CORNER_INDICES, PATH_LOOP, cutsLoop, edgeTiles, floorTiles, inBiteReach, isFloor, reachable } from "./geometry";
import type { LeviathanPlayer, SilentWhenMissed } from "./LeviathanPlayer";
import { AbyssalPathfinder } from "./mobs/AbyssalPathfinder";
import type { BossHooks, Leviathan } from "./mobs/Leviathan";
import type { Tornado } from "./mobs/Tornado";
import { Rng } from "./rng";
import { SOUNDS } from "./sounds";
import type { FightLog, HitOutcome, HitRecord, HitSource, Protection, RunState, Tile } from "./types";
import { chebyshev, sameTile, tick, tile } from "./types";

export type FightOptions = Readonly<{
  /** Boss HP as the phase starts, as a fraction of max. */
  startFraction: number;
  seed: number;
  showAura: boolean;
  showBiteReach: boolean;
}>;

type Rock = Readonly<{ tile: Tile; droppedAt: number; landsAt: number; kind: "breaks" | "stays" }>;

/** After a hit the tornado leaves the arena and comes back on the tile it hit. */
type TornadoState = Readonly<{ kind: "chasing" } | { kind: "gone"; returnsAt: Tile; ticksLeft: number }>;

export type Tally = { prayed: number; pierced: number; unprayed: number; damageTaken: number; rocksTaken: number; tornadoTaken: number };

const key = ({ x, y }: Tile): string => `${x},${y}`;

const plusTiles = (centre: Tile): Tile[] => DEBRIS.plus.value.map(([dx, dy]) => tile(centre.x + dx, centre.y + dy)).filter(isFloor);

/** First corner, clockwise from north-west, that debris has not blocked. [WP] */
export function spawnCornerIndex(blocked: (at: Tile) => boolean): number {
  return CORNER_INDICES.find((index) => !blocked(PATH_LOOP[index])) ?? CORNER_INDICES[0];
}

/** A rock that is unprotectable damage to whoever is on its tile as it lands. */
class RockHit extends Projectile implements SilentWhenMissed {
  readonly silentWhenMissed = true;

  constructor(
    from: Leviathan,
    private readonly player: LeviathanPlayer,
    private readonly at: Tile,
    private readonly droppedAt: number,
    private readonly fight: EnrageFight,
  ) {
    super(null, 0, from, player, "crush", { setDelay: 1, visuals: { hidden: true }, hitSound: SOUNDS.rubbleImpact });
  }

  override beforeHit(): void {
    super.beforeHit();
    this.damage = sameTile(this.player.tile, this.at) ? Math.min(this.fight.rng.int(1, DEBRIS.maxHit.value), this.player.currentStats.hitpoint) : 0;
    this.fight.rockLanded(this.at, this.droppedAt, this.damage);
  }
}

/** Damage no prayer stops, reported as it lands. */
class UnprotectableHit extends Projectile {
  constructor(
    from: Unit,
    player: LeviathanPlayer,
    damage: number,
    private readonly source: "tornado" | "roar",
    private readonly launchedAt: number,
    private readonly fight: EnrageFight,
  ) {
    super(null, damage, from, player, "crush", { setDelay: 1, visuals: { hidden: true }, hitSound: source === "tornado" ? SOUNDS.tornadoImpact : undefined });
  }

  override beforeHit(): void {
    super.beforeHit();
    this.fight.unprotectableLanded(this.source, this.launchedAt, this.damage);
  }
}

const SOURCE: Readonly<Record<HitOutcome["style"], HitSource>> = { ranged: "ranged orb", magic: "magic orb", bite: "bite" };
const NEEDED: Readonly<Record<HitOutcome["style"], Protection>> = { ranged: "ranged", magic: "magic", bite: "melee" };

const HIT_NAME: Readonly<Record<HitOutcome["style"], string>> = { ranged: "A ranged orb", magic: "A magic orb", bite: "The bite" };
const PRAYER_NAME: Readonly<Record<HitOutcome["style"], string>> = { ranged: "Protect from Range", magic: "Protect from Magic", bite: "Protect from Melee" };

/** The enrage, tick by tick: the pathfinder's walk, falling debris, and when the run ends. */
export class EnrageFight implements BossHooks {
  readonly rng: Rng;
  readonly tally: Tally = { prayed: 0, pierced: 0, unprayed: 0, damageTaken: 0, rocksTaken: 0, tornadoTaken: 0 };
  private elapsed = 0;
  private tornadoState: TornadoState = { kind: "chasing" };
  private started = false;
  private state: RunState = { kind: "fighting", since: tick(0) };
  private pathIndex: number;
  private rocks: Rock[] = [];
  /** The tick the next single rock falls somewhere in the arena. */
  private nextScatterAt = 0;
  /** The tick the next '+' of blockers falls on the player. */
  private nextPlusAt = 0;
  /** Whether the player's tile was drawn blue since the last tick: what they saw as the next hits landed. */
  private onBlue = false;
  private readonly blockers = new Map<string, Debris>();
  private readonly floor = floorTiles();

  constructor(
    private readonly region: Region,
    readonly boss: Leviathan,
    readonly pathfinder: AbyssalPathfinder,
    readonly tornado: Tornado,
    readonly player: LeviathanPlayer,
    readonly options: FightOptions,
    private readonly say: (line: string) => void,
    private readonly log: (entry: FightLog) => void,
  ) {
    this.rng = new Rng(options.seed);
    if (DEBRIS.preEnrageEdges.value) for (const at of edgeTiles()) this.block(at);
    this.pathIndex = spawnCornerIndex((at) => this.blocked(at));
  }

  blocked(at: Tile): boolean {
    return this.blockers.has(key(at));
  }

  /** Whether a rock's shadow is on a tile, waiting to land. */
  fallingRockOn(at: Tile): boolean {
    return this.rocks.some((rock) => sameTile(rock.tile, at));
  }

  /** Where the pathfinder appears, and so where the player starts. */
  get spawnTile(): Tile {
    return PATH_LOOP[this.pathIndex];
  }

  /** Behind the player on the loop, counter-clockwise, so it follows them as they walk with the pathfinder. */
  get tornadoSpawnTile(): Tile {
    const behind = (this.pathIndex - TORNADO.startsBehind.value + PATH_LOOP.length) % PATH_LOOP.length;
    return PATH_LOOP[behind];
  }

  get run(): RunState {
    return this.state;
  }

  get ticks(): number {
    return this.elapsed;
  }

  /** At reset: the boss's enraged HP shows through the SDK's "get ready" countdown. */
  setUp(): void {
    this.boss.engage(this.player, this);
    this.boss.enrageAt(this.options.startFraction);
    this.pathfinder.follow(() => this.pathfinderSteps());
  }

  /** It starts walking once its spawn animation is done, and stops when the run ends. */
  private pathfinderWalks(): boolean {
    return this.started && this.state.kind === "fighting" && this.elapsed >= PATHFINDER.spawnDelayTicks.value;
  }

  /** Asked in the pathfinder's movement step, which runs before the player's hits resolve. */
  private pathfinderSteps(): readonly Tile[] {
    if (!this.pathfinderWalks()) return [];
    return Array.from({ length: PATHFINDER.tilesPerTick.value }, () => {
      this.pathIndex = (this.pathIndex + 1) % PATH_LOOP.length;
      return PATH_LOOP[this.pathIndex];
    });
  }

  /** Where the pathfinder will stand when the next tick's hits land. */
  get pathfinderNext(): Tile {
    if (!this.pathfinderWalks()) return this.pathfinder.tile;
    return PATH_LOOP[(this.pathIndex + PATHFINDER.tilesPerTick.value) % PATH_LOOP.length];
  }

  /** Whether standing on a tile now keeps the next tick's orbs prayable: the aura around the pathfinder's next step. */
  safeNextTick(at: Tile): boolean {
    return AbyssalPathfinder.auraFrom(this.pathfinderNext, at);
  }

  /** The blue tiles: in next tick's aura, out of bite reach (Protect from Melee would be needed there) and free of rocks. */
  safeToStand(at: Tile): boolean {
    return this.safeNextTick(at) && !inBiteReach(at) && !this.blocked(at) && !this.fallingRockOn(at);
  }

  /** On the first tick after the countdown, when mobs are visible and the player can act. */
  private start(): void {
    this.started = true;
    this.boss.playAnimation(SEQ.roar.value);
    this.pathfinder.appear();
    const chip = this.rng.int(0, ENRAGE.roarChip.value);
    if (chip > 0) this.player.addProjectile(new UnprotectableHit(this.boss, this.player, chip, "roar", this.elapsed, this));
    this.nextScatterAt = this.elapsed + this.gap(DEBRIS.scatterEveryTicks.value);
    this.nextPlusAt = this.elapsed + this.gap(DEBRIS.plusEveryTicks.value);
    this.say(`The Leviathan is enraged at ${this.boss.currentStats.hitpoint}/${this.boss.stats.hitpoint} HP. Stay in the pathfinder's aura and flick ranged/magic.`);
    this.onBlue = this.safeToStand(this.player.tile);
  }

  // BossHooks
  auraCovers(at: Tile): boolean {
    return this.pathfinder.auraCovers(at);
  }

  attacking(): boolean {
    return this.started && this.state.kind === "fighting" && this.elapsed >= ENRAGE.roarTicks.value;
  }

  hitLanded(outcome: HitOutcome, launchedAt: number): void {
    const damage = outcome.kind === "pierced" || outcome.kind === "unprayed" ? outcome.damage : 0;
    this.recordHit(SOURCE[outcome.style], launchedAt, this.player.tile, NEEDED[outcome.style], outcome.kind, damage);
    switch (outcome.kind) {
      case "prayed":
        this.tally.prayed++;
        return;
      case "pierced": {
        this.tally.pierced++;
        this.tally.damageTaken += outcome.damage;
        const outside = chebyshev(this.pathfinder.tile, this.player.tile) - PATHFINDER.auraRadius.value;
        if (outcome.damage > 0) this.say(`${HIT_NAME[outcome.style]} hit ${outcome.damage} through ${PRAYER_NAME[outcome.style]}: you were ${outside} ${outside === 1 ? "tile" : "tiles"} outside the pathfinder's aura.`);
        return;
      }
      case "unprayed":
        this.tally.unprayed++;
        this.tally.damageTaken += outcome.damage;
        if (outcome.damage > 0) this.say(`${HIT_NAME[outcome.style]} hit ${outcome.damage}: it needed ${PRAYER_NAME[outcome.style]}.`);
        return;
      case "cancelled":
        return;
      default: {
        const unhandled: never = outcome;
        return unhandled;
      }
    }
  }

  rockLanded(at: Tile, droppedAt: number, damage: number): void {
    this.recordHit("rock", droppedAt, at, null, damage > 0 ? "unprotectable" : "missed", damage);
    if (damage === 0) return;
    this.tally.rocksTaken += damage;
    this.say(`A falling rock hit ${damage}: step off a shadow on the tick it appears.`);
  }

  unprotectableLanded(source: "tornado" | "roar", launchedAt: number, damage: number): void {
    this.recordHit(source, launchedAt, this.player.tile, null, "unprotectable", damage);
    if (damage === 0) return;
    if (source === "tornado") this.tally.tornadoTaken += damage;
    this.say(source === "tornado" ? `The tornado hit ${damage}.` : `The roar hits ${damage}; no prayer stops it.`);
  }

  /** Called as a hit resolves: units have moved this tick, damage is not yet applied. */
  private recordHit(source: HitSource, launchedAt: number, landedOn: Tile, needed: Protection, outcome: HitRecord["outcome"], damage: number): void {
    const { player, pathfinder } = this;
    const pathfinderDistance = chebyshev(pathfinder.tile, player.tile);
    this.log({
      kind: "hit",
      hit: {
        tick: this.elapsed,
        launchedAt,
        source,
        you: player.tile,
        landedOn,
        pathfinder: pathfinder.tile,
        pathfinderDistance,
        inAura: this.auraCovers(player.tile),
        onBlue: this.onBlue,
        needed,
        praying: player.protection,
        lit: player.prayerController.prayers.filter((prayer) => prayer.isLit).map((prayer) => prayer.name),
        outcome,
        damage,
        hpAfter: Math.max(0, player.currentStats.hitpoint - damage),
      },
    });
  }

  /** Runs in Region.postTick, after every unit has acted. */
  postTick(): void {
    if (this.state.kind !== "fighting" || this.region.world.getReadyTimer > 0) return;
    if (!this.started) {
      this.start();
      return;
    }
    this.elapsed++;
    this.moveTornado();
    this.dropDebris();
    this.landRocks();
    this.checkEnd();
    this.onBlue = this.safeToStand(this.player.tile);
  }

  /** It chases the player a step at a time and hits on contact, then vanishes and comes back where it hit. */
  private moveTornado(): void {
    const state = this.tornadoState;
    switch (state.kind) {
      case "chasing":
        this.chaseWithTornado();
        return;
      case "gone":
        if (state.ticksLeft > 1) {
          this.tornadoState = { ...state, ticksLeft: state.ticksLeft - 1 };
          return;
        }
        this.tornado.setLocation({ ...state.returnsAt });
        this.region.addMob(this.tornado);
        this.tornadoState = { kind: "chasing" };
        return;
      default: {
        const unreachable: never = state;
        return unreachable;
      }
    }
  }

  private chaseWithTornado(): void {
    for (let i = 0; i < TORNADO.tilesPerTick.value; i++) {
      const next = this.tornado.nextStepToward(this.player.tile, (at) => this.blocked(at));
      if (next) this.tornado.stepTo(next);
    }
    if (!sameTile(this.tornado.tile, this.player.tile)) return;
    const { min, max } = TORNADO.damage.value;
    const damage = Math.min(this.rng.int(min, max), this.player.currentStats.hitpoint);
    this.player.addProjectile(new UnprotectableHit(this.tornado, this.player, damage, "tornado", this.elapsed, this));
    this.tornadoState = { kind: "gone", returnsAt: this.tornado.tile, ticksLeft: TORNADO.goneAfterHit.value };
    this.region.removeMob(this.tornado);
  }

  private block(at: Tile): void {
    const debris = new Debris(this.region, at);
    this.blockers.set(key(at), debris);
    this.region.addEntity(debris);
  }

  /** [WS] 'Once the Leviathan is slain, all debris on the field will be removed.' */
  private clearArena(): void {
    for (const debris of this.blockers.values()) this.region.removeEntity(debris);
    this.blockers.clear();
    this.rocks = [];
    this.region.removeMob(this.tornado);
  }

  marks(): TileMark[] {
    const marks: TileMark[] = [];
    if (this.options.showAura && this.state.kind === "fighting") {
      for (const at of this.floor) if (this.safeToStand(at)) marks.push({ tile: at, colour: 0x5ad1e6, opacity: 0.22 });
    }
    for (const rock of this.rocks) marks.push({ tile: rock.tile, colour: 0x000000, opacity: rock.landsAt - this.elapsed > 1 ? 0.7 : 0.9 });
    return marks;
  }

  private gap({ min, max }: Readonly<{ min: number; max: number }>): number {
    return this.rng.int(min, max);
  }

  /** Now and then a single rock that breaks lands a few tiles from the player; more rarely a '+' of rocks that stay. */
  private dropDebris(): void {
    if (this.elapsed >= this.nextScatterAt) {
      this.nextScatterAt = this.elapsed + this.gap(DEBRIS.scatterEveryTicks.value);
      const at = this.openTileNearPlayer(DEBRIS.scatterRange.value);
      if (at) this.dropRock(at, "breaks");
    }
    if (this.elapsed >= this.nextPlusAt) {
      this.nextPlusAt = this.elapsed + this.gap(DEBRIS.plusEveryTicks.value);
      const centre = this.plusCentreNearPlayer();
      if (centre) this.dropPlus(centre);
    }
  }

  /** A random centre for a '+' of blockers that still leaves a way all round the pool and walls no floor off. */
  private plusCentreNearPlayer(): Tile | null {
    const { min, max } = DEBRIS.plusRange.value;
    const here = this.player.tile;
    const soon = (at: Tile): boolean => this.blocked(at) || this.rocks.some((rock) => rock.kind === "stays" && sameTile(rock.tile, at));
    const open = reachable(here, soon);
    const leavesWayRound = (centre: Tile): boolean => {
      const plus = plusTiles(centre);
      const withPlus = (at: Tile): boolean => soon(at) || plus.some((p) => sameTile(p, at));
      if (cutsLoop(withPlus)) return false;
      const lost = plus.filter((p) => open.has(key(p))).length;
      return reachable(here, withPlus).size === open.size - lost;
    };
    const centres = this.floor.filter((at) => {
      const distance = chebyshev(at, here);
      return distance >= min && distance <= max && !soon(at) && !this.fallingRockOn(at) && leavesWayRound(at);
    });
    return centres.length > 0 ? centres[this.rng.int(0, centres.length - 1)] : null;
  }

  /** A random open floor tile between `min` and `max` tiles from the player; null when there is none. */
  private openTileNearPlayer({ min, max }: Readonly<{ min: number; max: number }>): Tile | null {
    const here = this.player.tile;
    const open = this.floor.filter((at) => {
      const distance = chebyshev(at, here);
      return distance >= min && distance <= max && !this.blocked(at) && !this.fallingRockOn(at);
    });
    return open.length > 0 ? open[this.rng.int(0, open.length - 1)] : null;
  }

  private dropPlus(centre: Tile): void {
    for (const at of plusTiles(centre)) this.dropRock(at, "stays");
  }

  private dropRock(at: Tile, kind: Rock["kind"]): void {
    if (this.blockers.has(key(at)) || this.fallingRockOn(at)) return;
    this.rocks.push({ tile: at, droppedAt: this.elapsed, landsAt: this.elapsed + DEBRIS.warningTicks.value, kind });
    const spot = kind === "stays" ? SPOT.debrisStays.value : SPOT.debrisFalling.value;
    this.region.addEntity(new GroundSpot(this.region, at, spot, { maxTicks: DEBRIS.warningTicks.value + 3 }));
  }

  /** A rock's hit is queued a tick before it lands; its shadow stays until it has landed. A blocker stays unless it lands on the player. */
  private landRocks(): void {
    this.rocks = this.rocks.filter((rock) => rock.landsAt > this.elapsed);
    for (const rock of this.rocks.filter((r) => r.landsAt - 1 === this.elapsed)) {
      this.player.addProjectile(new RockHit(this.boss, this.player, rock.tile, rock.droppedAt, this));
      if (rock.kind === "stays" && !sameTile(this.player.tile, rock.tile)) this.block(rock.tile);
    }
  }

  private checkEnd(): void {
    const at = tick(this.region.world.globalTickCounter);
    if (this.boss.currentStats.hitpoint <= 0) {
      this.state = { kind: "won", at, ticks: this.elapsed };
      this.pathfinder.playAnimation(SEQ.pathfinderDespawn.value);
      this.clearArena();
      this.celebrate();
      this.say(`The Leviathan is dead: ${this.elapsed} ticks (${formatTicks(this.elapsed)}). ${this.summary()}`);
    } else if (this.player.currentStats.hitpoint <= 0) {
      this.state = { kind: "lost", at, ticks: this.elapsed };
      this.say(`You died after ${this.elapsed} ticks with the Leviathan on ${this.boss.currentStats.hitpoint} HP. ${this.summary()}`);
    }
  }

  /** Cheer under the fireworks for 99 in every skill. */
  private celebrate(): void {
    this.player.stopDamage();
    this.player.interruptCombat();
    this.player.playAnimation(SEQ.cheer.value);
    this.player.addSpotAnim({ id: SPOT.levelUpMax.value, channel: "kill-fireworks" });
  }

  private summary(): string {
    const { prayed, pierced, unprayed, damageTaken, rocksTaken, tornadoTaken } = this.tally;
    return `Orbs prayed ${prayed}, pierced ${pierced}, unprayed ${unprayed}; ${damageTaken} orb/bite damage, ${rocksTaken} from rocks, ${tornadoTaken} from the tornado.`;
  }
}

export function formatTicks(ticks: number): string {
  const tenths = ticks * 6;
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
