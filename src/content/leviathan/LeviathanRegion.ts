import { CardinalDirection, ControlPanelController, InvisibleMovementBlocker, Region, TileMarker } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import { TileMarks } from "./entities/effects";
import { ArenaScene } from "./entities/scenery";
import { EnrageFight } from "./fight";
import type { FightOptions } from "./fight";
import { POOL, REGION_SIZE, floorTiles, inBiteReach, isFloor } from "./geometry";
import { LeviathanPlayer } from "./LeviathanPlayer";
import { dress, prepare } from "./loadout";
import { AbyssalPathfinder } from "./mobs/AbyssalPathfinder";
import { Leviathan } from "./mobs/Leviathan";
import { Tornado } from "./mobs/Tornado";
import { tile } from "./types";
import type { FightLog } from "./types";

/** Outlines the tiles the boss can bite, like RuneLite tile markers; not saved with the player's own markers. */
const MELEE_MARKER_COLOUR = "#ff3b30";

/** Every non-floor tile one step outside the floor, so the player cannot walk off the platform. */
function arenaEdge(): { x: number; y: number }[] {
  const edge = new Map<string, { x: number; y: number }>();
  for (const at of floorTiles()) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const next = tile(at.x + dx, at.y + dy);
        const inPool = next.x >= POOL.west && next.x <= POOL.east && next.y >= POOL.north && next.y <= POOL.south;
        if (!isFloor(next) && !inPool) edge.set(`${next.x},${next.y}`, { x: next.x, y: next.y });
      }
    }
  }
  return [...edge.values()];
}

export class LeviathanRegion extends Region {
  private fight: EnrageFight | null = null;
  private readonly lines: string[] = [];
  private readonly logListeners = new Set<(entry: FightLog) => void>();

  constructor(private readonly options: FightOptions) {
    super();
  }

  override getName(): string {
    return "Awakened Leviathan (enraged)";
  }

  override get width(): number {
    return REGION_SIZE;
  }

  override get height(): number {
    return REGION_SIZE;
  }

  override get initialFacing(): CardinalDirection {
    return CardinalDirection.EAST;
  }

  override drawDefaultFloor(): boolean {
    return false;
  }

  override drawWorldBackground(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    for (const { x, y } of floorTiles()) {
      context.fillStyle = (x + y) % 2 === 0 ? "#34413f" : "#2d3836";
      context.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  initialiseRegion(): { player: Player } {
    const say = (line: string): void => {
      this.lines.push(line);
    };
    const boss = new Leviathan(this);
    const pathfinder = new AbyssalPathfinder(this, tile(0, 0));
    const tornado = new Tornado(this, tile(0, 0));
    const player = new LeviathanPlayer(this, { x: 0, y: 0 }, say);
    const fight = new EnrageFight(this, boss, pathfinder, tornado, player, this.options, say, (entry) => this.emit(entry));
    pathfinder.setLocation({ ...fight.spawnTile });
    player.setLocation({ ...fight.spawnTile });
    tornado.setLocation({ ...fight.tornadoSpawnTile });
    dress(player);

    this.addEntity(new ArenaScene(this));
    for (const edge of arenaEdge()) this.addEntity(new InvisibleMovementBlocker(this, edge));
    this.addEntity(new TileMarks(this, () => fight.marks()));
    if (this.options.showBiteReach) {
      for (const at of floorTiles().filter(inBiteReach)) this.addEntity(new TileMarker(this, at, MELEE_MARKER_COLOUR, 1, false));
    }
    this.addPlayer(player);
    this.addMob(boss);
    this.addMob(pathfinder);
    this.addMob(tornado);
    this.setBoss(boss);
    this.fight = fight;
    return { player };
  }

  /** Region.reset rewrites unit stats after initialiseRegion, so the enrage HP and prayers go on after it; the prayer tab opens. */
  override reset(startWorld = true): { player: Player } {
    this.lines.length = 0;
    const result = super.reset(false);
    if (this.fight) {
      prepare(this.fight.player);
      ControlPanelController.controller.setActiveControl("PRAYER");
      this.fight.setUp();
      const { boss, player, options } = this.fight;
      this.emit({ kind: "run", seed: options.seed, bossHp: boss.currentStats.hitpoint, startHp: player.currentStats.hitpoint });
    }
    if (startWorld) this.world.startTicking();
    return result;
  }

  override postTick(): void {
    super.postTick();
    this.fight?.postTick();
  }

  current(): EnrageFight | null {
    return this.fight;
  }

  chat(): readonly string[] {
    return [...this.lines];
  }

  /** Every run start and every hit, across restarts. Returns the unsubscribe. */
  onLog(listener: (entry: FightLog) => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private emit(entry: FightLog): void {
    for (const listener of this.logListeners) listener(entry);
  }
}
