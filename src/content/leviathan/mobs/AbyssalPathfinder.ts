import { CacheRenderModel, CacheRenderReferences } from "osrs-sdk";
import type { Model } from "osrs-sdk";
import { NPC, PATHFINDER, SEQ, SPOT } from "../data";
import type { Tile } from "../types";
import { chebyshev } from "../types";
import { ScriptedNpc } from "./ScriptedNpc";

/**
 * [WP] The abyssal pathfinder: it appears at the start of the enrage and walks clockwise round the pool. Players
 * inside its aura hit perfectly accurately and can pray against the boss. It cannot be attacked or blocked.
 *
 * It walks in the NPC part of the tick, before the boss's hits on the player resolve, so each hit is judged against
 * the tile it has just stepped onto.
 */
export class AbyssalPathfinder extends ScriptedNpc {
  private nextSteps: () => readonly Tile[] = () => [];

  /** The fight decides where it goes; it asks once a tick, in its movement step. */
  follow(nextSteps: () => readonly Tile[]): void {
    this.nextSteps = nextSteps;
  }

  /** Whether its 7x7 aura would cover a tile with the pathfinder standing at `from`. */
  static auraFrom(from: Tile, at: Tile): boolean {
    return chebyshev(from, at) <= PATHFINDER.auraRadius.value;
  }

  auraCovers(at: Tile): boolean {
    return AbyssalPathfinder.auraFrom(this.tile, at);
  }

  override movementStep(): void {
    for (const next of this.nextSteps()) this.stepTo(next);
    super.movementStep();
  }

  appear(): void {
    this.playAnimation(SEQ.pathfinderSpawn.value);
    this.addSpotAnim({ id: SPOT.pathfinderSpawn.value, channel: "pathfinder-spawn" });
  }

  override mobName(): string {
    return "Abyssal pathfinder";
  }

  override get idlePoseId(): number {
    return SEQ.pathfinderIdle.value;
  }

  override get walkingPoseId(): number {
    return SEQ.pathfinderIdle.value;
  }

  override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(NPC.pathfinder.value), { spotAnims: [SPOT.pathfinderSpawn.value] });
  }
}
