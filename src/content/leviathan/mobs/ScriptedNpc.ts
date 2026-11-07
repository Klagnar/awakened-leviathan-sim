import { Mob } from "osrs-sdk";
import type { Region } from "osrs-sdk";
import type { Tile } from "../types";
import { tile } from "../types";

/** An NPC the fight moves by hand: it cannot be attacked, takes no space, and walks where it is told. */
export abstract class ScriptedNpc extends Mob {
  private stepsThisTick = 0;

  constructor(region: Region, at: Tile) {
    super(region, { x: at.x, y: at.y });
  }

  get tile(): Tile {
    return tile(this.location.x, this.location.y);
  }

  stepTo(next: Tile): void {
    this.lastRotation = -Math.atan2(next.y - this.location.y, next.x - this.location.x) - Math.PI / 2;
    this.location = { x: next.x, y: next.y };
    this.visualPath.push({ x: next.x, y: next.y, run: false });
    this.visualMovementActive = true;
    this.stepsThisTick++;
    this.region.refreshUnitChunk(this);
  }

  override get combatLevel(): number {
    return 0;
  }

  override setStats(): void {
    this.stats = { attack: 1, strength: 1, defence: 1, range: 1, magic: 1, hitpoint: 1 };
    this.currentStats = { ...this.stats };
    this.weapons = {};
  }

  override get size(): number {
    return 1;
  }

  override canBeAttacked(): boolean {
    return false;
  }

  override get consumesSpace(): boolean {
    return false;
  }

  override contextActions(): ReturnType<Mob["contextActions"]> {
    return [];
  }

  override movementStep(): void {
    if (this.stepsThisTick === 0 && this.visualPath.length === 0) this.visualMovementActive = false;
    this.stepsThisTick = 0;
  }

  override attackIfPossible(): void {}

  override detectDeath(): void {}
}
